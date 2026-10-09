import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { dataUsaha, autoproduksiFormulas } from "../db/schema";

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

/** Kunci baris Data Usaha sampai transaksi selesai — menserialkan pembuatan/pengubahan nama Formula per Data Usaha (cek nama unik bebas race). `allocateFormulaNumber` sudah mengunci lewat UPDATE yang sama. */
export async function lockDataUsahaForFormula(tx: Tx, dataUsahaId: string): Promise<void> {
  await tx.select({ id: dataUsaha.id }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId)).for("update");
}

/** Pesan baku saat nama Formula sudah dipakai (dipakai input manual & Import Excel). */
export const FORMULA_NAME_TAKEN_MESSAGE = "Nama formula sudah dipakai di Data Usaha ini. Gunakan nama lain.";

/** True kalau sudah ada Formula bernama sama (tak peka huruf besar/kecil & spasi tepi) di Data Usaha ini. `excludeId` = Formula yang sedang diedit. */
export async function isFormulaNameTaken(tx: Tx, dataUsahaId: string, name: string, excludeId?: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: autoproduksiFormulas.id })
    .from(autoproduksiFormulas)
    .where(
      and(
        eq(autoproduksiFormulas.dataUsahaId, dataUsahaId),
        sql`lower(btrim(${autoproduksiFormulas.name})) = lower(btrim(${name}))`,
        excludeId ? ne(autoproduksiFormulas.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  return !!row;
}
