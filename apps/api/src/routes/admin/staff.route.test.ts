import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminStaffRoute } from "./staff.route";
import { db } from "../../lib/db";
import { roles, userRoles, user as userTable } from "../../db/schema";

// § Fase 29, ADR-0027 — provisioning akun sisi admin (Super Admin/Admin),
// TERPISAH dari `POST /admin/users` (yang selalu bikin akun customer).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminStaffRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Staff Route Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

async function signIn(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return res.headers.get("set-cookie") ?? "";
}

async function makeAdminCookie() {
  const email = `staff-route-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

async function makeStaffCookie() {
  const email = `staff-route-staff-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const staffId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "staff"));
  await db.insert(userRoles).values({ userId: staffId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

async function postStaff(cookie: string, body: Record<string, unknown>) {
  return testApp.handle(
    new Request("http://localhost/admin/staff", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /admin/staff", () => {
  test("200 — Super Admin bikin akun role staff (Admin terbatas)", async () => {
    const adminCookie = await makeAdminCookie();
    const email = `staff-route-target-staff-${runId}@test.local`;

    const res = await postStaff(adminCookie, { email, name: "New Staff", role: "staff" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; tempPassword: string };
    expect(body.tempPassword).toBeTruthy();

    const assignedRoles = await db.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, body.id));
    expect(assignedRoles.map((r) => r.name)).toEqual(["staff"]);
  });

  test("200 — Super Admin bikin akun role admin (Super Admin lain)", async () => {
    const adminCookie = await makeAdminCookie();
    const email = `staff-route-target-admin-${runId}@test.local`;

    const res = await postStaff(adminCookie, { email, name: "New Super Admin", role: "admin" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };

    const assignedRoles = await db.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, body.id));
    expect(assignedRoles.map((r) => r.name)).toEqual(["admin"]);
  });

  test("403 kalau caller role staff (Admin terbatas TIDAK boleh provision akun admin/staff baru)", async () => {
    const staffCookie = await makeStaffCookie();
    const res = await postStaff(staffCookie, { email: `staff-route-forbidden-${runId}@test.local`, name: "X", role: "staff" });
    expect(res.status).toBe(403);
  });

  test("403 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `staff-route-nologin-${runId}@test.local`, name: "X", role: "staff" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

// § diminta user 2026-09-05 — menu khusus tim internal, TERPISAH dari
// halaman Pengguna (customer).
describe("GET /admin/staff", () => {
  test("200 — hasil cuma role admin/staff, TIDAK termasuk customer", async () => {
    const adminCookie = await makeAdminCookie();
    const targetRes = await postStaff(adminCookie, { email: `staff-route-list-target-${runId}@test.local`, name: "List Target", role: "staff" });
    const target = (await targetRes.json()) as { id: string; email: string };

    const customerEmail = `staff-route-list-customer-${runId}@test.local`;
    const customerId = await signUp(customerEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: customerId, roleId: customerRole!.id }).onConflictDoNothing();

    const res = await testApp.handle(new Request("http://localhost/admin/staff", { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string; role: string; disabled: boolean }[] };
    const emails = body.users.map((u) => u.email);
    expect(emails).toContain(target.email);
    expect(emails).not.toContain(customerEmail);
    expect(body.users.find((u) => u.email === target.email)?.role).toBe("staff");
  });

  test("200 kalau caller role staff (Admin terbatas boleh LIHAT daftar tim, cuma tidak boleh tambah)", async () => {
    const staffCookie = await makeStaffCookie();
    const res = await testApp.handle(new Request("http://localhost/admin/staff", { headers: { cookie: staffCookie } }));
    expect(res.status).toBe(200);
  });

  test("403 kalau caller tidak punya users.view maupun users.manage", async () => {
    const email = `staff-route-noview-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/admin/staff", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});
