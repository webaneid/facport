import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql, eq } from "drizzle-orm";
import { db } from "./db";
import { importBatches, importBatchRows } from "../db/schema";
import { loadProcessableRows } from "./import-rows-loader";

// § Fase 215 — pemuatan baris per halaman. Memakai satu langganan/pengguna yang SUDAH ada di DB dev (tanpa membuat data lain); batch & baris uji dihapus di akhir.
const rowsOf = (r: unknown): Record<string, unknown>[] => (Array.isArray(r) ? r : ((r as { rows?: Record<string, unknown>[] }).rows ?? []));
let batchId: string | null = null;
let skip = false;
const mapping = { "Trans No": "number", "Item No": "itemNo" };

beforeAll(async () => {
  const sub = rowsOf(await db.execute(sql`select id, user_id from subscriptions limit 1`))[0];
  if (!sub) { skip = true; return; }
  const [b] = await db.insert(importBatches).values({ userId: String(sub.user_id), subscriptionId: String(sub.id), module: "sales_invoice", fileName: "loader-test.xlsx", totalRows: 10, status: "processing", columnMapping: mapping }).returning();
  batchId = b!.id;
  const statuses = ["pending", "success", "failed", "pending", "success", "pending", "failed", "pending", "success", "pending"];
  await db.insert(importBatchRows).values(
    statuses.map((status, i) => ({ batchId: b!.id, rowNumber: i + 1, status, rawData: { "Trans No": ` T-${i + 1}\u00a0`, "Item No": "I-" + (i + 1), "Kolom Lain": "x".repeat(50) } })),
  );
});
afterAll(async () => {
  if (!batchId) return;
  await db.delete(importBatchRows).where(eq(importBatchRows.batchId, batchId));
  await db.delete(importBatches).where(eq(importBatches.id, batchId));
});

describe("loadProcessableRows", () => {
  test("hanya pending/failed, berurutan menurut row_number, lintas halaman (ukuran halaman 3)", async () => {
    if (skip) return;
    const rows = await loadProcessableRows(batchId!, mapping, 3);
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 3, 4, 6, 7, 8, 10]);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["pending", "failed"]));
  });

  test("hasil sama untuk ukuran halaman berbeda (1, 3, 7, 500)", async () => {
    if (skip) return;
    const base = (await loadProcessableRows(batchId!, mapping, 500)).map((r) => r.id);
    for (const size of [1, 3, 7]) expect((await loadProcessableRows(batchId!, mapping, size)).map((r) => r.id)).toEqual(base);
  });

  test("data dibersihkan, kolom kunci dinormalkan, kolom tak dipetakan dibuang", async () => {
    if (skip) return;
    const [first] = await loadProcessableRows(batchId!, mapping, 3);
    expect(first!.rawData).toEqual({ "Trans No": "T-1", "Item No": "I-1" });
  });

  test("batch tanpa baris yang bisa diproses → daftar kosong", async () => {
    if (skip) return;
    await db.update(importBatchRows).set({ status: "success" }).where(eq(importBatchRows.batchId, batchId!));
    expect(await loadProcessableRows(batchId!, mapping, 3)).toEqual([]);
  });
});
