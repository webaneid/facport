import { AccurateApiError } from "./accurate";
import { alignSavedDetailItems } from "./import-mapping/source-expansion";
import type { ExistingSalesInvoice } from "./accurate-sales-invoice";
import type { ExistingPurchaseInvoice } from "./accurate-purchase-invoice";
import { EXPENSE_ONLY_ROW_MARKER } from "./import-mapping/purchase-invoice.mapping";

// § 2026-10-26 (client Tuparev & Banjaran, Fase 208) — Faktur Penjualan SUDAH tersimpan di Accurate, tetapi baris di Facport berstatus Gagal (Facport dulu gagal
// membaca baris tambahan otomatis Accurate untuk item paket). Retry/unggah ulang → save.do menolak "Sudah ada data lain dengan <nomor>". Alih-alih membiarkan
// pengguna menyimpulkan datanya salah, Facport MENGENALI faktur itu: membaca faktur lewat nomor, memastikan isinya memang sama dengan baris di file, lalu menautkan
// baris ke faktur itu dan menandainya sukses lengkap dengan keterangan. Hanya MEMBACA Accurate; dokumen pelanggan tidak diubah.

/** Awal keterangan baris yang ditautkan ke faktur yang sudah ada — dipakai UI untuk mengenali baris jenis ini. */
export const ADOPTED_NOTE_PREFIX = "Sudah ada di Accurate";

const PRICE_TOLERANCE = 1; // Accurate bisa membulatkan harga (mis. 58558.5586 → 58558.56); selisih ≤ Rp1 dianggap sama

export function isDuplicateNumberError(err: unknown): boolean {
  return err instanceof AccurateApiError && /sudah ada data lain dengan/i.test(err.message);
}

export type SentInvoiceLine = { itemNo: string; quantity: number; unitPrice: number };

export type AdoptionResult =
  | { ok: true; invoiceId: number; rows: { rowId: string; detailItemId: number | string }[]; note: string }
  | { ok: false; message: string };

const norm = (v: string) => v.trim().toLowerCase();

/**
 * Putuskan apakah faktur yang sudah ada di Accurate adalah faktur dari baris-baris ini. SEMUA syarat harus terpenuhi (satu saja gagal → tidak ditautkan):
 *  1. nomor sama; 2. Customer sama (bila baris mengisinya); 3. tiap baris yang dikirim ketemu BERURUTAN lewat kode item (`alignSavedDetailItems`: baris sisa
 *  = tambahan Accurate, kodenya tidak boleh sama dengan baris yang dikirim); 4. kuantitas SAMA PERSIS dan harga sama (toleransi pembulatan Rp1) pada tiap
 *  baris; 5. baris tambahan tidak lebih banyak dari baris yang dikirim (pola paket: ≤ 1 baris tambahan per baris) — mencegah file lain yang kebetulan memakai
 *  nomor yang sama dan hanya berisi sebagian item dianggap "sudah ada".
 */
export function matchExistingSalesInvoice(args: {
  rowIds: string[];
  number: string;
  customerNo: string;
  sent: SentInvoiceLine[];
  existing: ExistingSalesInvoice;
}): AdoptionResult {
  const { rowIds, number, customerNo, sent, existing } = args;
  const label = `Faktur Penjualan "${existing.number}" (ID ${existing.id})`;
  const differs = (reason: string): AdoptionResult => ({
    ok: false,
    message: `Nomor Transaksi "${number}" sudah ada di Accurate (${label}), tetapi isinya tidak sama dengan baris di file ini (${reason}). Facport tidak menautkannya agar tidak salah. Periksa fakturnya di Accurate; bila itu faktur lain, gunakan Nomor Transaksi yang berbeda.`,
  });

  if (norm(existing.number) !== norm(number)) return differs("nomor tidak cocok");
  if (customerNo && norm(existing.customerNo) !== norm(customerNo)) return differs(`Customer di Accurate "${existing.customerNo}", di file "${customerNo}"`);
  if (sent.length === 0 || sent.length !== rowIds.length) return differs("baris tidak lengkap");

  const alignment = alignSavedDetailItems(sent.map((l) => l.itemNo), existing.detailItem);
  if (!alignment) return differs("daftar barang tidak cocok berurutan");
  const automatic = existing.detailItem.length - sent.length;
  if (automatic > sent.length) return differs("jumlah baris di Accurate jauh lebih banyak dari file");

  for (let i = 0; i < sent.length; i++) {
    const line = existing.detailItem[alignment[i]!]!;
    if (line.quantity !== sent[i]!.quantity) return differs(`kuantitas ${sent[i]!.itemNo} di Accurate ${line.quantity}, di file ${sent[i]!.quantity}`);
    if (Math.abs(line.unitPrice - sent[i]!.unitPrice) > PRICE_TOLERANCE) return differs(`harga ${sent[i]!.itemNo} di Accurate ${line.unitPrice}, di file ${sent[i]!.unitPrice}`);
  }

  const extra = automatic > 0 ? ` + ${automatic} baris tambahan otomatis dari Accurate (mis. item paket)` : "";
  return {
    ok: true,
    invoiceId: existing.id,
    rows: rowIds.map((rowId, i) => ({ rowId, detailItemId: existing.detailItem[alignment[i]!]!.id })),
    note: `${ADOPTED_NOTE_PREFIX} — ${label} sudah tersimpan pada percobaan sebelumnya dan tidak dibuat ulang. Berisi ${sent.length} baris dari file ini${extra}. Cari nomor ini di Accurate untuk memastikan.`,
  };
}

export type SentPurchaseExpenseLine = { accountNo: string; amount: number };

/**
 * § Fase 214 — padanan `matchExistingSalesInvoice` untuk Faktur Pembelian, ditambah baris Beban. Faktur dari percobaan sebelumnya yang SUDAH tersimpan di Accurate
 * (Facport dulu salah menandai gagal karena baris hanya-Beban) dikenali, bukan dianggap salah data. SEMUA syarat harus terpenuhi:
 *  1. nomor sama; 2. Vendor sama (bila baris mengisinya); 3. tiap baris BARANG yang dikirim ketemu berurutan lewat kode item dan jumlah baris barang di Accurate
 *  SAMA (tanpa baris tambahan — beda dari Faktur Penjualan, di sini tidak ada baris otomatis yang dikenal); 4. kuantitas SAMA PERSIS, harga sama (toleransi
 *  Rp1); 5. baris Beban: jumlah sama dan tiap (akun, jumlah) sama berurutan. `expenseOnly[i]` = baris ke-i hanya berisi Beban (tanpa barang).
 *  Hanya baris yang punya barang mendapat id baris Accurate; baris hanya-Beban diberi `EXPENSE_ONLY_ROW_MARKER`.
 */
export function matchExistingPurchaseInvoice(args: {
  rowIds: string[];
  expenseOnly: boolean[];
  number: string;
  vendorNo: string;
  sentItems: SentInvoiceLine[];
  sentExpenses: SentPurchaseExpenseLine[];
  existing: ExistingPurchaseInvoice;
}): AdoptionResult {
  const { rowIds, expenseOnly, number, vendorNo, sentItems, sentExpenses, existing } = args;
  const label = `Faktur Pembelian "${existing.number}" (ID ${existing.id})`;
  const differs = (reason: string): AdoptionResult => ({
    ok: false,
    message: `Nomor Transaksi "${number}" sudah ada di Accurate (${label}), tetapi isinya tidak sama dengan baris di file ini (${reason}). Facport tidak menautkannya agar tidak salah. Periksa fakturnya di Accurate; bila itu faktur lain, gunakan Nomor Transaksi yang berbeda.`,
  });

  if (norm(existing.number) !== norm(number)) return differs("nomor tidak cocok");
  if (vendorNo && norm(existing.vendorNo) !== norm(vendorNo)) return differs(`Vendor di Accurate "${existing.vendorNo}", di file "${vendorNo}"`);
  if (rowIds.length === 0 || rowIds.length !== expenseOnly.length) return differs("baris tidak lengkap");
  if (sentItems.length !== expenseOnly.filter((only) => !only).length) return differs("baris tidak lengkap");

  if (existing.detailItem.length !== sentItems.length) return differs(`jumlah baris barang di Accurate ${existing.detailItem.length}, di file ${sentItems.length}`);
  if (sentItems.length > 0) {
    const alignment = alignSavedDetailItems(sentItems.map((l) => l.itemNo), existing.detailItem);
    if (!alignment || alignment.some((idx, i) => idx !== i)) return differs("daftar barang tidak cocok berurutan");
    for (let i = 0; i < sentItems.length; i++) {
      const line = existing.detailItem[i]!;
      if (line.quantity !== sentItems[i]!.quantity) return differs(`kuantitas ${sentItems[i]!.itemNo} di Accurate ${line.quantity}, di file ${sentItems[i]!.quantity}`);
      if (Math.abs(line.unitPrice - sentItems[i]!.unitPrice) > PRICE_TOLERANCE) return differs(`harga ${sentItems[i]!.itemNo} di Accurate ${line.unitPrice}, di file ${sentItems[i]!.unitPrice}`);
    }
  }

  if (existing.detailExpense.length !== sentExpenses.length) return differs(`jumlah baris Beban di Accurate ${existing.detailExpense.length}, di file ${sentExpenses.length}`);
  for (let i = 0; i < sentExpenses.length; i++) {
    const saved = existing.detailExpense[i]!;
    if (norm(saved.accountNo) !== norm(sentExpenses[i]!.accountNo)) return differs(`akun Beban ke-${i + 1} di Accurate "${saved.accountNo}", di file "${sentExpenses[i]!.accountNo}"`);
    if (Math.abs(saved.amount - sentExpenses[i]!.amount) > PRICE_TOLERANCE) return differs(`jumlah Beban akun ${sentExpenses[i]!.accountNo} di Accurate ${saved.amount}, di file ${sentExpenses[i]!.amount}`);
  }

  let nextItem = 0;
  const rows = rowIds.map((rowId, i) => ({ rowId, detailItemId: expenseOnly[i] ? EXPENSE_ONLY_ROW_MARKER : existing.detailItem[nextItem++]!.id }));
  return {
    ok: true,
    invoiceId: existing.id,
    rows,
    note: `${ADOPTED_NOTE_PREFIX} — ${label} sudah tersimpan pada percobaan sebelumnya dan tidak dibuat ulang. Berisi ${sentItems.length} baris barang dan ${sentExpenses.length} baris Beban dari file ini. Cari nomor ini di Accurate untuk memastikan.`,
  };
}
