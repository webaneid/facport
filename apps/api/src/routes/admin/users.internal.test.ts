import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUsersRoute } from "./users.route";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, invoices, user as userTable } from "../../db/schema";

// § Fase 189G, ADR-0044 — daftar admin menampilkan status internal + filter tipe; aksi massal tandai/cabut internal (Super Admin, `users.manage`) dengan
// pratinjau dampak (uang yang keluar dari laporan) dan audit log per akun. Internal = flag ATAU role admin/staf (D16).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminUsersRoute);
let seq = 0;

async function makeUser(roleName: "admin" | "staff" | "customer", opts: { isInternal?: boolean } = {}) {
  const label = `${roleName}-${seq++}`;
  const email = `internal-list-${runId}-${label}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: `Internal List ${label}` }),
    }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true, isInternal: opts.isInternal ?? false }).where(eq(userTable.id, user.id));
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return { id: user.id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}

async function addInvoice(userId: string, status: "paid" | "unpaid", total: number) {
  await db.insert(invoices).values({
    invoiceNumber: `INV/TEST/${runId}/${seq++}`,
    userId,
    status,
    billToName: "Test",
    subtotal: total,
    total,
    dueDate: new Date(Date.now() + 86_400_000),
    paidAt: status === "paid" ? new Date() : null,
  });
}

const post = (cookie: string | null, path: string, body: unknown) =>
  testApp.handle(new Request(`http://localhost/admin/users/internal${path}`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const flagOf = async (id: string) => (await db.select({ f: userTable.isInternal }).from(userTable).where(eq(userTable.id, id)))[0]!.f;

describe("GET /admin/users — status internal & filter tipe", () => {
  test("baris memuat isInternal/internalFlag/internalReason; filter type=internal|commercial memisahkan", async () => {
    const admin = await makeUser("admin");
    const plain = await makeUser("customer");
    const flagged = await makeUser("customer", { isInternal: true });
    const dual = await makeUser("customer"); // customer + role admin → internal karena role
    const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));
    await db.insert(userRoles).values({ userId: dual.id, roleId: adminRole!.id }).onConflictDoNothing();

    const list = async (type: string) => {
      const res = await testApp.handle(new Request(`http://localhost/admin/users?search=internal-list-${runId}&type=${type}&limit=100`, { headers: { cookie: admin.cookie } }));
      expect(res.status).toBe(200);
      return ((await res.json()) as { users: { id: string; isInternal: boolean; internalFlag: boolean; internalReason: string | null }[] }).users;
    };
    const all = await list("all");
    const byId = new Map(all.map((u) => [u.id, u]));
    expect(byId.get(plain.id)).toMatchObject({ isInternal: false, internalFlag: false, internalReason: null });
    expect(byId.get(flagged.id)).toMatchObject({ isInternal: true, internalFlag: true, internalReason: "flag" });
    expect(byId.get(dual.id)).toMatchObject({ isInternal: true, internalFlag: false, internalReason: "role" });

    const internalIds = (await list("internal")).map((u) => u.id);
    expect(internalIds).toContain(flagged.id);
    expect(internalIds).toContain(dual.id);
    expect(internalIds).not.toContain(plain.id);
    const commercialIds = (await list("commercial")).map((u) => u.id);
    expect(commercialIds).toContain(plain.id);
    expect(commercialIds).not.toContain(flagged.id);
    expect(commercialIds).not.toContain(dual.id);
  });
});

describe("POST /admin/users/internal(/preview) — izin & validasi", () => {
  test("tanpa login 401; Admin (staff) 403; customer 403 — pratinjau maupun terapkan", async () => {
    const target = await makeUser("customer");
    const staff = await makeUser("staff");
    const customer = await makeUser("customer");
    const body = { userIds: [target.id], isInternal: true };
    for (const path of ["/preview", ""]) {
      expect((await post(null, path, body)).status).toBe(401);
      expect((await post(staff.cookie, path, body)).status).toBe(403);
      expect((await post(customer.cookie, path, body)).status).toBe(403);
    }
    expect(await flagOf(target.id)).toBe(false);
  });

  test("daftar kosong atau >100 akun → 422; bentuk body salah → 422; tidak ada yang berubah", async () => {
    const admin = await makeUser("admin");
    expect((await post(admin.cookie, "", { userIds: [], isInternal: true })).status).toBe(422);
    expect((await post(admin.cookie, "", { userIds: Array.from({ length: 101 }, (_, i) => `id-${i}`), isInternal: true })).status).toBe(422);
    expect((await post(admin.cookie, "/preview", { userIds: ["x"] })).status).toBe(422);
    expect((await post(admin.cookie, "", { userIds: "x", isInternal: true })).status).toBe(422);
  });
});

describe("pratinjau & penerapan massal", () => {
  async function scenario() {
    const admin = await makeUser("admin");
    const a = await makeUser("customer");
    const b = await makeUser("customer");
    const c = await makeUser("customer", { isInternal: true }); // sudah ditandai
    const d = await makeUser("staff"); // internal karena role
    await addInvoice(a.id, "paid", 100_000);
    await addInvoice(a.id, "paid", 200_000);
    await addInvoice(a.id, "unpaid", 50_000);
    await addInvoice(b.id, "paid", 999_999_999); // b tidak dihitung terpisah: tetap masuk dampak karena berubah komersil→internal
    return { admin, a, b, c, d };
  }

  test("pratinjau menandai internal: hitungan kategori + dampak uang; TIDAK mengubah apa pun", async () => {
    const { admin, a, b, c, d } = await scenario();
    const res = await post(admin.cookie, "/preview", { userIds: [a.id, b.id, c.id, d.id, "tidak-ada"], isInternal: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown> & { impact: Record<string, number> };
    // d (staff) internal karena ROLE: flag tidak akan ditulis (flagChanges hanya a & b), dilaporkan lewat internalByRole
    expect(body).toMatchObject({ requested: 5, found: 4, notFound: 1, flagChanges: 2, becomeInternal: 2, alreadyInState: 1, internalByRole: 1 });
    expect(body.impact).toMatchObject({ paidInvoiceCount: 3, paidTotal: 100_000 + 200_000 + 999_999_999, unpaidInvoices: 1 });
    for (const u of [a, b, c, d]) expect(await flagOf(u.id)).toBe(u.id === c.id);
  });

  test("terapkan: flag diset, audit log per akun yang berubah (bukan yang sudah di status itu), idempoten", async () => {
    const { admin, a, b, c, d } = await scenario();
    const res = await post(admin.cookie, "", { userIds: [a.id, b.id, c.id], isInternal: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ requested: 3, found: 3, changed: 2, unchanged: 1, notFound: 0 });
    // menandai akun ber-role staf tidak menulis flag (statusnya sudah internal karena role)
    const staffRes = await post(admin.cookie, "", { userIds: [d.id], isInternal: true });
    expect(await staffRes.json()).toMatchObject({ changed: 0, internalByRole: 1 });
    expect(await flagOf(d.id)).toBe(false);
    expect(await flagOf(a.id)).toBe(true);
    expect(await flagOf(b.id)).toBe(true);

    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "user"), inArray(auditLogs.entityId, [a.id, b.id, c.id])));
    const changedLogs = logs.filter((l) => (l.changes as { isInternal?: unknown })?.isInternal);
    expect(changedLogs.map((l) => l.entityId).sort()).toEqual([a.id, b.id].sort());
    expect(changedLogs[0]!.actorId).toBe(admin.id);
    expect(changedLogs[0]!.changes).toMatchObject({ isInternal: { from: false, to: true }, bulk: true });

    const again = await post(admin.cookie, "", { userIds: [a.id, b.id, c.id], isInternal: true });
    expect(await again.json()).toMatchObject({ changed: 0, unchanged: 3 });
  });

  test("cabut tanda: kembali komersil; akun role admin/staf tetap internal walau flag dicabut", async () => {
    const { admin, a, c, d } = await scenario();
    await post(admin.cookie, "", { userIds: [a.id, d.id], isInternal: true });
    // flag lama pada akun ber-role (mis. data warisan) tetap bisa dibersihkan lewat "cabut"
    await db.update(userTable).set({ isInternal: true }).where(eq(userTable.id, d.id));
    const preview = await post(admin.cookie, "/preview", { userIds: [a.id, c.id, d.id], isInternal: false });
    expect(await preview.json()).toMatchObject({ becomeCommercial: 2, internalByRole: 1 });

    const res = await post(admin.cookie, "", { userIds: [a.id, c.id, d.id], isInternal: false });
    expect(await res.json()).toMatchObject({ changed: 3 });
    expect(await flagOf(a.id)).toBe(false);
    expect(await flagOf(c.id)).toBe(false);
    expect(await flagOf(d.id)).toBe(false);

    const list = await testApp.handle(new Request(`http://localhost/admin/users?search=internal-list-${runId}&limit=100`, { headers: { cookie: admin.cookie } }));
    const users = ((await list.json()) as { users: { id: string; isInternal: boolean }[] }).users;
    expect(users.find((u) => u.id === a.id)?.isInternal).toBe(false);
  });
});
