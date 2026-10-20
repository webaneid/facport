import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, plans, subscriptions, importBatches, importBatchRows } from "../db/schema";
import { createTestDataUsaha } from "../lib/test-fixtures";
import { loadStagedFullGroups, stagedFullRows, processStagedGroup } from "./index";
import { AccurateApiError } from "../lib/accurate";
import { parseStagedConfig, type StagedDeps, type StagedDoc } from "../lib/staged-send";
import type { AccurateSessionContext } from "../lib/accurate-session";

// § Fase 205 — jalur kirim-bertahap di worker terhadap DB nyata + Accurate palsu: status baris, ID dokumen, retry-lanjutkan, kegagalan sebagian.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);
const ctx = {} as AccurateSessionContext;
const cfg = parseStagedConfig({ IMPORT_STAGED_MODULES: "sales_receipt,purchase_payment", IMPORT_STAGED_THRESHOLD_ROWS: "5", IMPORT_STAGED_CHUNK_ROWS: "4", IMPORT_STAGED_MAX_ATTEMPTS: "2", IMPORT_STAGED_BACKOFF_BASE_MS: "0", IMPORT_STAGED_POLL_INTERVAL_MS: "1000" });
const srMap = { No: "receiptNumber", Cust: "customerNo", Bank: "bankNo", Tgl: "transDate", Cab: "branchName", Faktur: "invoiceNo", Bayar: "chequeAmount" };
const ppMap = { No: "paymentNumber", Vend: "vendorNo", Bank: "bankNo", Tgl: "transDate", Cab: "branchName", Faktur: "invoiceNo", Bayar: "chequeAmount" };

async function provision(email: string, module: string) {
  const res = await testApp.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Staged Worker Test" }) }));
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  const [plan] = await db.insert(plans).values({ name: `Staged Worker Plan ${email}`, price: 1000, durationDays: 30, modules: [module] }).returning();
  const dataUsahaId = await createTestDataUsaha(body.user.id);
  const [sub] = await db.insert(subscriptions).values({ userId: body.user.id, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 864e5), dataUsahaId }).returning();
  return { userId: body.user.id, subscriptionId: sub!.id };
}

async function makeBatch(owner: { userId: string; subscriptionId: string }, module: "sales_receipt" | "purchase_payment", mapping: Record<string, string>, n: number, number = "BIG-1", statuses: string[] = []) {
  const [batch] = await db
    .insert(importBatches)
    .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module, fileName: "w.xlsx", totalRows: n, status: "processing", columnMapping: mapping })
    .returning();
  await db.insert(importBatchRows).values(
    Array.from({ length: n }, (_, i) => ({
      batchId: batch!.id,
      rowNumber: i + 1,
      rawData: { No: number, Cust: "C1", Vend: "V1", Bank: "110102", Tgl: "21/10/2026", Cab: "Pusat", Faktur: `INV-${String(i + 1).padStart(3, "0")}`, Bayar: 100 + i },
      status: statuses[i] ?? "pending",
    })),
  );
  return batch!.id;
}
const rowsOf = async (batchId: string) => (await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batchId))).sort((a, b) => a.rowNumber - b.rowNumber);

/** Accurate palsu minimal: dokumen tunggal bernomor; mendukung create/update seperti hasil trial. */
function fake(opts: { failAtCall?: number; failWith?: Error; preset?: StagedDoc } = {}) {
  let doc: StagedDoc | null = opts.preset ?? null;
  let nextId = 700;
  const calls: Record<string, unknown>[] = [];
  const deps: Partial<StagedDeps> = {
    lookup: async () => (doc ? { ...doc, lines: [...doc.lines] } : null),
    save: async (payload) => {
      calls.push(payload);
      if (opts.failAtCall === calls.length) throw opts.failWith ?? new AccurateApiError("Nilai Pembayaran tidak mencukupi", 200);
      const di = payload.detailInvoice as Record<string, unknown>[];
      if (payload.id === undefined) doc = { id: nextId++, lines: di.map((e, i) => ({ id: 1000 + i, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [] };
      else {
        const old = doc!.lines;
        doc = { ...doc!, lines: di.map((e, i) => (e.invoiceNo === undefined ? old.find((l) => l.id === (e as { id: number }).id)! : { id: 5000 + i, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })) };
      }
      return { id: doc.id };
    },
    sleep: async () => {},
  };
  return { deps, calls, get doc() { return doc; } };
}

describe("loadStagedFullGroups / stagedFullRows", () => {
  test("semua baris batch per nomor (urut baris), termasuk yang sudah success; kunci tak peka huruf", async () => {
    const owner = await provision(`sw-a-${runId}@test.local`, "sales_receipt");
    const id = await makeBatch(owner, "sales_receipt", srMap, 8, "Big-1", ["success", "success"]);
    const full = await loadStagedFullGroups(id, "sales_receipt", srMap, cfg);
    const rows = stagedFullRows(full, "BIG-1")!;
    expect(rows.length).toBe(8);
    expect(rows.map((r) => String(r.rawData.Faktur))).toEqual(Array.from({ length: 8 }, (_, i) => `INV-${String(i + 1).padStart(3, "0")}`));
    expect(rows.slice(0, 2).map((r) => r.status)).toEqual(["success", "success"]);
    expect(stagedFullRows(full, null)).toBeNull();
    expect(stagedFullRows(null, "BIG-1")).toBeNull();
    expect(stagedFullRows(full, "LAIN")).toBeNull();
  });
});

describe("dokumen ber-PPh tidak dicicil", () => {
  test("loadStagedFullGroups melewati dokumen yang memuat Tax ID (tetap jalur kirim-sekali)", async () => {
    const owner = await provision(`sw-tax-${runId}@test.local`, "sales_receipt");
    const map = { ...srMap, Tax: "taxId" };
    const [batch] = await db.insert(importBatches).values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_receipt", fileName: "w.xlsx", totalRows: 8, status: "processing", columnMapping: map }).returning();
    await db.insert(importBatchRows).values(
      Array.from({ length: 8 }, (_, i) => ({ batchId: batch!.id, rowNumber: i + 1, rawData: { No: "PPH-1", Cust: "C1", Bank: "110102", Tgl: "21/10/2026", Cab: "Pusat", Faktur: `INV-${i}`, Bayar: 100, Tax: i === 3 ? "PPh 23" : "" }, status: "pending" })),
    );
    expect(stagedFullRows(await loadStagedFullGroups(batch!.id, "sales_receipt", map, cfg), "PPH-1")).toBeNull();
  });
});

describe("processStagedGroup (DB nyata + Accurate palsu)", () => {
  test("Sales Receipt 10 baris, cicilan 4: semua baris success dengan id dokumen yang sama; isi dokumen = Excel", async () => {
    const owner = await provision(`sw-b-${runId}@test.local`, "sales_receipt");
    const id = await makeBatch(owner, "sales_receipt", srMap, 10);
    const full = await loadStagedFullGroups(id, "sales_receipt", srMap, cfg);
    const rows = stagedFullRows(full, "BIG-1")!;
    const f = fake();
    await processStagedGroup(ctx, "sales_receipt", id, "BIG-1", { rows: rows.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, srMap, { config: cfg, deps: f.deps });
    const after = await rowsOf(id);
    expect(after.every((r) => r.status === "success")).toBe(true);
    expect(new Set(after.map((r) => r.accurateTransactionId))).toEqual(new Set(["700"]));
    expect(f.calls.length).toBe(3); // 4 + 4 + 2
    expect(f.doc!.lines.map((l) => l.invoiceNo)).toEqual(after.map((r) => String((r.rawData as Record<string, unknown>).Faktur)));
    expect(f.calls[0]!.number).toBe("BIG-1");
    expect(f.calls[0]!.customerNo).toBe("C1");
  });

  test("galat bisnis di cicilan ke-2: cicilan 1 tetap success, sisanya failed dengan pesan + kemajuan; Retry (baris failed saja) MELANJUTKAN tanpa duplikat", async () => {
    const owner = await provision(`sw-c-${runId}@test.local`, "sales_receipt");
    const id = await makeBatch(owner, "sales_receipt", srMap, 10);
    let full = await loadStagedFullGroups(id, "sales_receipt", srMap, cfg);
    let rows = stagedFullRows(full, "BIG-1")!;
    const f = fake({ failAtCall: 2 });
    await processStagedGroup(ctx, "sales_receipt", id, "BIG-1", { rows: rows.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, srMap, { config: cfg, deps: f.deps });
    let after = await rowsOf(id);
    expect(after.map((r) => r.status)).toEqual(["success", "success", "success", "success", "failed", "failed", "failed", "failed", "failed", "failed"]);
    expect(after[0]!.accurateTransactionId).toBe("700");
    expect(after[4]!.errorMessage).toContain("tidak mencukupi");
    expect(after[4]!.errorMessage).toContain("4 dari 10 entri");
    expect(f.doc!.lines.length).toBe(4);

    // Retry: worker hanya mengolah baris failed, tetapi dokumen penuh dibaca dari DB → awalan cocok → lanjut dari baris ke-5.
    full = await loadStagedFullGroups(id, "sales_receipt", srMap, cfg);
    rows = stagedFullRows(full, "BIG-1")!;
    const failedOnly = rows.filter((r) => r.status === "failed");
    const f2 = fake({ preset: f.doc! });
    await processStagedGroup(ctx, "sales_receipt", id, "BIG-1", { rows: failedOnly.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, srMap, { config: cfg, deps: f2.deps });
    after = await rowsOf(id);
    expect(after.every((r) => r.status === "success")).toBe(true);
    expect(after.every((r) => r.errorMessage === null)).toBe(true);
    expect(f2.doc!.lines.length).toBe(10);
    expect(new Set(f2.doc!.lines.map((l) => l.invoiceNo)).size).toBe(10);
    expect(f2.calls.every((c) => c.id === 700)).toBe(true); // semua update, tidak ada create baru
  });

  test("faktur sama di beberapa baris = 1 entri; semua barisnya ikut success bersama", async () => {
    const owner = await provision(`sw-d-${runId}@test.local`, "sales_receipt");
    const [batch] = await db.insert(importBatches).values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_receipt", fileName: "w.xlsx", totalRows: 12, status: "processing", columnMapping: srMap }).returning();
    // 12 baris, 6 faktur: tiap faktur 2 baris dengan "Jumlah Bayar" sama
    await db.insert(importBatchRows).values(
      Array.from({ length: 12 }, (_, i) => ({ batchId: batch!.id, rowNumber: i + 1, rawData: { No: "DUP-1", Cust: "C1", Bank: "110102", Tgl: "21/10/2026", Cab: "Pusat", Faktur: `INV-${Math.floor(i / 2)}`, Bayar: 500 }, status: "pending" })),
    );
    const full = await loadStagedFullGroups(batch!.id, "sales_receipt", srMap, cfg);
    const rows = stagedFullRows(full, "DUP-1")!;
    const f = fake();
    await processStagedGroup(ctx, "sales_receipt", batch!.id, "DUP-1", { rows: rows.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, srMap, { config: cfg, deps: f.deps });
    expect(f.doc!.lines.length).toBe(6);
    expect((await rowsOf(batch!.id)).every((r) => r.status === "success")).toBe(true);
    expect(f.calls.length).toBe(2); // 4 + 2 entri
  });

  test("nomor dipakai dokumen lain berisi beda → semua baris failed, dokumen lain TIDAK disentuh", async () => {
    const owner = await provision(`sw-e-${runId}@test.local`, "sales_receipt");
    const id = await makeBatch(owner, "sales_receipt", srMap, 8);
    const full = await loadStagedFullGroups(id, "sales_receipt", srMap, cfg);
    const rows = stagedFullRows(full, "BIG-1")!;
    const f = fake({ preset: { id: 9, lines: [{ id: 1, invoiceNo: "BUKAN-PUNYA-KITA", paymentAmount: 1 }], taxIds: [] } });
    await processStagedGroup(ctx, "sales_receipt", id, "BIG-1", { rows: rows.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, srMap, { config: cfg, deps: f.deps });
    const after = await rowsOf(id);
    expect(after.every((r) => r.status === "failed")).toBe(true);
    expect(after[0]!.errorMessage).toContain("isinya berbeda dari Excel");
    expect(f.calls.length).toBe(0);
  });

  test("validasi gagal (header berbeda antar baris) → baris failed dengan pesan validasi, TANPA memanggil Accurate", async () => {
    const owner = await provision(`sw-f-${runId}@test.local`, "sales_receipt");
    const id = await makeBatch(owner, "sales_receipt", srMap, 8);
    const [r2] = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, id));
    await db.update(importBatchRows).set({ rawData: { ...(r2!.rawData as object), Cust: "C-LAIN" } }).where(eq(importBatchRows.id, (await rowsOf(id))[3]!.id));
    const full = await loadStagedFullGroups(id, "sales_receipt", srMap, cfg);
    const rows = stagedFullRows(full, "BIG-1")!;
    const f = fake();
    await processStagedGroup(ctx, "sales_receipt", id, "BIG-1", { rows: rows.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, srMap, { config: cfg, deps: f.deps });
    const after = await rowsOf(id);
    expect(after.every((r) => r.status === "failed")).toBe(true);
    expect(f.calls.length).toBe(0);
  });

  test("Purchase Payment memakai jalur yang sama (nomor & vendor)", async () => {
    const owner = await provision(`sw-g-${runId}@test.local`, "purchase_payment");
    const id = await makeBatch(owner, "purchase_payment", ppMap, 9, "PAY-1");
    const full = await loadStagedFullGroups(id, "purchase_payment", ppMap, cfg);
    const rows = stagedFullRows(full, "PAY-1")!;
    const f = fake();
    await processStagedGroup(ctx, "purchase_payment", id, "PAY-1", { rows: rows.map((r) => ({ id: r.id, rawData: r.rawData })) }, rows, ppMap, { config: cfg, deps: f.deps });
    expect((await rowsOf(id)).every((r) => r.status === "success")).toBe(true);
    expect(f.calls[0]!.vendorNo).toBe("V1");
    expect(f.calls[0]!.number).toBe("PAY-1");
    expect(f.doc!.lines.length).toBe(9);
  });
});
