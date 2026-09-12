import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminStatsRoute } from "./stats.route";
import { db } from "../../lib/db";
import { plans, subscriptions, importBatches, importBatchRows, roles, userRoles, user as userTable } from "../../db/schema";
import { createTestDataUsaha } from "../../lib/test-fixtures";

// § Fase 59 — dashboard admin. Angka agregat di sini GLOBAL (bukan
// per-user), jadi tes pakai pola DELTA (before/after) terhadap DB dev
// yang shared, BUKAN asersi nilai eksak — konsisten
// `docs/architecture/architecture-admin-dashboard.md`. Formula murni
// (growth %, efisiensi, agregasi bulanan/modul) sudah dites lengkap di
// `lib/admin-stats.test.ts` (tanpa DB) — di sini cuma verifikasi endpoint
// benar-benar memanggil query yang benar (permission gating + shape +
// beberapa delta kunci).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminStatsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Stats Test" }),
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
  const email = `admin-stats-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  if (!role) throw new Error("admin role belum ke-seed");
  await db.insert(userRoles).values({ userId: adminId, roleId: role.id }).onConflictDoNothing();
  return signIn(email);
}

async function makeCustomer() {
  const email = `admin-stats-customer-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const userId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "customer"));
  if (!role) throw new Error("customer role belum ke-seed");
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
  return userId;
}

async function get(path: string, cookie: string) {
  return testApp.handle(new Request(`http://localhost${path}`, { headers: { cookie } }));
}

describe("GET /admin/stats", () => {
  test("401 kalau tidak login", async () => {
    const res = await get("/admin/stats", "");
    expect(res.status).toBe(401);
  });

  test("userCount HANYA hitung role customer, TIDAK ikut admin/staff yang baru dibuat", async () => {
    const adminCookie = await makeAdminCookie();
    const before = (await (await get("/admin/stats", adminCookie)).json()) as { userCount: number };

    await makeCustomer(); // +1 seharusnya
    await makeAdminCookie(); // admin baru — TIDAK boleh nambah userCount

    const after = (await (await get("/admin/stats", adminCookie)).json()) as { userCount: number };
    expect(after.userCount).toBe(before.userCount + 1);
  });
});

describe("GET /admin/stats/monthly", () => {
  test("12 entri, kronologis, bulan terakhir = bulan berjalan (UTC)", async () => {
    const adminCookie = await makeAdminCookie();
    const res = await get("/admin/stats/monthly", adminCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { month: string }[];
    expect(body).toHaveLength(12);
    const now = new Date();
    const expectedCurrentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(body[11]!.month).toBe(expectedCurrentMonth);
  });

  test("user customer baru muncul sebagai +1 newUserCount di bulan berjalan", async () => {
    const adminCookie = await makeAdminCookie();
    const before = (await (await get("/admin/stats/monthly", adminCookie)).json()) as { month: string; newUserCount: number }[];
    const beforeCurrent = before[11]!.newUserCount;

    await makeCustomer();

    const after = (await (await get("/admin/stats/monthly", adminCookie)).json()) as { month: string; newUserCount: number }[];
    expect(after[11]!.newUserCount).toBe(beforeCurrent + 1);
  });
});

describe("GET /admin/stats/module-popularity", () => {
  test("subscription active baru nambah count modul terkait", async () => {
    const adminCookie = await makeAdminCookie();
    const userId = await makeCustomer();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Admin Stats Module Plan ${runId}`, price: 1000, durationDays: 30, modules: ["vendor_payable_account"] })
      .returning();

    const before = (await (await get("/admin/stats/module-popularity", adminCookie)).json()) as { moduleKey: string; count: number }[];
    const beforeCount = before.find((r) => r.moduleKey === "vendor_payable_account")?.count ?? 0;

    const dataUsahaId = await createTestDataUsaha(userId);
    await db.insert(subscriptions).values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId });

    const after = (await (await get("/admin/stats/module-popularity", adminCookie)).json()) as { moduleKey: string; count: number }[];
    const afterCount = after.find((r) => r.moduleKey === "vendor_payable_account")?.count ?? 0;
    expect(afterCount).toBe(beforeCount + 1);
  });
});

describe("GET /admin/stats/efficiency", () => {
  test("batch selesai HARI INI nambah rowsThisMonth & totalEfficiencySeconds sesuai jumlah baris sukses", async () => {
    const adminCookie = await makeAdminCookie();
    const userId = await makeCustomer();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Admin Stats Efficiency Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();

    const before = (await (await get("/admin/stats/efficiency", adminCookie)).json()) as { rowsThisMonth: number; totalEfficiencySeconds: number };

    const [batch] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: sub!.id, module: "purchase_invoice", fileName: "eff.xlsx", totalRows: 3, status: "completed", completedAt: new Date() })
      .returning();
    await db.insert(importBatchRows).values([
      { batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success" },
      { batchId: batch!.id, rowNumber: 2, rawData: {}, status: "success" },
      { batchId: batch!.id, rowNumber: 3, rawData: {}, status: "failed" }, // TIDAK dihitung
    ]);

    const after = (await (await get("/admin/stats/efficiency", adminCookie)).json()) as {
      rowsThisMonth: number;
      totalEfficiencySeconds: number;
      efficiencyPercent: number;
      rowGrowthPercent: number;
    };
    expect(after.rowsThisMonth).toBe(before.rowsThisMonth + 2);
    expect(after.totalEfficiencySeconds).toBeGreaterThan(before.totalEfficiencySeconds);
    expect(after.efficiencyPercent).toBeGreaterThanOrEqual(0);
    expect(after.efficiencyPercent).toBeLessThanOrEqual(100);
  });

  test("batch gagal-dini (completedAt null, status failed) TIDAK ikut hitung efisiensi", async () => {
    const adminCookie = await makeAdminCookie();
    const userId = await makeCustomer();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Admin Stats Early Fail Plan ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();

    const before = (await (await get("/admin/stats/efficiency", adminCookie)).json()) as { efficiencyPercent: number };

    // § batch "failed" (gagal-dini, Fase 56) TANPA completedAt — bukan
    // status completed/completed_with_errors, TIDAK boleh ikut agregasi.
    await db.insert(importBatches).values({ userId, subscriptionId: sub!.id, module: "sales_invoice", fileName: "fail.xlsx", totalRows: 100, status: "failed" });

    const after = (await (await get("/admin/stats/efficiency", adminCookie)).json()) as { efficiencyPercent: number };
    // efisiensi TIDAK BERUBAH sama sekali karena batch ini dikecualikan
    expect(after.efficiencyPercent).toBeCloseTo(before.efficiencyPercent, 5);
  });
});
