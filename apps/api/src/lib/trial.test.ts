import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, plans, subscriptions, importBatches, importBatchRows, settings, conversionLogs } from "../db/schema";
import { checkTrialRowBudget, checkAndRecordConversionRowBudget, TRIAL_MAX_ROWS_SETTING_KEY } from "./trial";
import { createTestDataUsaha } from "./test-fixtures";

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
  const dataUsahaId = await createTestDataUsaha(userId);
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isTrial,
      dataUsahaId,
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

// § Fase 150, ADR-0038 — twin `checkTrialRowBudget` di atas, untuk Produk Konverter. Sama pola test (logic murni,
// dites LANGSUNG bukan lewat HTTP), BEDA fixture: butuh `dataUsahaId` (dikembalikan `createKonverterSubscription`
// di bawah, BEDA dari `createSubscription` di atas yang tidak expose-nya) karena fungsi ini MENULIS
// `conversion_logs`, bukan cuma membaca.
async function createKonverterSubscription(userId: string, isTrial: boolean, moduleKey: string) {
  const [plan] = await db
    .insert(plans)
    .values({ name: `Konverter Trial Budget Plan ${runId}-${moduleKey}`, price: 1000, durationDays: 30, modules: [moduleKey] })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isTrial,
      dataUsahaId,
    })
    .returning();
  return { subscriptionId: sub!.id, dataUsahaId };
}

describe("checkAndRecordConversionRowBudget", () => {
  test("selalu {ok:true} + insert baris untuk subscription NON-trial, berapa pun rowCount", async () => {
    const userId = await createUser(`conv-budget-nontrial-${runId}@test.local`);
    const { subscriptionId, dataUsahaId } = await createKonverterSubscription(userId, false, "konverter_requisition");

    const result = await checkAndRecordConversionRowBudget({
      subscriptionId,
      userId,
      dataUsahaId,
      moduleKey: "konverter_requisition",
      fileName: "requisition-besar.xlsx",
      rowCount: 999999,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const [row] = await db.select().from(conversionLogs).where(eq(conversionLogs.id, result.id));
      expect(row?.rowCount).toBe(999999);
    }
  });

  test("{ok:true} kalau usedRows + rowCount PAS SAMA DENGAN batas (boundary), baris DITULIS", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`conv-budget-boundary-${runId}@test.local`);
    const { subscriptionId, dataUsahaId } = await createKonverterSubscription(userId, true, "konverter_sales_invoice");

    const first = await checkAndRecordConversionRowBudget({
      subscriptionId,
      userId,
      dataUsahaId,
      moduleKey: "konverter_sales_invoice",
      fileName: "batch-1.xlsx",
      rowCount: 3,
    });
    expect(first.ok).toBe(true);

    const second = await checkAndRecordConversionRowBudget({
      subscriptionId,
      userId,
      dataUsahaId,
      moduleKey: "konverter_sales_invoice",
      fileName: "batch-2.xlsx",
      rowCount: 2, // 3 + 2 = 5 = TEST_MAX_ROWS, pas
    });
    expect(second.ok).toBe(true);
  });

  test("{ok:false} + remaining/max kalau usedRows + rowCount MELEBIHI batas, TIDAK ada baris ditulis", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`conv-budget-exceeded-${runId}@test.local`);
    const { subscriptionId, dataUsahaId } = await createKonverterSubscription(userId, true, "konverter_purchase_invoice");

    const first = await checkAndRecordConversionRowBudget({
      subscriptionId,
      userId,
      dataUsahaId,
      moduleKey: "konverter_purchase_invoice",
      fileName: "batch-1.xlsx",
      rowCount: 4,
    });
    expect(first.ok).toBe(true);

    const second = await checkAndRecordConversionRowBudget({
      subscriptionId,
      userId,
      dataUsahaId,
      moduleKey: "konverter_purchase_invoice",
      fileName: "batch-2-ditolak.xlsx",
      rowCount: 2, // 4 + 2 = 6 > 5
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.remaining).toBe(1); // 5 - 4
      expect(second.max).toBe(TEST_MAX_ROWS);
    }

    // § baris yang DITOLAK TIDAK boleh tetap tertulis (fungsi ini "cek DAN catat" 1 transaksi atomik, bukan
    // logging pasif — § komentar sumber `checkAndRecordConversionRowBudget`).
    const rows = await db.select().from(conversionLogs).where(eq(conversionLogs.fileName, "batch-2-ditolak.xlsx"));
    expect(rows.length).toBe(0);
  });

  test("usedRows dihitung SUM rowCount lintas beberapa baris conversion_logs milik subscription ini", async () => {
    await db
      .insert(settings)
      .values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: TEST_MAX_ROWS, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: TEST_MAX_ROWS } });

    const userId = await createUser(`conv-budget-sum-${runId}@test.local`);
    const { subscriptionId, dataUsahaId } = await createKonverterSubscription(userId, true, "konverter_journal_voucher");

    for (const rowCount of [1, 1, 1]) {
      const r = await checkAndRecordConversionRowBudget({
        subscriptionId,
        userId,
        dataUsahaId,
        moduleKey: "konverter_journal_voucher",
        fileName: `batch-${rowCount}-${crypto.randomUUID()}.xlsx`,
        rowCount,
      });
      expect(r.ok).toBe(true);
    }
    // usedRows sekarang 3 — rowCount 3 lagi harus DITOLAK (3+3=6 > 5), BUKAN dianggap 0 kalau cuma baca baris TERAKHIR.
    const result = await checkAndRecordConversionRowBudget({
      subscriptionId,
      userId,
      dataUsahaId,
      moduleKey: "konverter_journal_voucher",
      fileName: "batch-final.xlsx",
      rowCount: 3,
    });
    expect(result.ok).toBe(false);
  });
});
