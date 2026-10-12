import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUserRolesRoute } from "./user-roles.route";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, invoices, session, user as userTable } from "../../db/schema";

// § Fase 189H, D17 — aksi peran dua arah oleh Super Admin: pratinjau dampak, konfirmasi ketik (email target) dicek server, tidak boleh diri sendiri / meninggalkan akun tanpa role,
// sesi target dicabut saat hak berubah, audit `role_change`, idempoten, izin terpusat.
const runId = Date.now();
const app = new Elysia().mount(auth.handler).use(adminUserRolesRoute);
let seq = 0;

async function makeUser(roleNames: ("admin" | "staff" | "customer")[], opts: { disabled?: boolean } = {}) {
  const label = `r${seq++}`;
  const email = `roleact-${runId}-${label}@test.local`;
  const res = await app.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Role Act ${label}` }) }));
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true, disabled: opts.disabled ?? false }).where(eq(userTable.id, user.id));
  for (const roleName of roleNames) {
    const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
    await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  }
  const signIn = await app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return { id: user.id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}

const post = (cookie: string | null, id: string, path: "" | "/preview", body: unknown) =>
  app.handle(new Request(`http://localhost/admin/users/${id}/roles${path}`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const rolesOf = async (id: string) => (await db.select({ n: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id))).map((r) => r.n).sort();

describe("POST /admin/users/:id/roles — izin", () => {
  test("tanpa login 401; Admin (staff) 403 — hanya Super Admin (users.manage)", async () => {
    const target = await makeUser(["customer"]);
    const staff = await makeUser(["staff"]);
    expect((await post(null, target.id, "/preview", { action: "grant_staff" })).status).toBe(401);
    expect((await post(staff.cookie, target.id, "/preview", { action: "grant_staff" })).status).toBe(403);
    expect((await post(staff.cookie, target.id, "", { action: "grant_staff", confirm: target.email })).status).toBe(403);
    expect(await rolesOf(target.id)).toEqual(["customer"]);
  });
});

describe("preview", () => {
  test("customer → staff: jadi internal otomatis, dampak uang & langganan dihitung; tidak mengubah apa pun", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["customer"]);
    await db.insert(invoices).values({ invoiceNumber: `INV/ROLE/${runId}/1`, userId: target.id, status: "paid", billToName: "T", subtotal: 250_000, total: 250_000, dueDate: new Date(), paidAt: new Date() });
    const res = await post(admin.cookie, target.id, "/preview", { action: "grant_staff" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { noop: boolean; becomesInternal: boolean; becomesCommercial: boolean; rolesAfter: string[]; impact: { paidTotal: number; paidInvoiceCount: number } };
    expect(body).toMatchObject({ noop: false, becomesInternal: true, becomesCommercial: false, rolesAfter: ["customer", "staff"] });
    expect(body.impact).toMatchObject({ paidTotal: 250_000, paidInvoiceCount: 1 });
    expect(await rolesOf(target.id)).toEqual(["customer"]);
  });
  test("akun tidak ada → 404; aksi tak dikenal → 422", async () => {
    const admin = await makeUser(["admin"]);
    expect((await post(admin.cookie, "tidak-ada", "/preview", { action: "grant_staff" })).status).toBe(404);
    expect((await post(admin.cookie, "tidak-ada", "/preview", { action: "grant_root" })).status).toBe(422);
  });
});

describe("apply", () => {
  test("konfirmasi salah/kosong → 400 CONFIRM_MISMATCH dan tidak ada perubahan", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["customer"]);
    for (const confirm of ["", "salah@test.local", target.email.slice(0, -1)]) {
      const res = await post(admin.cookie, target.id, "", { action: "grant_staff", confirm });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe("CONFIRM_MISMATCH");
    }
    expect(await rolesOf(target.id)).toEqual(["customer"]);
  });

  test("grant_staff: role bertambah, sesi target dicabut, audit role_change tercatat; konfirmasi tak peka huruf besar", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["customer"]);
    expect((await db.select().from(session).where(eq(session.userId, target.id))).length).toBeGreaterThan(0);
    const res = await post(admin.cookie, target.id, "", { action: "grant_staff", confirm: ` ${target.email.toUpperCase()} ` });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { changed: boolean }).changed).toBe(true);
    expect(await rolesOf(target.id)).toEqual(["customer", "staff"]);
    expect((await db.select().from(session).where(eq(session.userId, target.id))).length).toBe(0);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "role_change")));
    expect(log?.actorId).toBe(admin.id);
    expect(log?.changes).toMatchObject({ action: "grant_staff", from: ["customer"], to: ["customer", "staff"] });
  });

  test("idempoten: aksi yang sudah berlaku → changed:false, tanpa audit baru", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["customer", "staff"]);
    const res = await post(admin.cookie, target.id, "", { action: "grant_staff", confirm: target.email });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { changed: boolean }).changed).toBe(false);
    expect((await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "role_change")))).length).toBe(0);
  });

  test("revoke_staff dari akun customer+staff → kembali komersil, role customer utuh", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["customer", "staff"]);
    const prev = (await (await post(admin.cookie, target.id, "/preview", { action: "revoke_staff" })).json()) as { becomesCommercial: boolean };
    expect(prev.becomesCommercial).toBe(true);
    expect((await post(admin.cookie, target.id, "", { action: "revoke_staff", confirm: target.email })).status).toBe(200);
    expect(await rolesOf(target.id)).toEqual(["customer"]);
  });

  test("grant_customer pada admin/staf: bisa membuka app. (role ganda), tetap internal karena role", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    const prev = (await (await post(admin.cookie, target.id, "/preview", { action: "grant_customer" })).json()) as { becomesInternal: boolean; becomesCommercial: boolean };
    expect(prev).toMatchObject({ becomesInternal: false, becomesCommercial: false });
    expect((await post(admin.cookie, target.id, "", { action: "grant_customer", confirm: target.email })).status).toBe(200);
    expect(await rolesOf(target.id)).toEqual(["customer", "staff"]);
  });

  test("tidak boleh mengubah role diri sendiri (400) dan tidak meninggalkan akun tanpa role (400)", async () => {
    const admin = await makeUser(["admin", "customer"]);
    const self = await post(admin.cookie, admin.id, "", { action: "revoke_customer", confirm: admin.email });
    expect(self.status).toBe(400);
    expect(((await self.json()) as { code: string }).code).toBe("CANNOT_CHANGE_OWN_ROLE");
    const target = await makeUser(["customer"]);
    const last = await post(admin.cookie, target.id, "", { action: "revoke_customer", confirm: target.email });
    expect(last.status).toBe(400);
    expect(((await last.json()) as { code: string }).code).toBe("WOULD_LEAVE_NO_ROLE");
    expect(await rolesOf(target.id)).toEqual(["customer"]);
  });

  test("akun nonaktif tidak bisa diangkat jadi admin/staf (409)", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["customer"], { disabled: true });
    const res = await post(admin.cookie, target.id, "", { action: "grant_admin", confirm: target.email });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("ACCOUNT_DISABLED");
    expect(await rolesOf(target.id)).toEqual(["customer"]);
  });

  test("revoke_admin dari Super Admin lain yang bukan terakhir berhasil; role admin tercabut", async () => {
    const admin = await makeUser(["admin"]);
    const other = await makeUser(["admin", "customer"]);
    const res = await post(admin.cookie, other.id, "", { action: "revoke_admin", confirm: other.email });
    expect(res.status).toBe(200);
    expect(await rolesOf(other.id)).toEqual(["customer"]);
    void inArray;
  });
});
