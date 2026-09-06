import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, plans, subscriptions, importBatches, importBatchRows, settings } from "../db/schema";
import { meRoute } from "./me.route";
import { MANUAL_INPUT_SECONDS_SETTING_KEY } from "../lib/manual-input-estimate";

// § diminta user 2026-09-06 — "efisiensi waktu kerja" di dashboard
// customer dihitung DI SINI (server), jadi angkanya harus benar: total
// baris SUKSES milik user ini (lintas modul) × setting admin.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(meRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Me Stats Test" }),
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

describe("GET /me/stats", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/stats"));
    expect(res.status).toBe(401);
  });

  test("hitung total baris sukses lintas modul × setting admin, abaikan baris failed/cancelled dan batch user lain", async () => {
    await db
      .insert(settings)
      .values({ key: MANUAL_INPUT_SECONDS_SETTING_KEY, value: 45, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: 45 } });

    const userId = await signUp(`me-stats-owner-${runId}@test.local`);
    const cookie = await signIn(`me-stats-owner-${runId}@test.local`);
    const otherUserId = await signUp(`me-stats-other-${runId}@test.local`);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Me Stats Test Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice", "sales_invoice"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      .returning();

    // § 2 batch modul BEDA (purchase_invoice + sales_invoice) untuk
    // konfirmasi query ini GABUNGAN lintas modul, bukan 1 modul saja.
    const [batchPI] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: sub!.id, module: "purchase_invoice", fileName: "pi.xlsx", totalRows: 3, status: "completed" })
      .returning();
    const [batchSI] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: sub!.id, module: "sales_invoice", fileName: "si.xlsx", totalRows: 2, status: "completed" })
      .returning();

    await db.insert(importBatchRows).values([
      { batchId: batchPI!.id, rowNumber: 1, rawData: {}, status: "success" },
      { batchId: batchPI!.id, rowNumber: 2, rawData: {}, status: "success" },
      { batchId: batchPI!.id, rowNumber: 3, rawData: {}, status: "failed" }, // TIDAK dihitung
      { batchId: batchSI!.id, rowNumber: 1, rawData: {}, status: "success" },
      { batchId: batchSI!.id, rowNumber: 2, rawData: {}, status: "cancelled" }, // TIDAK dihitung (Batal Import)
    ]);

    // § batch milik user LAIN — TIDAK BOLEH ikut ke-hitung.
    const [otherPlan] = await db
      .insert(plans)
      .values({ name: `Me Stats Other Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [otherSub] = await db
      .insert(subscriptions)
      .values({ userId: otherUserId, planId: otherPlan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      .returning();
    const [otherBatch] = await db
      .insert(importBatches)
      .values({ userId: otherUserId, subscriptionId: otherSub!.id, module: "purchase_invoice", fileName: "other.xlsx", totalRows: 10, status: "completed" })
      .returning();
    await db.insert(importBatchRows).values([{ batchId: otherBatch!.id, rowNumber: 1, rawData: {}, status: "success" }]);

    const res = await testApp.handle(new Request("http://localhost/me/stats", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { successfulRowCount: number; estimatedTimeSavedSeconds: number };
    expect(body.successfulRowCount).toBe(3); // 2 (PI success) + 1 (SI success), TIDAK termasuk failed/cancelled/user lain
    expect(body.estimatedTimeSavedSeconds).toBe(3 * 45);
  });
});

describe("GET /me/import-batches", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/import-batches"));
    expect(res.status).toBe(401);
  });

  test("gabungan lintas modul, urut terbaru dulu, TIDAK termasuk batch user lain, `total` hitungan penuh", async () => {
    const userId = await signUp(`me-batches-owner-${runId}@test.local`);
    const cookie = await signIn(`me-batches-owner-${runId}@test.local`);
    const otherUserId = await signUp(`me-batches-other-${runId}@test.local`);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Me Batches Test Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice", "journal_voucher"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      .returning();

    // § 3 batch, modul BEDA (purchase_invoice + journal_voucher), untuk
    // konfirmasi endpoint ini GABUNGAN lintas modul, bukan 1 modul.
    for (const [module, fileName] of [
      ["purchase_invoice", "batch-1-pi.xlsx"],
      ["journal_voucher", "batch-2-jv.xlsx"],
      ["purchase_invoice", "batch-3-pi.xlsx"],
    ] as const) {
      await db.insert(importBatches).values({ userId, subscriptionId: sub!.id, module, fileName, totalRows: 1, status: "completed" });
    }

    const [otherPlan] = await db
      .insert(plans)
      .values({ name: `Me Batches Other Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [otherSub] = await db
      .insert(subscriptions)
      .values({ userId: otherUserId, planId: otherPlan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      .returning();
    await db.insert(importBatches).values({ userId: otherUserId, subscriptionId: otherSub!.id, module: "purchase_invoice", fileName: "punya-orang-lain.xlsx", totalRows: 1, status: "completed" });

    const res = await testApp.handle(new Request("http://localhost/me/import-batches?limit=2", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string; module: string }[]; total: number };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3-pi.xlsx", "batch-2-jv.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
    expect(body.total).toBe(3);
  });
});
