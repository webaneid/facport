import { AccurateApiError } from "./accurate";
import { alignSavedDetailItems } from "./import-mapping/source-expansion";
import type { ExistingSalesInvoice } from "./accurate-sales-invoice";

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
  | { ok: true; invoiceId: number; rows: { rowId: string; detailItemId: number }[]; note: string }
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
