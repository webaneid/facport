import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user as userTable, plans, subscriptions, importBatches, importBatchRows } from "../db/schema";
import { createTestDataUsaha } from "./test-fixtures";
import { loadStagedPlanForBatch, decideResumeStagedBatch } from "./staged-batch";
import { parseStagedConfig } from "./staged-send";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);
const cfg = parseStagedConfig({ IMPORT_STAGED_MODULES: "sales_receipt", IMPORT_STAGED_THRESHOLD_ROWS: "5", IMPORT_STAGED_CHUNK_ROWS: "4", IMPORT_STAGED_MAX_RESUMES: "2" });
const mapping = { No: "receiptNumber", Faktur: "invoiceNo", Bayar: "chequeAmount" };

async function provision(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Staged Test" }) }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  const [plan] = await db.insert(plans).values({ name: `Staged Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["sales_receipt"] }).returning();
  const dataUsahaId = await createTestDataUsaha(body.user.id);
  const [sub] = await db.insert(subscriptions).values({ userId: body.user.id, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 864e5), dataUsahaId }).returning();
  return { userId: body.user.id, subscriptionId: sub!.id };
}

async function makeBatch(owner: { userId: string; subscriptionId: string }, module: string, rows: { no: string | null; status: string }[], status = "processing") {
  const [batch] = await db
    .insert(importBatches)
    .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module, fileName: "staged.xlsx", totalRows: rows.length, status, columnMapping: mapping })
    .returning();
  await db.insert(importBatchRows).values(rows.map((r, i) => ({ batchId: batch!.id, rowNumber: i + 1, rawData: { ...(r.no ? { No: r.no } : {}), Faktur: `F-${i}`, Bayar: 10 }, status: r.status })));
  return batch!.id;
}
const many = (no: string, n: number, status: string) => Array.from({ length: n }, () => ({ no, status }));

describe("loadStagedPlanForBatch", () => {
  test("rencana hanya untuk dokumen di atas ambang; null bila modul mati atau batch kecil", async () => {
    const owner = await provision(`staged-a-${runId}@test.local`);
    const id = await makeBatch(owner, "sales_receipt", [...many("BIG", 9, "pending"), ...many("S", 3, "pending")]);
    const plan = await loadStagedPlanForBatch(id, cfg);
    expect(plan?.items.map((i) => [i.number, i.rows, i.entries, i.steps])).toEqual([["BIG", 9, 9, 3]]);
    expect(await loadStagedPlanForBatch(id, parseStagedConfig({}))).toBeNull();
    const small = await makeBatch(owner, "sales_receipt", many("X", 4, "pending"));
    expect(await loadStagedPlanForBatch(small, cfg)).toBeNull();
  });
});

describe("decideResumeStagedBatch", () => {
  test("semua baris pending milik dokumen bertahap → layak dilanjutkan; baris TIDAK disentuh", async () => {
    const owner = await provision(`staged-b-${runId}@test.local`);
    const id = await makeBatch(owner, "sales_receipt", [...many("BIG", 4, "success"), ...many("BIG", 6, "pending"), ...many("OLD", 2, "success")]);
    expect(await decideResumeStagedBatch(id, 1, cfg)).toBe("resume");
    const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, id));
    expect(rows.filter((r) => r.status === "pending").length).toBe(6);
  });
  test("ada baris pending di luar dokumen bertahap (dokumen kecil, mungkin sedang dikirim saat mati) → tidak layak", async () => {
    const owner = await provision(`staged-c-${runId}@test.local`);
    const id = await makeBatch(owner, "sales_receipt", [...many("BIG", 6, "pending"), ...many("S", 2, "pending")]);
    expect(await decideResumeStagedBatch(id, 0, cfg)).toBe("not-eligible");
  });
  test("baris tanpa nomor yang pending → tidak layak", async () => {
    const owner = await provision(`staged-d-${runId}@test.local`);
    const id = await makeBatch(owner, "sales_receipt", [...many("BIG", 6, "pending"), { no: null, status: "pending" }]);
    expect(await decideResumeStagedBatch(id, 0, cfg)).toBe("not-eligible");
  });
  test("baris pending milik dokumen ber-PPh (tidak dicicil) → tidak layak dilanjutkan otomatis", async () => {
    const owner = await provision(`staged-f-${runId}@test.local`);
    const [batch] = await db.insert(importBatches).values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_receipt", fileName: "pph.xlsx", totalRows: 6, status: "processing", columnMapping: { ...mapping, Pajak: "taxId" } }).returning();
    await db.insert(importBatchRows).values(Array.from({ length: 6 }, (_, i) => ({ batchId: batch!.id, rowNumber: i + 1, rawData: { No: "PPH", Faktur: `F-${i}`, Bayar: 10, Pajak: i === 0 ? "PPh 23" : "" }, status: "pending" })));
    expect(await decideResumeStagedBatch(batch!.id, 0, cfg)).toBe("not-eligible");
  });
  test("melewati batas lanjut → 'limit'; batch bukan processing / modul mati / tidak ada pending → tidak layak", async () => {
    const owner = await provision(`staged-e-${runId}@test.local`);
    const id = await makeBatch(owner, "sales_receipt", many("BIG", 6, "pending"));
    expect(await decideResumeStagedBatch(id, 2, cfg)).toBe("limit");
    expect(await decideResumeStagedBatch(id, 0, parseStagedConfig({}))).toBe("not-eligible");
    const done = await makeBatch(owner, "sales_receipt", many("BIG", 6, "pending"), "completed");
    expect(await decideResumeStagedBatch(done, 0, cfg)).toBe("not-eligible");
    const none = await makeBatch(owner, "sales_receipt", many("BIG", 6, "success"));
    expect(await decideResumeStagedBatch(none, 0, cfg)).toBe("not-eligible");
    expect(await decideResumeStagedBatch("00000000-0000-4000-8000-000000000000", 0, cfg)).toBe("not-eligible");
  });
});
