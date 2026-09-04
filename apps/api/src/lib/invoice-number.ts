import { sql } from "drizzle-orm";
import { db } from "./db";
import { invoiceSequences } from "../db/schema";

// § Fase 16, ADR-0022 — GANTI pola `COUNT(*) LIKE 'INV/...%'` (Fase 15,
// rawan race condition: 2 checkout bersamaan bisa hitung baris yang sama
// sebelum keduanya INSERT, dapat nomor invoice identik). Sekarang pakai
// `invoiceSequences` (1 baris per year+month) + `INSERT ... ON CONFLICT
// DO UPDATE ... RETURNING` — SATU statement atomik di level row Postgres,
// bukan read-then-write terpisah. Adaptasi pola `financial_sequences` /
// `generateFinancialNumber` yang TERBUKTI production (jalajogja), lihat
// docs/architecture/architecture-payment.md § "Nomor Invoice".
export async function generateInvoiceNumber(now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const rows = await db
    .insert(invoiceSequences)
    .values({ year, month, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [invoiceSequences.year, invoiceSequences.month],
      set: { lastNumber: sql`${invoiceSequences.lastNumber} + 1`, updatedAt: new Date() },
    })
    .returning({ lastNumber: invoiceSequences.lastNumber });

  const seq = rows[0]?.lastNumber ?? 1;
  const monthPadded = String(month).padStart(2, "0");
  return `INV/${year}/${monthPadded}/${String(seq).padStart(4, "0")}`;
}
