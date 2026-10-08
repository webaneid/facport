import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { dataUsaha } from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// § Fase 184 — nomor Formula AutoProduksi: otomatis, per Data Usaha, tidak bisa dikustom, tidak dikirim ke Accurate. Penghitung = kolom `data_usaha.formula_last_number`
// diambil lewat SATU `UPDATE … +1 RETURNING` (atomik di level baris; dua pembuatan bersamaan tidak mungkin mendapat nomor sama). Wajib di dalam transaksi yang juga
// meng-insert Formula-nya (rollback ikut mengembalikan penghitung). Nomor tidak dipakai ulang walau Formula dihapus.
export async function allocateFormulaNumber(tx: Tx, dataUsahaId: string): Promise<number> {
  const [row] = await tx
    .update(dataUsaha)
    .set({ formulaLastNumber: sql`${dataUsaha.formulaLastNumber} + 1` })
    .where(eq(dataUsaha.id, dataUsahaId))
    .returning({ n: dataUsaha.formulaLastNumber });
  if (!row) throw new Error("DATA_USAHA_NOT_FOUND");
  return row.n;
}

/** 7 → "F-007"; di atas 999 digit bertambah ("F-1000"). */
export function formatFormulaCode(n: number): string {
  return `F-${String(n).padStart(3, "0")}`;
}

/** Menambah `formulaCode` ke baris Formula untuk respons API. */
export function withFormulaCode<T extends { formulaNumber: number }>(formula: T): T & { formulaCode: string } {
  return { ...formula, formulaCode: formatFormulaCode(formula.formulaNumber) };
}
