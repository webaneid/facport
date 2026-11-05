import { and, asc, eq, gt, or } from "drizzle-orm";
import { db } from "./db";
import { importBatchRows } from "../db/schema";
import { makeRowPreparer } from "./input-hygiene";

// § Fase 215 (architecture-import-speed-lab.md § 15) — worker dulu memuat SEMUA baris batch sekaligus (dengan seluruh kolom Excel) lalu menyalin tiap baris dua kali:
// memori puncak ±23–40 KB per baris lebar, 9.600 baris lebar serentak ≈ 383–409 MB (> `mem_limit` worker 384m). Sekarang: dimuat PER HALAMAN (keyset by `row_number`) dan tiap baris
// langsung disiapkan oleh `makeRowPreparer` (dibersihkan + hanya kolom yang dipetakan), sehingga data mentah satu halaman bisa dibuang sebelum halaman berikutnya masuk.
// Urutan = `row_number` (deterministik; sebelumnya tanpa ORDER BY → urutan penyimpanan, yang sama dengan urutan unggah).
// 50: terukur (lab § 15) — puncak RSS 8 akun × 1.200 baris lebar: halaman 500 → 285 MB, 100 → 263, 50 → 223, 25 → 211, 10 → 204; di bawah ±50 hasilnya menipis & kueri bertambah.
export const IMPORT_ROWS_PAGE_SIZE = 50;

export type ProcessableRow = Omit<typeof importBatchRows.$inferSelect, "rawData"> & { rawData: Record<string, unknown> };

/** Baris batch berstatus pending/failed, siap diproses (dibersihkan, kolom tak dipetakan dibuang). */
export async function loadProcessableRows(batchId: string, columnMapping: Record<string, string>, pageSize: number = IMPORT_ROWS_PAGE_SIZE): Promise<ProcessableRow[]> {
  const prepare = makeRowPreparer(columnMapping);
  const out: ProcessableRow[] = [];
  let lastRowNumber = 0;
  for (;;) {
    const page = await db
      .select()
      .from(importBatchRows)
      .where(
        and(
          eq(importBatchRows.batchId, batchId),
          or(eq(importBatchRows.status, "pending"), eq(importBatchRows.status, "failed")),
          gt(importBatchRows.rowNumber, lastRowNumber),
        ),
      )
      .orderBy(asc(importBatchRows.rowNumber))
      .limit(pageSize);
    if (page.length === 0) break;
    for (const r of page) out.push({ ...r, rawData: prepare(r.rawData as Record<string, unknown>) });
    lastRowNumber = page[page.length - 1]!.rowNumber;
    if (page.length < pageSize) break;
  }
  return out;
}
