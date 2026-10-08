import { boss } from "../../lib/queue";
import { describe, test, expect, spyOn } from "bun:test";
import { addCalendarMonths } from "../../lib/subscription-period";
import { getCompanyTimezone } from "../../lib/company-timezone";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUsersRoute } from "./users.route";
import { db } from "../../lib/db";
import { plans, invoices, invoiceItems, orders, subscriptions, roles, userRoles, permissions, rolePermissions, user as userTable, session } from "../../db/schema";
import { createTestDataUsaha } from "../../lib/test-fixtures";

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

  // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 (audit menyeluruh) — pola sama
  // `admin/staff.route.ts`: Better Auth balikin user SINTETIS/PALSU (bukan
  // throw) untuk email yang sudah terdaftar — tanpa deteksi ini, kode
  // lanjut pakai id palsu itu untuk insert `userRoles`/dst → FK violation
  // → 500 generik. TIDAK PERNAH ada test untuk skenario ini sebelumnya.
  test("400 EMAIL_ALREADY_EXISTS (BUKAN 500) kalau email SUDAH terdaftar", async () => {
    const adminCookie = await makeAdminCookie();
    const email = `admin-users-dup-${runId}@test.local`;
    await signUp(email);

    const res = await postAdminUser(adminCookie, { email, name: "Siapa Saja" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("EMAIL_ALREADY_EXISTS");
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
      .values({ name: `Onboard Paid Plan B ${runId}`, price: 200000, durationDays: 365, interval: "yearly", modules: ["journal_voucher"] })
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
    // § Fase 174, ADR-0041 — akhir dihitung kalender dari periode paket (bulanan +1 bulan, tahunan +12 bulan), mulai sama untuk semua paket.
    const tz = await getCompanyTimezone();
    const byPlan = new Map(subs.map((s) => [s.planId, s]));
    const a = byPlan.get(planA!.id)!;
    const b = byPlan.get(planB!.id)!;
    expect(a.endAt!.getTime()).toBe(addCalendarMonths(a.startAt!, 1, tz).getTime());
    expect(b.endAt!.getTime()).toBe(addCalendarMonths(b.startAt!, 12, tz).getTime());
    expect(a.periodMonths).toBe(1);
    expect(b.periodMonths).toBe(12);
    expect(a.startAt!.getTime()).toBe(b.startAt!.getTime());

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

  // § bug ditemukan 2026-09-08 (feedback user, 2 klien production dengan
  // langganan SEMUA modul cuma tampil 1 di /admin/users) — `subByUser`
  // sebelumnya `Map` 1-value-per-user, overwrite diam-diam kalau user
  // punya >1 subscription aktif.
  test("user dengan >1 subscription aktif — SEMUA muncul di activeSubscriptions, bukan cuma 1", async () => {
    const adminCookie = await makeAdminCookie();
    const { userId } = await makePlainCustomer();
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();
    const [planA] = await db
      .insert(plans)
      .values({ name: `Multi Sub Plan A ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [planB] = await db
      .insert(plans)
      .values({ name: `Multi Sub Plan B ${runId}`, price: 200000, durationDays: 30, modules: ["journal_voucher"] })
      .returning();
    const now = new Date();
    const endAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dataUsahaId = await createTestDataUsaha(userId);
    await db.insert(subscriptions).values([
      { userId, planId: planA!.id, status: "active", startAt: now, endAt, dataUsahaId },
      { userId, planId: planB!.id, status: "active", startAt: now, endAt, dataUsahaId },
    ]);

    const res = await testApp.handle(new Request("http://localhost/admin/users?limit=100", { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { id: string; activeSubscriptions: { planName: string }[] }[] };
    const target = body.users.find((u) => u.id === userId);
    expect(target).toBeTruthy();
    const planNames = target!.activeSubscriptions.map((s) => s.planName).sort();
    expect(planNames).toEqual([planA!.name, planB!.name].sort());
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

  test("nonaktifkan → email pemberitahuan ke user; aktifkan kembali → email 'diaktifkan kembali'; ulang tanpa perubahan status TIDAK mengirim email lagi", async () => {
    const adminCookie = await makeAdminCookie();
    const { userId, email } = await makePlainCustomer();
    const sent: { to: string; subject: string; html: string }[] = [];
    const spy = spyOn(boss, "send").mockImplementation((async (_n: string, data: unknown) => {
      sent.push(data as { to: string; subject: string; html: string });
      return "job-id";
    }) as never);
    const call = (action: "disable" | "enable") => testApp.handle(new Request(`http://localhost/admin/users/${userId}/${action}`, { method: "PATCH", headers: { cookie: adminCookie } }));
    try {
      expect((await call("disable")).status).toBe(200);
      const mail = sent.find((m) => m.to === email)!;
      expect(mail.subject).toContain("dinonaktifkan");
      expect(mail.html).toContain("User Anda di non aktifkan oleh sistem kami");
      expect(mail.html).toContain("hubungi admin");
      const count = sent.length;
      expect((await call("disable")).status).toBe(200); // sudah nonaktif → tanpa email baru
      expect(sent.length).toBe(count);

      expect((await call("enable")).status).toBe(200);
      expect(sent.at(-1)!.subject).toContain("diaktifkan kembali");
      const count2 = sent.length;
      expect((await call("enable")).status).toBe(200);
      expect(sent.length).toBe(count2);
      expect((await testApp.handle(new Request(`http://localhost/admin/users/nope-${runId}/disable`, { method: "PATCH", headers: { cookie: adminCookie } }))).status).toBe(404);
    } finally {
      spy.mockRestore();
    }
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

// § Fase 178 — Tambah User: mode pembayaran `payment` ("invoice" | "paid_invoice" | "free"); `markAsPaid` lama = "free".
describe("POST /admin/users — mode pembayaran (Fase 178)", () => {
  type Created = { id: string; invoiceId?: string; orderId?: string; amountDue?: number; subscriptionIds?: string[] };

  test("paid_invoice: invoice LUNAS otomatis + langganan aktif tertaut ke order & item invoice (ada catatan invoice, beda dari free)", async () => {
    const cookie = await makeAdminCookie();
    const [planA] = await db.insert(plans).values({ name: `PaidInv Plan A ${runId}`, price: 100000, durationDays: 30, interval: "monthly", modules: ["sales_invoice"] }).returning();
    const [planB] = await db.insert(plans).values({ name: `PaidInv Plan B ${runId}`, price: 200000, durationDays: 365, interval: "yearly", modules: ["purchase_invoice"] }).returning();
    const res = await postAdminUser(cookie, { email: `admin-users-paidinv-${runId}@test.local`, name: "Paid Invoice User", planIds: [planA!.id, planB!.id], payment: "paid_invoice" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Created;
    expect(body.invoiceId).toBeTruthy();
    expect(body.orderId).toBeTruthy();
    expect(body.subscriptionIds).toHaveLength(2);

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId!));
    expect(inv).toMatchObject({ status: "paid", total: 300000 });
    expect(inv!.paidAt).toBeTruthy();
    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId!));
    expect(order).toMatchObject({ status: "paid", method: "manual", uniqueCode: 0 });
    expect(await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, body.invoiceId!))).toHaveLength(2);
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, body.id));
    expect(subs).toHaveLength(2);
    expect(subs.every((x) => x.status === "active" && x.orderId === body.orderId && x.invoiceItemId !== null)).toBe(true);
    const tz = await getCompanyTimezone();
    const yearly = subs.find((x) => x.planId === planB!.id)!;
    expect(yearly.endAt!.getTime()).toBe(addCalendarMonths(yearly.startAt!, 12, tz).getTime());
  });

  test("invoice (default tanpa payment/markAsPaid): invoice belum dibayar + order pending, TANPA langganan; payment 'invoice' eksplisit sama", async () => {
    const cookie = await makeAdminCookie();
    const [plan] = await db.insert(plans).values({ name: `SendInv Plan ${runId}`, price: 150000, durationDays: 30, interval: "monthly", modules: ["journal_voucher"] }).returning();
    const res = await postAdminUser(cookie, { email: `admin-users-sendinv-${runId}@test.local`, name: "Send Invoice", planIds: [plan!.id], payment: "invoice" });
    const body = (await res.json()) as Created;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId!));
    expect(inv!.status).toBe("unpaid");
    expect((await db.select().from(orders).where(eq(orders.id, body.orderId!)))[0]!.status).toBe("pending");
    expect(body.subscriptionIds).toBeUndefined();
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, body.id))).toHaveLength(0);
  });

  test("free (dan markAsPaid lama): langganan aktif TANPA invoice sama sekali", async () => {
    const cookie = await makeAdminCookie();
    const [plan] = await db.insert(plans).values({ name: `FreeMode Plan ${runId}`, price: 100000, durationDays: 30, interval: "monthly", modules: ["sales_receipt"] }).returning();
    const free = (await (await postAdminUser(cookie, { email: `admin-users-free-${runId}@test.local`, name: "Free", planIds: [plan!.id], payment: "free" })).json()) as Created;
    expect(free.invoiceId).toBeUndefined();
    expect(await db.select().from(invoices).where(eq(invoices.userId, free.id))).toHaveLength(0);
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, free.id))).toHaveLength(1);

    const [plan2] = await db.insert(plans).values({ name: `FreeMode Plan2 ${runId}`, price: 100000, durationDays: 30, interval: "monthly", modules: ["purchase_payment"] }).returning();
    const legacy = (await (await postAdminUser(cookie, { email: `admin-users-legacy-${runId}@test.local`, name: "Legacy", planIds: [plan2!.id], markAsPaid: true })).json()) as Created;
    expect(legacy.invoiceId).toBeUndefined();
    expect(legacy.subscriptionIds).toHaveLength(1);
  });

  test("403 FORBIDDEN_MARK_AS_PAID untuk paid_invoice & free kalau caller TIDAK punya subscriptions.manage (user tidak ikut dibuat); invoice biasa tetap boleh", async () => {
    const [usersManagePerm] = await db.select().from(permissions).where(eq(permissions.key, "users.manage"));
    const [role] = await db.insert(roles).values({ name: `onboarding-staff-mode-${runId}`, isSystem: false }).returning();
    await db.insert(rolePermissions).values({ roleId: role!.id, permissionId: usersManagePerm!.id });
    const email = `admin-users-limited-mode-${runId}@test.local`;
    const staffId = await signUp(email);
    await db.insert(userRoles).values({ userId: staffId, roleId: role!.id });
    const cookie = await signIn(email);
    const [plan] = await db.insert(plans).values({ name: `Limited Mode Plan ${runId}`, price: 100000, durationDays: 30, interval: "monthly", modules: ["receive_item"] }).returning();

    for (const payment of ["paid_invoice", "free"]) {
      const targetEmail = `admin-users-limited-target-${payment}-${runId}@test.local`;
      const res = await postAdminUser(cookie, { email: targetEmail, name: "Target", planIds: [plan!.id], payment });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe("FORBIDDEN_MARK_AS_PAID");
      expect(await db.select().from(userTable).where(eq(userTable.email, targetEmail))).toHaveLength(0);
    }
    const ok = await postAdminUser(cookie, { email: `admin-users-limited-ok-${runId}@test.local`, name: "Ok", planIds: [plan!.id], payment: "invoice" });
    expect(ok.status).toBe(200);
  });
});

// § Fase 181, ADR-0042 — Tambah User: "perpanjangan berikutnya" untuk paket MODUL (seat diabaikan).
describe("POST /admin/users — renewalInterval (Fase 181)", () => {
  type Created = { id: string; invoiceId?: string; subscriptionIds?: string[] };
  test("paid_invoice & free: penanda terpasang pada langganan modul; seat tidak ditandai", async () => {
    const cookie = await makeAdminCookie();
    const [mod] = await db.insert(plans).values({ name: `Renewal User Mod ${runId}`, price: 1000, durationDays: 30, interval: "monthly", modules: ["sales_order"] }).returning();
    const [seat] = await db.insert(plans).values({ name: `Renewal User Seat ${runId}`, price: 100, durationDays: 30, interval: "monthly", modules: [], kind: "seat_addon" }).returning();
    const paid = (await (await postAdminUser(cookie, { email: `admin-users-renew-paid-${runId}@test.local`, name: "R", planIds: [mod!.id, seat!.id], payment: "paid_invoice", renewalInterval: "yearly" })).json()) as Created;
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, paid.id));
    expect(subs.find((x) => x.planId === mod!.id)!.renewalInterval).toBe("yearly");
    expect(subs.find((x) => x.planId === seat!.id)!.renewalInterval).toBeNull();

    const [mod2] = await db.insert(plans).values({ name: `Renewal User Mod2 ${runId}`, price: 1000, durationDays: 30, interval: "monthly", modules: ["sales_return"] }).returning();
    const free = (await (await postAdminUser(cookie, { email: `admin-users-renew-free-${runId}@test.local`, name: "R", planIds: [mod2!.id], payment: "free", renewalInterval: "monthly" })).json()) as Created;
    expect((await db.select().from(subscriptions).where(eq(subscriptions.userId, free.id)))[0]!.renewalInterval).toBe("monthly");
  });

  test("invoice (kirim invoice): niat di-snapshot ke item invoice (langganan baru dibuat saat pembayaran disetujui); tanpa renewalInterval → null", async () => {
    const cookie = await makeAdminCookie();
    const [mod] = await db.insert(plans).values({ name: `Renewal User Inv ${runId}`, price: 1000, durationDays: 30, interval: "monthly", modules: ["delivery_order"] }).returning();
    const withIntent = (await (await postAdminUser(cookie, { email: `admin-users-renew-inv-${runId}@test.local`, name: "R", planIds: [mod!.id], payment: "invoice", renewalInterval: "yearly" })).json()) as Created;
    expect((await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, withIntent.invoiceId!)))[0]!.renewalInterval).toBe("yearly");
    const without = (await (await postAdminUser(cookie, { email: `admin-users-renew-inv2-${runId}@test.local`, name: "R", planIds: [mod!.id], payment: "invoice" })).json()) as Created;
    expect((await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, without.invoiceId!)))[0]!.renewalInterval).toBeNull();
  });

  test("nilai renewalInterval di luar monthly/yearly ditolak (422)", async () => {
    const cookie = await makeAdminCookie();
    const res = await postAdminUser(cookie, { email: `admin-users-renew-bad-${runId}@test.local`, name: "R", renewalInterval: "weekly" });
    expect(res.status).toBe(422);
  });
});
