import type { SalesQuotationDetail } from "../accurate-sales-quotation";
import { expandQuotationEntry, QUOTATION_HEADER_KEYS } from "./sales-order.mapping";
import { salesInvoiceMapping } from "./sales-invoice.mapping";
import { applySourceHeaderExtras, applySourceLineExtras } from "./source-extras";

// § Fase 198, architecture-sales-invoice.md § "Fase 198" — Sales Invoice menarik isi dokumen sumber (SQ / SO / DO) cukup dengan nomornya.
// Pola Fase 169/172 (Sales Order ← Sales Quotation): baris dengan SALAH SATU nomor sumber terisi DAN keenam kolom item kosong diperluas
// menjadi SEMUA baris item dokumen sumber; salah satu kolom item terisi → seluruhnya dari Excel (faktur parsial). Isian Excel menang.
// Tahap A: Sales Quotation. Tahap B: + Sales Order. Tahap C: + Delivery Order (membawa gudang baris; Beban tidak ditarik).

export type SourceKind = "deliveryOrder" | "salesOrder" | "salesQuotation";

// Urutan = PRIORITAS Accurate (spec: ketiga field saling terhubung, hanya SATU diproses: DO > SO > SQ).
const SOURCES: { kind: SourceKind; field: string; entryKey: string }[] = [
  { kind: "deliveryOrder", field: "itemDeliveryOrderNo", entryKey: "deliveryOrderNumber" },
  { kind: "salesOrder", field: "itemSalesOrderNo", entryKey: "salesOrderNumber" },
  { kind: "salesQuotation", field: "itemSalesQuotationNo", entryKey: "salesQuotationNumber" },
];

// Sumber yang SUDAH bisa diperluas. Sumber berprioritas tinggi yang belum didukung TIDAK boleh dilewati demi sumber di bawahnya (Accurate
// akan menautkan ke sumber berprioritas tinggi → isi yang ditarik bisa tidak cocok), jadi baris itu diperlakukan biasa (item wajib diisi).
export const SUPPORTED_SOURCE_KINDS: ReadonlySet<SourceKind> = new Set<SourceKind>(["salesQuotation", "salesOrder", "deliveryOrder"]);

export const SOURCE_EXPANDABLE_FIELDS = ["itemNo", "itemName", "unitPrice", "itemNotes", "quantity", "itemUnitName"] as const;
// Subset `requiredFields` Sales Invoice yang dikecualikan untuk baris perluasan. `warehouseName` TIDAK dikecualikan untuk SQ/SO (baris penawaran/pesanan
// tidak membawa gudang) — hanya untuk sumber Delivery Order, yang membawa gudang per baris (§ `expandSourceRowsInPayload` menolak bila tidak terbaca).
export const SOURCE_EXPANSION_EXEMPT_REQUIRED = new Set<string>(["itemNo", "unitPrice", "quantity"]);
const DELIVERY_ORDER_EXTRA_EXEMPT = new Set<string>(["warehouseName"]);

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

/** Apakah field wajib ini dikecualikan untuk baris ini (hanya berlaku bila baris itu baris perluasan). Satu sumber aturan untuk server DAN UI. */
export function isRequiredFieldExemptForRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>, field: string): boolean {
  if (!isSourceExpansionRow(rawRow, columnMapping)) return false;
  if (SOURCE_EXPANSION_EXEMPT_REQUIRED.has(field)) return true;
  return sourceOfRow(rawRow, columnMapping)?.kind === "deliveryOrder" && DELIVERY_ORDER_EXTRA_EXEMPT.has(field);
}

/** Field wajib yang kosong di SATU baris — baris perluasan tidak diwajibkan mengisi Item No/Harga/Qty (+ gudang untuk sumber Delivery Order). */
export function missingRequiredFieldsForRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  return salesInvoiceMapping.requiredFields.filter((field) => {
    if (isRequiredFieldExemptForRow(rawRow, columnMapping, field)) return false;
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
    const entries = expandQuotationEntry(entry, detail.lines);
    if (source.kind === "deliveryOrder") {
      // Gudang wajib di Sales Invoice: Excel menang, kosong → dari baris pengiriman; tidak ada keduanya → gagal jelas (tidak kirim data kosong).
      entries.forEach((e, k) => {
        const fromDoc = detail!.lines[k]!.warehouseName;
        if ((e.warehouseName === undefined || e.warehouseName === "") && fromDoc) e.warehouseName = fromDoc;
        if (e.warehouseName === undefined || e.warehouseName === "") {
          throw new Error(
            `Gudang untuk baris ke-${k + 1} pengiriman "${source.number}" tidak terbaca dari Accurate — isi kolom Item Warehouse di Excel (berlaku ke semua baris pengiriman ini).`,
          );
        }
      });
    }
    // § Fase 198 (lanjutan, sedang) — atribut tambahan baris (Kategori Keuangan, custom karakter/angka, PPnBM): hanya mengisi yang KOSONG di Excel.
    entries.forEach((e, k) => applySourceLineExtras(e, detail!.lines[k]!, { includeCustomFields: true }));
    expanded.push(...entries);
  }
  payload.detailItem = expanded;

  const first = used[0];
  if (!first) return offsets;
  for (const key of QUOTATION_HEADER_KEYS) {
    if (payload[key] === undefined && first.detail.header[key] !== undefined) payload[key] = first.detail.header[key];
  }
  applySourceHeaderExtras(payload, first.detail, { includeCustomFields: true });
  if (payload.detailExpense === undefined) {
    // Beban TIDAK ditarik dari Delivery Order: `detailExpense` Sales Invoice tidak punya `deliveryOrderNumber` (Fase 77) dan pengiriman bukan dokumen biaya.
    const pulled = used.filter((u) => u.entryKey !== "deliveryOrderNumber").flatMap(({ entryKey, number, detail }) =>
      detail.expenses.map((ex) => ({
        accountNo: ex.accountNo,
        expenseAmount: ex.expenseAmount,
        [entryKey]: number,
        ...(ex.departmentName ? { departmentName: ex.departmentName } : {}),
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

/**
 * § 2026-10-26 (client Tuparev & Banjaran, Fase 208) — Accurate menambah baris OTOMATIS pada faktur yang memuat item paket/grup
 * (mis. tiap `PKT013` diikuti baris "--NP …" kode `NP0013` berharga 0). Faktur SUDAH tersimpan di Accurate, tapi jumlah detail hasil
 * simpan ≠ jumlah yang dikirim sehingga `mapDetailIdsToRows` menolak dan SEMUA baris tampil "Gagal" padahal fakturnya ada.
 *
 * Penyelarasan AMAN (bukan tebakan): tiap baris yang DIKIRIM harus ketemu, berurutan, pada baris hasil simpan dengan kode item yang sama
 * (pencocokan berurutan; kode kembar tetap benar karena baris tambahan tidak boleh berkode sama dengan baris yang dikirim). Baris sisa
 * (tambahan Accurate) hanya diterima bila kodenya TIDAK ada di antara kode yang dikirim — kalau ada, ambigu → `null` (tetap ditolak).
 * Mengembalikan indeks baris hasil simpan untuk tiap baris yang dikirim (panjang = jumlah dikirim), atau `null` bila tidak terbukti aman.
 */
export function alignSavedDetailItems(sentItemNos: string[], saved: { id: number; itemNo: string }[]): number[] | null {
  const norm = (v: string) => v.trim().toLowerCase();
  const sent = sentItemNos.map(norm);
  if (sent.length === 0 || sent.some((code) => code === "")) return null; // kode item kosong → tidak bisa dicocokkan
  if (saved.length < sent.length) return null;
  const sentCodes = new Set(sent);
  const savedCodes = saved.map((d) => norm(d.itemNo));

  const alignment: number[] = [];
  let cursor = 0;
  for (const code of sent) {
    while (cursor < savedCodes.length && savedCodes[cursor] !== code) {
      // baris yang dilewati = tambahan Accurate; TIDAK boleh berkode sama dengan salah satu baris yang dikirim
      if (sentCodes.has(savedCodes[cursor]!)) return null;
      cursor++;
    }
    if (cursor >= savedCodes.length) return null;
    alignment.push(cursor);
    cursor++;
  }
  // sisa di belakang baris terakhir yang dikirim juga harus tambahan murni
  for (; cursor < savedCodes.length; cursor++) {
    if (sentCodes.has(savedCodes[cursor]!)) return null;
  }
  return alignment;
}

/**
 * Pilih daftar detail hasil simpan yang dipakai `mapDetailIdsToRows`. Jumlah sama → apa adanya (tanpa panggilan tambahan). Lebih banyak →
 * baca detail faktur (butuh kode item) dan selaraskan lewat `alignSavedDetailItems`; berhasil → daftar ringkas sepanjang baris yang dikirim.
 * Gagal membaca / tidak terbukti aman → kembalikan daftar asli, sehingga `mapDetailIdsToRows` menolak seperti sebelumnya (tidak pernah menebak).
 */
export async function selectSavedDetailForMapping(
  sentItemNos: string[],
  savedFromSave: { id: number }[],
  fetchSavedDetail: () => Promise<{ id: number; itemNo: string }[]>,
  onAligned?: (info: { sent: number; returned: number }) => void,
  onFetchError?: (err: unknown) => void,
): Promise<{ id: number }[]> {
  if (savedFromSave.length <= sentItemNos.length) return savedFromSave;
  try {
    const detail = await fetchSavedDetail();
    const alignment = alignSavedDetailItems(sentItemNos, detail);
    if (!alignment) return savedFromSave;
    onAligned?.({ sent: sentItemNos.length, returned: detail.length });
    return alignment.map((index) => detail[index]!);
  } catch (err) {
    onFetchError?.(err);
    return savedFromSave;
  }
}

const SOURCE_QUANTITY_ERROR = /melebihi yang (dikirim|dipesan|ditawarkan|diterima)|melebihi (jumlah|kuantitas|qty)/i;

/**
 * § 2026-10-20 — galat Accurate "Kuantitas … di faktur melebihi yang dikirim" pada baris yang MENGAMBIL ISI dari dokumen sumber: Facport menarik kuantitas ASLI dokumen sumber,
 * belum mengurangi retur/penagihan sebelumnya (field sisa kuantitas belum diketahui). Pesan asli Accurate tetap utuh; ditambah penjelasan + cara mengisinya sendiri.
 */
export function annotateSourceExpansionFailure(message: string, rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): string {
  if (!SOURCE_QUANTITY_ERROR.test(message)) return message;
  const expansion = rawRows.map((r) => ({ row: r, source: isSourceExpansionRow(r, columnMapping) ? sourceOfRow(r, columnMapping) : null })).find((x) => x.source);
  if (!expansion?.source) return message;
  const doc = { deliveryOrder: "Delivery Order", salesOrder: "Sales Order", salesQuotation: "Sales Quotation" }[expansion.source.kind];
  if (expansion.source.kind === "deliveryOrder") {
    // DO: kuantitas diambil dari SISA yang tersedia menurut Accurate (sudah dikurangi retur & penagihan sebelumnya); galat ini berarti sisa berubah/tidak cocok.
    return (
      `${message} Baris ini mengambil sisa yang tersedia dari ${doc} ${expansion.source.number} menurut Accurate (sudah dikurangi retur dan penagihan sebelumnya). ` +
      "Jika masih ditolak, isi kolom Item No, Item Unit Price, dan Item Qty sendiri di Excel; nomor dokumen sumber tetap diisi untuk menautkan."
    );
  }
  return (
    `${message} Baris ini mengambil isi dari ${doc} ${expansion.source.number} dengan kuantitas ASLI dokumen itu; bila dokumen tersebut pernah diretur atau ditagih sebagian, ` +
    "kuantitas yang boleh ditagih lebih kecil. Isi kolom Item No, Item Unit Price, dan Item Qty (sebesar sisa yang boleh ditagih) sendiri di Excel; nomor dokumen sumber tetap diisi untuk menautkan."
  );
}
