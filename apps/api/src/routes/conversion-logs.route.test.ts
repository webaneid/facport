import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, plans, subscriptions, memberSeats, settings, conversionLogs } from "../db/schema";
import { conversionLogsRoute } from "./conversion-logs.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { TRIAL_MAX_ROWS_SETTING_KEY } from "../lib/trial";

// § Fase 150, ADR-0038 — route ini REPLIKASI MANUAL logic gating `moduleAccess()` macro (§ komentar sumber
// `conversion-logs.route.ts` — macro butuh moduleKey statis, endpoint ini terima moduleKey DINAMIS dari body).
// Test di sini fokus ke perilaku REPLIKASI itu (bukan menguji ulang macro-nya sendiri, sudah dites lengkap di
// `lib/subscription-gate.test.ts`) + perilaku KHUSUS route ini (kuota trial, scoping GET per Data Usaha).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(conversionLogsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Conversion Logs Test" }),
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

async function subscribeKonverter(userId: string, moduleKey: string, isTrial = false) {
  const [plan] = await db
    .insert(plans)
    .values({ name: `KRT ${runId}-${moduleKey}-${crypto.randomUUID().slice(0, 8)}`, price: 1000, durationDays: 30, modules: [moduleKey] })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  await db.insert(subscriptions).values({
    userId,
    planId: plan!.id,
    status: "active",
    startAt: new Date(),
    endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isTrial,
    dataUsahaId,
  });
  return dataUsahaId;
}

function post(body: unknown, cookie: string, dataUsahaId?: string) {
  return testApp.handle(
    new Request("http://localhost/me/conversion-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, ...(dataUsahaId ? { "x-data-usaha-id": dataUsahaId } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /me/conversion-logs", () => {
  test("400 INVALID_MODULE_KEY kalau moduleKey bukan salah satu dari 16 Varian Konverter", async () => {
    const email = `conv-route-invalidkey-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await post({ moduleKey: "purchase_invoice", fileName: "a.xlsx", rowCount: 1 }, cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_MODULE_KEY");
  });

  test("403 MODULE_NOT_SUBSCRIBED kalau user tidak punya subscription Varian ini sama sekali", async () => {
    const email = `conv-route-nosub-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await post({ moduleKey: "konverter_requisition", fileName: "a.xlsx", rowCount: 1 }, cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("MODULE_NOT_SUBSCRIBED");
  });

  test("200 + baris tercatat kalau subscription Varian ini aktif", async () => {
    const email = `conv-route-ok-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await subscribeKonverter(userId, "konverter_requisition");

    const res = await post({ moduleKey: "konverter_requisition", fileName: "req.xlsx", rowCount: 7 }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    const [row] = await db.select().from(conversionLogs).where(eq(conversionLogs.id, body.id));
    expect(row?.rowCount).toBe(7);
    expect(row?.fileName).toBe("req.xlsx");
  });

  test("409 DATA_USAHA_REQUIRED kalau Varian ini aktif di 2 Data Usaha TANPA header pemilih", async () => {
    const email = `conv-route-ambigu-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await subscribeKonverter(userId, "konverter_sales_order");
    await subscribeKonverter(userId, "konverter_sales_order");

    const res = await post({ moduleKey: "konverter_sales_order", fileName: "a.xlsx", rowCount: 1 }, cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_REQUIRED");
  });

  test("header memilih salah satu Data Usaha yang ambigu → 200, log tercatat di Data Usaha itu", async () => {
    const email = `conv-route-pilih-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const duA = await subscribeKonverter(userId, "konverter_purchase_order");
    await subscribeKonverter(userId, "konverter_purchase_order");

    const res = await post({ moduleKey: "konverter_purchase_order", fileName: "a.xlsx", rowCount: 1 }, cookie, duA);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    const [row] = await db.select().from(conversionLogs).where(eq(conversionLogs.id, body.id));
    expect(row?.dataUsahaId).toBe(duA);
  });

  test("403 DATA_USAHA_FORBIDDEN kalau header Data Usaha milik orang lain", async () => {
    const email = `conv-route-forbidden-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await subscribeKonverter(userId, "konverter_item_transfer");

    const otherId = await signUp(`conv-route-forbidden-other-${runId}@test.local`);
    const foreignDu = await createTestDataUsaha(otherId, "Punya Orang Lain");

    const res = await post({ moduleKey: "konverter_item_transfer", fileName: "a.xlsx", rowCount: 1 }, cookie, foreignDu);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_FORBIDDEN");
  });

  test("400 TRIAL_ROW_LIMIT_EXCEEDED kalau subscription trial sudah lewat kuota — baris TIDAK ditulis", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: 5, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: 5 } });

    const email = `conv-route-trial-exceeded-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await subscribeKonverter(userId, "konverter_standard_cost", true);

    const first = await post({ moduleKey: "konverter_standard_cost", fileName: "batch-1.xlsx", rowCount: 4 }, cookie);
    expect(first.status).toBe(200);

    const second = await post({ moduleKey: "konverter_standard_cost", fileName: "batch-2-ditolak.xlsx", rowCount: 2 }, cookie);
    expect(second.status).toBe(400);
    expect(((await second.json()) as { code: string }).code).toBe("TRIAL_ROW_LIMIT_EXCEEDED");

    const rows = await db.select().from(conversionLogs).where(eq(conversionLogs.fileName, "batch-2-ditolak.xlsx"));
    expect(rows.length).toBe(0);
  });

  test("200 kalau user MEMBER (seat aktif) di Data Usaha yang punya subscription Varian ini", async () => {
    const primaryEmail = `conv-route-member-primary-${runId}@test.local`;
    const primaryId = await signUp(primaryEmail);
    const dataUsahaId = await subscribeKonverter(primaryId, "konverter_customer_receipt");

    const memberEmail = `conv-route-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(primaryId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await post({ moduleKey: "konverter_customer_receipt", fileName: "a.xlsx", rowCount: 1 }, memberCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /me/conversion-logs", () => {
  function get(dataUsahaId: string, cookie: string) {
    return testApp.handle(new Request(`http://localhost/me/conversion-logs?dataUsahaId=${dataUsahaId}`, { headers: { cookie } }));
  }

  test("404 DATA_USAHA_NOT_FOUND kalau user tidak punya akses ke dataUsahaId itu", async () => {
    const email = `conv-route-get-noaccess-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const otherId = await signUp(`conv-route-get-noaccess-other-${runId}@test.local`);
    const foreignDu = await createTestDataUsaha(otherId, "Bukan Punya Saya");

    const res = await get(foreignDu, cookie);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_NOT_FOUND");
  });

  test("balikin log YANG DITULIS user itu sendiri di Data Usaha-nya, convertedByYou=true", async () => {
    const email = `conv-route-get-own-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await subscribeKonverter(userId, "konverter_vendor_payment");
    await post({ moduleKey: "konverter_vendor_payment", fileName: "vp.xlsx", rowCount: 3 }, cookie, dataUsahaId);

    const res = await get(dataUsahaId, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: { fileName: string; convertedByYou: boolean }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.logs[0]?.fileName).toBe("vp.xlsx");
    expect(body.logs[0]?.convertedByYou).toBe(true);
  });

  test("member melihat log yang ditulis anggota tim LAIN di Data Usaha yang sama (gabungan tim, bukan riwayat pribadi)", async () => {
    const primaryEmail = `conv-route-get-team-primary-${runId}@test.local`;
    const primaryId = await signUp(primaryEmail);
    const primaryCookie = await signIn(primaryEmail);
    const dataUsahaId = await subscribeKonverter(primaryId, "konverter_other_deposit");
    await post({ moduleKey: "konverter_other_deposit", fileName: "primary.xlsx", rowCount: 2 }, primaryCookie, dataUsahaId);

    const memberEmail = `conv-route-get-team-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(primaryId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await get(dataUsahaId, memberCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: { fileName: string; convertedByYou: boolean }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.logs[0]?.fileName).toBe("primary.xlsx");
    expect(body.logs[0]?.convertedByYou).toBe(false); // ditulis primary, bukan member yang lihat sekarang
  });
});
