import type { SalesQuotationDetail } from "../accurate-sales-quotation";
import { expandQuotationEntry, QUOTATION_HEADER_KEYS } from "./sales-order.mapping";
import { applySourceHeaderExtras, applySourceLineExtras } from "./source-extras";

// § Fase 225/226 — inti bersama "ambil SISA baris dokumen sumber pembelian" (Receive Item ← PO; Faktur Pembelian ← Penerimaan Barang / PO). ID baris sumber
// WAJIB dikirim: terbukti di Accurate asli, tanpa itu baris Item No kembar tertaut ke baris PERTAMA tanpa error.

export type PurchaseSourceDoc = SalesQuotationDetail & { vendorNo?: string };
export type RowSource = { number: string; label: string; detailIdField: string; fetch: (number: string) => Promise<PurchaseSourceDoc> };

export function cellOf(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): string {
  const column = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  const value = column ? rawRow[column] : undefined;
  return value === undefined || value === null ? "" : String(value).trim();
}

/**
 * Ubah `payload.detailItem` (sejajar `entryRows`) di tempat; `sources[i]` null = baris biasa. Mengembalikan `offsets[i]` = indeks detail hasil tempat entri ke-i mulai.
 */
export async function expandPurchaseSourceRows(
  payload: Record<string, unknown>,
  entryRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  sources: (RowSource | null)[],
): Promise<number[]> {
  const detailItem = payload.detailItem as Record<string, unknown>[];
  const offsets: number[] = [];
  const expanded: Record<string, unknown>[] = [];
  const used = new Set<string>();
  let first: PurchaseSourceDoc | undefined;
  for (let i = 0; i < detailItem.length; i++) {
    const entry = detailItem[i]!;
    offsets.push(expanded.length);
    const source = sources[i];
    if (!source) {
      expanded.push(entry);
      continue;
    }
    const { number, label } = source;
    // PO tidak selalu ditolak Accurate bila berlebih — dokumen sumber yang sama dua kali dalam 1 dokumen akan menggandakan jumlah.
    const key = `${label}:${number.toLowerCase()}`;
    if (used.has(key)) throw new Error(`${label} "${number}" dipakai di lebih dari satu baris kosong dalam dokumen yang sama, padahal satu baris sudah mengambil SEMUA sisanya. Cukup satu baris per nomor.`);
    used.add(key);
    const doc = await source.fetch(number);
    const vendorNo = cellOf(entryRows[i]!, columnMapping, "vendorNo");
    if (doc.vendorNo && doc.vendorNo.toLowerCase() !== vendorNo.toLowerCase()) {
      throw new Error(`${label} "${number}" milik pemasok "${doc.vendorNo}", bukan "${vendorNo}" — periksa kolom Vendor No.`);
    }
    first ??= doc;
    expandQuotationEntry(entry, doc.lines).forEach((e, k) => {
      const line = doc.lines[k]!;
      delete e.salesmanListNumber; // modul pembelian tidak punya penjual
      if (line.warehouseName && !e.warehouseName) e.warehouseName = line.warehouseName;
      if (line.sourceDetailId !== undefined) e[source.detailIdField] = line.sourceDetailId;
      applySourceLineExtras(e, line, { includeCustomFields: true });
      expanded.push(e);
    });
  }
  payload.detailItem = expanded;
  if (!first) return offsets;
  for (const key of QUOTATION_HEADER_KEYS) {
    // Diskon NOMINAL header milik seluruh dokumen sumber — salah untuk sisa, jadi tidak ditarik (persen tetap ditarik).
    if (key !== "cashDiscount" && payload[key] === undefined && first.header[key] !== undefined) payload[key] = first.header[key];
  }
  applySourceHeaderExtras(payload, first, { includeCustomFields: true });
  return offsets;
}
