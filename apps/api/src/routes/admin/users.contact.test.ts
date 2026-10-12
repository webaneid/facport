import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUsersRoute } from "./users.route";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, user as userTable } from "../../db/schema";

// § Fase 189A, ADR-0044 — `PATCH /admin/users/:id/contact` (Super Admin, `users.manage`) + kontak di daftar admin.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminUsersRoute);

async function makeUser(label: string, roleName: "admin" | "staff" | "customer") {
  const email = `admin-contact-${label}-${runId}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: `Admin Contact ${label}` }),
    }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
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

const patchContact = (cookie: string | null, id: string, body: unknown) =>
  testApp.handle(
    new Request(`http://localhost/admin/users/${id}/contact`, {
      method: "PATCH",
      headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const valid = { companyName: "PT Dikoreksi Admin", phone: "0813-1111-2222", whatsapp: "0813-1111-2222" };

describe("PATCH /admin/users/:id/contact", () => {
  test("tanpa login 401; Admin (staff, tanpa users.manage) 403; customer biasa 403", async () => {
    const target = await makeUser("t1", "customer");
    expect((await patchContact(null, target.id, valid)).status).toBe(401);
    const staff = await makeUser("staff1", "staff");
    expect((await patchContact(staff.cookie, target.id, valid)).status).toBe(403);
    const customer = await makeUser("cust1", "customer");
    expect((await patchContact(customer.cookie, target.id, valid)).status).toBe(403);
  });

  test("Super Admin: kontak tersimpan ternormalisasi + audit log nilai lama→baru", async () => {
    const admin = await makeUser("admin2", "admin");
    const target = await makeUser("t2", "customer");
    const res = await patchContact(admin.cookie, target.id, valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ companyName: "PT Dikoreksi Admin", phone: "+6281311112222", whatsapp: "+6281311112222" });

    const [row] = await db.select().from(userTable).where(eq(userTable.id, target.id));
    expect(row).toMatchObject({ companyName: "PT Dikoreksi Admin", phone: "+6281311112222", whatsapp: "+6281311112222" });

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, target.id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    expect(log!.actorId).toBe(admin.id);
    expect(log!.changes).toMatchObject({ contact: { from: { companyName: null, phone: null, whatsapp: null }, to: { phone: "+6281311112222" } } });
  });

  test("kontak tidak sah → 422 tanpa mengubah data; id tak dikenal → 404", async () => {
    const admin = await makeUser("admin3", "admin");
    const target = await makeUser("t3", "customer");
    const bad = await patchContact(admin.cookie, target.id, { ...valid, phone: "xyz" });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ code: "INVALID_CONTACT", field: "phone" });
    const [row] = await db.select({ phone: userTable.phone }).from(userTable).where(eq(userTable.id, target.id));
    expect(row!.phone).toBeNull();

    const missing = await patchContact(admin.cookie, "id-tidak-ada", valid);
    expect(missing.status).toBe(404);
  });
});

describe("GET /admin/users — kontak akun", () => {
  test("baris pengguna memuat companyName/phone/whatsapp", async () => {
    const admin = await makeUser("admin4", "admin");
    const target = await makeUser("t4", "customer");
    await patchContact(admin.cookie, target.id, valid);
    const res = await testApp.handle(new Request(`http://localhost/admin/users?search=${encodeURIComponent(target.email)}`, { headers: { cookie: admin.cookie } }));
    expect(res.status).toBe(200);
    const { users } = (await res.json()) as { users: { id: string; companyName: string | null; phone: string | null; whatsapp: string | null }[] };
    const found = users.find((u) => u.id === target.id);
    expect(found).toMatchObject({ companyName: "PT Dikoreksi Admin", phone: "+6281311112222", whatsapp: "+6281311112222" });
  });
});
