import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, plans, subscriptions, importBatches, importBatchRows, settings } from "../db/schema";
import { checkTrialRowBudget, TRIAL_MAX_ROWS_SETTING_KEY } from "./trial";

// § Fase 43 — batas baris trial: `checkTrialRowBudget` dites LANGSUNG
// (bukan lewat HTTP, mirror `subscription-gate.test.ts` — logic murni,
// tidak butuh round-trip request/response). Set `trial.maxRows` kecil
// (5) supaya test cepat tanpa insert ratusan baris (pola upsert settings
// GLOBAL sama seperti `me.route.test.ts`).
const runId = Date.now();
const TEST_MAX_ROWS = 5;

async function createUser(email: string) {
  const now = new Date();
  const [u] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email, name: "Trial Test", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return u!.id;
}

async function createSubscription(userId: string, isTrial: boolean, moduleKey: string) {
  const [plan] = await db
    .insert(plans)
    .values({ name: `Trial Budget Plan ${runId}-${moduleKey}`, price: 1000, durationDays: 30, modules: [moduleKey] })
    .returning();
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isTrial,
    })
    .returning();
  return sub!.id;
}

async function createSuccessRows(userId: string, subscriptionId: string, moduleKey: string, successCount: number) {
  const [batch] = await db
    .insert(importBatches)
    .values({ userId, subscriptionId, module: moduleKey, fileName: "trial-budget.xlsx", totalRows: successCount, status: "completed" })
    .returning();
  for (let i = 0; i < successCount; i++) {
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: i + 1, rawData: {}, status: "success" });
  }
}

describe("checkTrialRowBudget", () => {
  test("selalu {ok:true} untuk subscription NON-trial, berapa pun additionalRows", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`trial-budget-nontrial-${runId}@test.local`);
    const subId = await createSubscription(userId, false, "purchase_invoice");

    const result = await checkTrialRowBudget(subId, 999999);
    expect(result.ok).toBe(true);
  });

  test("{ok:true} kalau successCount + additionalRows PAS SAMA DENGAN batas (boundary)", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`trial-budget-boundary-${runId}@test.local`);
    const subId = await createSubscription(userId, true, "sales_invoice");
    await createSuccessRows(userId, subId, "sales_invoice", 3); // sudah 3 sukses

    const result = await checkTrialRowBudget(subId, 2); // 3 + 2 = 5 = TEST_MAX_ROWS, pas
    expect(result.ok).toBe(true);
  });

  test("{ok:false} + remaining/max kalau successCount + additionalRows MELEBIHI batas", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`trial-budget-exceeded-${runId}@test.local`);
    const subId = await createSubscription(userId, true, "vendor_payable_account");
    await createSuccessRows(userId, subId, "vendor_payable_account", 4); // sudah 4 sukses

    const result = await checkTrialRowBudget(subId, 2); // 4 + 2 = 6 > 5
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.remaining).toBe(1); // 5 - 4
      expect(result.max).toBe(TEST_MAX_ROWS);
    }
  });

  test("baris cancelled/failed TIDAK dihitung sebagai successCount", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`trial-budget-notcounted-${runId}@test.local`);
    const subId = await createSubscription(userId, true, "purchase_payment");
    const [batch] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: subId, module: "purchase_payment", fileName: "mixed.xlsx", totalRows: 3, status: "completed_with_errors" })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed" });
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 2, rawData: {}, status: "cancelled" });
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 3, rawData: {}, status: "pending" });

    // successCount = 0 (semua baris di atas bukan "success") — additionalRows
    // = TEST_MAX_ROWS harus tetap lolos, bukan dianggap sudah kepakai.
    const result = await checkTrialRowBudget(subId, TEST_MAX_ROWS);
    expect(result.ok).toBe(true);
  });
});
