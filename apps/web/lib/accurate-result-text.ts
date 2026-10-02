// § evaluasi client 2026-10-03 (AutoProduksi) — kolom hasil dulu menampilkan id internal numerik Accurate
// (mis. "1250"), bukan nomor transaksi yang client lihat di Accurate. Sekarang nomor transaksi (mis.
// ADJ.2026.10.00001); baris lama (sebelum kolom nomor ada) hanya punya id, tampil berlabel supaya tidak
// membingungkan. Dipakai Riwayat dan halaman hasil batch Import Produksi.
export function accurateResultText(row: { accurateTransactionNumber?: string | null; accurateTransactionId: string | null; errorMessage: string | null }): string {
  if (row.accurateTransactionNumber) return row.accurateTransactionNumber;
  if (row.accurateTransactionId) return `ID internal ${row.accurateTransactionId}`;
  return row.errorMessage ?? "-";
}
