import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUsersRoute } from "./users.route";
import { db } from "../../lib/db";
import { plans, invoices, orders, subscriptions, roles, userRoles, permissions, rolePermissions, user as userTable, session } from "../../db/schema";

// § Fase 18 — "Unifikasi Onboarding Admin": POST /admin/users diperluas
// terima planIds opsional + markAsPaid, 2 jalur hasil akhir ("Kirim
// Invoice" vs "Tandai Sudah Dibayar"). Test ini verifikasi KEDUA jalur
// PLUS perilaku lama (tanpa planIds) tetap tidak berubah.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminUsersRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Users Test" }),
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
  const email = `admin-users-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  if (!role) throw new Error("admin role belum ke-seed");
  await db.insert(userRoles).values({ userId: adminId, roleId: role.id }).onConflictDoNothing();
  return signIn(email);
}

async function postAdminUser(cookie: string, body: Record<string, unknown>) {
  return testApp.handle(
    new Request("http://localhost/admin/users", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

// § Fase 29, ADR-0027 — role "staff" (label UI "Admin") dapat semua
// permission admin KECUALI `users.manage`.
async function makeStaffCookie() {
  const email = `admin-users-staff-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const staffId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "staff"));
  if (!role) throw new Error("staff role belum ke-seed");
  await db.insert(userRoles).values({ userId: staffId, roleId: role.id }).onConflictDoNothing();
  return signIn(email);
}

async function makePlainCustomer() {
  const email = `admin-users-target-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const userId = await signUp(email);
  return { userId, email };
}

describe("POST /admin/users", () => {
  test("201-ish: bikin user TANPA planIds — perilaku lama tidak berubah, tidak ada invoice/order/subscription", async () => {
    const adminCookie = await makeAdminCookie();
    const email = `admin-users-plain-${runId}@test.local`;

    const res = await postAdminUser(adminCookie, { email, name: "Plain User" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; tempPassword: string; invoiceId?: string; subscriptionIds?: string[] };
    expect(body.tempPassword).toBeTruthy();
    expect(body.invoiceId).toBeUndefined();
    expect(body.subscriptionIds).toBeUndefined();

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, body.id));
    expect(subs.length).toBe(0);
  });

  test("404 PLAN_NOT_FOUND kalau salah satu planId tidak ada — user TIDAK ikut dibuat", async () => {
    const adminCookie = await makeAdminCookie();
    const email = `admin-users-badplan-${runId}@test.local`;

    const res = await postAdminUser(adminCookie, { email, name: "Bad Plan User", planIds: ["00000000-0000-0000-0000-000000000000"] });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_FOUND");

    const [created] = await db.select().from(userTable).where(eq(userTable.email, email));
    expect(created).toBeUndefined();
  });

  test("200 'Kirim Invoice' (default, markAsPaid tidak diisi) — bikin invoice+order status unpaid/pending, TIDAK ada subscription", async () => {
    const adminCookie = await makeAdminCookie();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Onboard Invoice Plan ${runId}`, price: 150000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const email = `admin-users-invoice-${runId}@test.local`;

    const res = await postAdminUser(adminCookie, { email, name: "Invoice User", planIds: [plan!.id] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; invoiceId: string; orderId: string; amountDue: number };
    expect(body.invoiceId).toBeTruthy();
    expect(body.orderId).toBeTruthy();

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(invoice!.status).toBe("unpaid");
    expect(invoice!.billToName).toBe("Invoice User");
    expect(invoice!.total).toBe(150000);

    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
    expect(order!.status).toBe("pending");
    expect(body.amountDue).toBe(150000 + order!.uniqueCode);

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, body.id));
    expect(subs.length).toBe(0);
  });

  test("200 'Tandai Sudah Dibayar' (markAsPaid: true) — N subscription LANGSUNG aktif, TIDAK ada invoice/order sama sekali", async () => {
    const adminCookie = await makeAdminCookie();
    const [planA] = await db
      .insert(plans)
      .values({ name: `Onboard Paid Plan A ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [planB] = await db
      .insert(plans)
      .values({ name: `Onboard Paid Plan B ${runId}`, price: 200000, durationDays: 365, modules: ["journal_voucher"] })
      .returning();
    const email = `admin-users-paid-${runId}@test.local`;

    const res = await postAdminUser(adminCookie, { email, name: "Paid User", planIds: [planA!.id, planB!.id], markAsPaid: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; subscriptionIds: string[]; invoiceId?: string };
    expect(body.subscriptionIds.length).toBe(2);
    expect(body.invoiceId).toBeUndefined();

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, body.id));
    expect(subs.length).toBe(2);
    for (const sub of subs) {
      expect(sub.status).toBe("active");
      expect(sub.orderId).toBeNull();
      expect(sub.invoiceItemId).toBeNull();
    }
    // endAt beda per plan (durationDays beda) — bukan shared/first-item value
    const durations = subs.map((s) => Math.round((s.endAt!.getTime() - s.startAt!.getTime()) / (24 * 60 * 60 * 1000)));
    expect(durations.sort((a, b) => a - b)).toEqual([30, 365]);

    const invoicesForUser = await db.select().from(invoices).where(eq(invoices.userId, body.id));
    expect(invoicesForUser.length).toBe(0);
  });

  test("403 kalau bukan admin", async () => {
    const email = `admin-users-forbidden-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await postAdminUser(cookie, { email: `target-${runId}@test.local`, name: "Target" });
    expect(res.status).toBe(403);
  });

  // § security review 2026-09-04 (High) — role custom yang punya
  // "users.manage" TAPI TIDAK "subscriptions.manage" (skenario realistis
  // RBAC dinamis project ini, mis. "staf onboarding") HARUS TETAP
  // ditolak pakai `markAsPaid`, meski punya izin bikin user biasa.
  test("403 FORBIDDEN_MARK_AS_PAID kalau caller punya users.manage TAPI TIDAK punya subscriptions.manage — user TIDAK ikut dibuat", async () => {
    const [usersManagePerm] = await db.select().from(permissions).where(eq(permissions.key, "users.manage"));
    if (!usersManagePerm) throw new Error("permission users.manage belum ke-seed");

    const [customRole] = await db.insert(roles).values({ name: `onboarding-staff-${runId}`, isSystem: false }).returning();
    await db.insert(rolePermissions).values({ roleId: customRole!.id, permissionId: usersManagePerm.id });

    const email = `admin-users-limited-${runId}@test.local`;
    const limitedUserId = await signUp(email);
    await db.insert(userRoles).values({ userId: limitedUserId, roleId: customRole!.id });
    const limitedCookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Onboard Bypass Plan ${runId}`, price: 100000, durationDays: 30, modules: ["sales_receipt"] })
      .returning();
    const targetEmail = `admin-users-bypass-target-${runId}@test.local`;

    const res = await postAdminUser(limitedCookie, { email: targetEmail, name: "Bypass Target", planIds: [plan!.id], markAsPaid: true });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("FORBIDDEN_MARK_AS_PAID");

    const [created] = await db.select().from(userTable).where(eq(userTable.email, targetEmail));
    expect(created).toBeUndefined();
  });

  test("200 markAsPaid TETAP jalan normal kalau caller punya subscriptions.manage juga (admin role py semua permission)", async () => {
    const adminCookie = await makeAdminCookie();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Onboard Allowed Plan ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_payment"] })
      .returning();
    const email = `admin-users-allowed-${runId}@test.local`;

    const res = await postAdminUser(adminCookie, { email, name: "Allowed User", planIds: [plan!.id], markAsPaid: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscriptionIds: string[] };
    expect(body.subscriptionIds.length).toBe(1);
  });
});

// § Fase 29, ADR-0027 — permission split: `users.view` (admin+staff)
// vs `users.manage` (admin/Super Admin saja).
describe("GET /admin/users — permission split users.view vs users.manage", () => {
  test("200 kalau role staff (Admin terbatas, punya users.view TAPI TIDAK users.manage)", async () => {
    const staffCookie = await makeStaffCookie();
    const res = await testApp.handle(new Request("http://localhost/admin/users", { headers: { cookie: staffCookie } }));
    expect(res.status).toBe(200);
  });

  test("403 kalau role TIDAK punya users.view maupun users.manage", async () => {
    const email = `admin-users-noview-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/admin/users", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  // § diminta user 2026-09-05 — halaman ini SEKARANG cuma customer, akun
  // sisi-admin (Super Admin/Admin) punya menu sendiri (`GET /admin/staff`).
  test("hasil TIDAK termasuk akun role admin/staff, HANYA customer", async () => {
    const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));
    const adminEmail = `admin-users-excl-admin-${runId}@test.local`;
    const adminId = await signUp(adminEmail);
    await db.insert(userRoles).values({ userId: adminId, roleId: adminRole!.id }).onConflictDoNothing();
    const adminCookie = await signIn(adminEmail);

    const [staffRole] = await db.select().from(roles).where(eq(roles.name, "staff"));
    const staffEmail = `admin-users-excl-staff-${runId}@test.local`;
    const staffId = await signUp(staffEmail);
    await db.insert(userRoles).values({ userId: staffId, roleId: staffRole!.id }).onConflictDoNothing();

    const customerEmail = `admin-users-onlycustomer-${runId}@test.local`;
    const customerId = await signUp(customerEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: customerId, roleId: customerRole!.id }).onConflictDoNothing();

    const res = await testApp.handle(new Request("http://localhost/admin/users?limit=100", { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string }[] };
    const emails = body.users.map((u) => u.email);
    expect(emails).toContain(customerEmail);
    expect(emails).not.toContain(adminEmail);
    expect(emails).not.toContain(staffEmail);
  });
});

describe("PATCH /admin/users/:id/disable & /enable", () => {
  test("403 kalau caller role staff (TIDAK punya users.manage)", async () => {
    const staffCookie = await makeStaffCookie();
    const { userId } = await makePlainCustomer();
    const res = await testApp.handle(
      new Request(`http://localhost/admin/users/${userId}/disable`, { method: "PATCH", headers: { cookie: staffCookie } }),
    );
    expect(res.status).toBe(403);
  });

  test("200 — Super Admin nonaktifkan customer: disabled=true, SEMUA sesi user itu terhapus", async () => {
    const adminCookie = await makeAdminCookie();
    const { userId, email } = await makePlainCustomer();
    await signIn(email); // bikin 1 sesi aktif buat user target

    const before = await db.select().from(session).where(eq(session.userId, userId));
    expect(before.length).toBeGreaterThan(0);

    const res = await testApp.handle(
      new Request(`http://localhost/admin/users/${userId}/disable`, { method: "PATCH", headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(userTable).where(eq(userTable.id, userId));
    expect(updated!.disabled).toBe(true);

    const after = await db.select().from(session).where(eq(session.userId, userId));
    expect(after.length).toBe(0);
  });

  test("400 CANNOT_DISABLE_SELF kalau Super Admin coba nonaktifkan akun sendiri", async () => {
    const email = `admin-users-selfdisable-${runId}@test.local`;
    const adminId = await signUp(email);
    const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
    await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request(`http://localhost/admin/users/${adminId}/disable`, { method: "PATCH", headers: { cookie } }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CANNOT_DISABLE_SELF");
  });

  // § security review 2026-09-05 (High, sudah diperbaiki) — SEBELUMNYA
  // test ini mensimulasikan "caller tidak terhitung admin aktif" dengan
  // nonaktifkan BARIS caller langsung via SQL sambil sesi (cookie)-nya
  // tetap dipakai — itu PERSIS celah yang ditemukan security-auditor
  // (`permissionPlugin` tidak cek `disabled`) dan sudah ditutup
  // (`lib/permission.ts` § `isDisabled()`). Konsekuensinya: skenario
  // "CANNOT_DISABLE_LAST_SUPER_ADMIN" SEKARANG TIDAK BISA dipicu lewat
  // endpoint publik oleh caller mana pun yang valid — caller WAJIB
  // admin AKTIF (baru lolos `users.manage`), jadi begitu dia mencoba
  // nonaktifkan admin lain, caller sendiri TETAP terhitung aktif
  // (count minimal 2 SEBELUM aksi, sisa minimal 1 SESUDAH aksi) —
  // guard ini jadi murni defense-in-depth utk skenario di luar endpoint
  // (mis. perubahan role/permission manual lewat DB/skrip). Diverifikasi
  // di bawah lewat jalur NORMAL: 2 admin aktif, salah satu nonaktifkan
  // yang lain, sisa TEPAT 1 admin aktif (guard tidak salah menolak
  // operasi yang sah).
  test("200 — Super Admin nonaktifkan Super Admin LAIN (bukan terakhir): sisa tepat 1 admin aktif", async () => {
    const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));

    const callerEmail = `admin-users-2admin-caller-${runId}@test.local`;
    const callerId = await signUp(callerEmail);
    await db.insert(userRoles).values({ userId: callerId, roleId: adminRole!.id }).onConflictDoNothing();
    const callerCookie = await signIn(callerEmail);

    const targetEmail = `admin-users-2admin-target-${runId}@test.local`;
    const targetId = await signUp(targetEmail);
    await db.insert(userRoles).values({ userId: targetId, roleId: adminRole!.id }).onConflictDoNothing();

    const res = await testApp.handle(
      new Request(`http://localhost/admin/users/${targetId}/disable`, { method: "PATCH", headers: { cookie: callerCookie } }),
    );
    expect(res.status).toBe(200);

    const [target] = await db.select().from(userTable).where(eq(userTable.id, targetId));
    expect(target!.disabled).toBe(true);
    const [caller] = await db.select().from(userTable).where(eq(userTable.id, callerId));
    expect(caller!.disabled).toBe(false); // caller TIDAK ikut ter-nonaktifkan, tetap admin aktif
  });

  test("200 — enable balikin disabled jadi false", async () => {
    const adminCookie = await makeAdminCookie();
    const { userId } = await makePlainCustomer();
    await db.update(userTable).set({ disabled: true }).where(eq(userTable.id, userId));

    const res = await testApp.handle(
      new Request(`http://localhost/admin/users/${userId}/enable`, { method: "PATCH", headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(200);
    const [updated] = await db.select().from(userTable).where(eq(userTable.id, userId));
    expect(updated!.disabled).toBe(false);
  });
});
