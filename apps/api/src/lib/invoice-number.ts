import { sql } from "drizzle-orm";
import { db } from "./db";

// § Fase 15, ADR-0021, architecture-invoice.md § "Nomor Invoice" — format
// "INV/2026/09/0001", urutan reset tiap bulan. Pakai COUNT sederhana
// (bukan sequence Postgres per-bulan) — CUKUP untuk fase ini (belum ada
// jalur checkout sungguhan yang bikin invoice concurrent). Fase 16-17
// WAJIB revisit kalau checkout jadi dipakai banyak user bersamaan — pola
// COUNT-lalu-INSERT rawan race condition (2 invoice dapat nomor sama)
// tanpa lock/sequence terpisah. Dicatat sebagai Known Limitation Fase 15,
// BUKAN diselesaikan sekarang.
export async function generateInvoiceNumber(now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthPadded = String(month).padStart(2, "0");
  const prefix = `INV/${year}/${monthPadded}/`;

  const rows = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from invoices where invoice_number like ${prefix + "%"}`,
  );

  const nextSeq = (rows[0]?.count ?? 0) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}
