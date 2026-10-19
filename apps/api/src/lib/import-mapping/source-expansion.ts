import type { SalesQuotationDetail } from "../accurate-sales-quotation";
import { expandQuotationEntry, QUOTATION_HEADER_KEYS } from "./sales-order.mapping";
import { salesInvoiceMapping } from "./sales-invoice.mapping";

// § Fase 198, architecture-sales-invoice.md § "Fase 198" — Sales Invoice menarik isi dokumen sumber (SQ / SO / DO) cukup dengan nomornya.
// Pola Fase 169/172 (Sales Order ← Sales Quotation): baris dengan SALAH SATU nomor sumber terisi DAN keenam kolom item kosong diperluas
// menjadi SEMUA baris item dokumen sumber; salah satu kolom item terisi → seluruhnya dari Excel (faktur parsial). Isian Excel menang.
// Tahap A: Sales Quotation. Tahap B: + Sales Order. DO menyusul di tahap C dengan menambah entri `SUPPORTED_SOURCE_KINDS` + fetcher.

export type SourceKind = "deliveryOrder" | "salesOrder" | "salesQuotation";

// Urutan = PRIORITAS Accurate (spec: ketiga field saling terhubung, hanya SATU diproses: DO > SO > SQ).
const SOURCES: { kind: SourceKind; field: string; entryKey: string }[] = [
  { kind: "deliveryOrder", field: "itemDeliveryOrderNo", entryKey: "deliveryOrderNumber" },
  { kind: "salesOrder", field: "itemSalesOrderNo", entryKey: "salesOrderNumber" },
  { kind: "salesQuotation", field: "itemSalesQuotationNo", entryKey: "salesQuotationNumber" },
];

// Sumber yang SUDAH bisa diperluas. Sumber berprioritas tinggi yang belum didukung TIDAK boleh dilewati demi sumber di bawahnya (Accurate
// akan menautkan ke sumber berprioritas tinggi → isi yang ditarik bisa tidak cocok), jadi baris itu diperlakukan biasa (item wajib diisi).
export const SUPPORTED_SOURCE_KINDS: ReadonlySet<SourceKind> = new Set<SourceKind>(["salesQuotation", "salesOrder"]);

export const SOURCE_EXPANDABLE_FIELDS = ["itemNo", "itemName", "unitPrice", "itemNotes", "quantity", "itemUnitName"] as const;
// Subset `requiredFields` Sales Invoice yang dikecualikan untuk baris perluasan. `warehouseName` TIDAK dikecualikan (baris SQ tidak membawa gudang).
export const SOURCE_EXPANSION_EXEMPT_REQUIRED = new Set<string>(["itemNo", "unitPrice", "quantity"]);

function cellOf(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): string {
  const column = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
  if (!column) return "";
  const value = rawRow[column];
  return value === undefined || value === null ? "" : String(value).trim();
}

/** Sumber berprioritas tertinggi yang terisi di baris ini (null bila tidak ada nomor sumber sama sekali). */
export function sourceOfRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { kind: SourceKind; entryKey: string; number: string } | null {
  for (const s of SOURCES) {
    const number = cellOf(rawRow, columnMapping, s.field);
    if (number !== "") return { kind: s.kind, entryKey: s.entryKey, number };
  }
  return null;
}

export function isSourceExpansionRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): boolean {
  const source = sourceOfRow(rawRow, columnMapping);
  if (!source || !SUPPORTED_SOURCE_KINDS.has(source.kind)) return false;
  return !SOURCE_EXPANDABLE_FIELDS.some((f) => cellOf(rawRow, columnMapping, f) !== "");
}

/** Field wajib yang kosong di SATU baris — baris perluasan tidak diwajibkan mengisi Item No/Harga/Qty. */
export function missingRequiredFieldsForRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const expansion = isSourceExpansionRow(rawRow, columnMapping);
  return salesInvoiceMapping.requiredFields.filter((field) => {
    if (expansion && SOURCE_EXPANSION_EXEMPT_REQUIRED.has(field)) return false;
    return cellOf(rawRow, columnMapping, field) === "";
  });
}

export type SourceFetchers = Partial<Record<SourceKind, (number: string) => Promise<SalesQuotationDetail>>>;

/**
 * Perluas `payload.detailItem` (hasil `buildSalesInvoicePayload`, indeks SEJAJAR `rawRows`). Mengubah `payload` di tempat dan mengembalikan
 * `offsets[i]` = indeks `detailItem` hasil perluasan tempat baris Excel ke-i MULAI — dipakai pemanggil memetakan id detail Accurate ke baris
 * Excel (1 baris Excel bisa menjadi N baris, jadi indeks baris ≠ indeks detail). Fetcher disuntikkan (worker: Accurate; test: palsu) dan di-cache
 * per nomor. Header kosong diisi dari dokumen sumber PERTAMA yang diperluas; Beban sumber ditarik hanya bila Excel tidak punya baris Beban.
 */
export async function expandSourceRowsInPayload(
  payload: Record<string, unknown>,
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  fetchers: SourceFetchers,
): Promise<number[]> {
  const detailItem = payload.detailItem as Record<string, unknown>[] | undefined;
  const offsets: number[] = [];
  if (!detailItem) return offsets;
  const cache = new Map<string, SalesQuotationDetail>();
  const expanded: Record<string, unknown>[] = [];
  const used: { entryKey: string; number: string; detail: SalesQuotationDetail }[] = [];
  for (let i = 0; i < detailItem.length; i++) {
    const entry = detailItem[i]!;
    offsets.push(expanded.length);
    const rawRow = rawRows[i] ?? {};
    if (!isSourceExpansionRow(rawRow, columnMapping)) {
      expanded.push(entry);
      continue;
    }
    const source = sourceOfRow(rawRow, columnMapping)!;
    const fetcher = fetchers[source.kind];
    if (!fetcher) throw new Error(`Sumber "${source.kind}" belum didukung untuk pengambilan otomatis — isi kolom item di Excel.`);
    const key = `${source.kind}:${source.number}`;
    let detail = cache.get(key);
    if (!detail) {
      detail = await fetcher(source.number);
      cache.set(key, detail);
      used.push({ entryKey: source.entryKey, number: source.number, detail });
    }
    expanded.push(...expandQuotationEntry(entry, detail.lines));
  }
  payload.detailItem = expanded;

  const first = used[0];
  if (!first) return offsets;
  for (const key of QUOTATION_HEADER_KEYS) {
    if (payload[key] === undefined && first.detail.header[key] !== undefined) payload[key] = first.detail.header[key];
  }
  if (payload.detailExpense === undefined) {
    const pulled = used.flatMap(({ entryKey, number, detail }) =>
      detail.expenses.map((ex) => ({
        accountNo: ex.accountNo,
        expenseAmount: ex.expenseAmount,
        [entryKey]: number,
        ...(ex.expenseName ? { expenseName: ex.expenseName } : {}),
        ...(ex.expenseNotes ? { expenseNotes: ex.expenseNotes } : {}),
      })),
    );
    if (pulled.length > 0) payload.detailExpense = pulled;
  }
  return offsets;
}

/**
 * Petakan id detail hasil `save.do` ke baris Excel: baris ke-i memakai detail pada `offsets[i]` (id detail PERTAMA bila baris itu diperluas).
 * Menolak (bukan menebak) bila Accurate mengembalikan detail lebih sedikit dari yang dikirim — salah-petakan id merusak guard hapus faktur.
 */
export function mapDetailIdsToRows(
  rowIds: string[],
  offsets: number[],
  savedDetailItems: { id: number }[],
  sentDetailCount: number,
): { rowId: string; detailItemId: number }[] {
  if (savedDetailItems.length !== sentDetailCount) {
    throw new Error(`Accurate mengembalikan ${savedDetailItems.length} baris detail, padahal ${sentDetailCount} dikirim — id baris tidak bisa dipetakan dengan aman.`);
  }
  return rowIds.map((rowId, i) => ({ rowId, detailItemId: savedDetailItems[offsets[i]!]!.id }));
}
