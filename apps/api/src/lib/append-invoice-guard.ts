// § Fase 67 — bug produksi nyata ditemukan (client testing Sales
// Invoice): `appendToExistingPurchaseInvoice`/`appendToExistingSalesInvoice`
// (Fase 08/09, ADR-0012) SENGAJA skip panggil `save.do` kalau SEMUA item
// baris grup ini PERSIS SAMA (itemNo+unitPrice+quantity) dengan yang
// SUDAH ADA di faktur Accurate existing — didesain sebagai retry-safety
// (hindari duplikat kalau tombol Retry diklik berkali-kali, § komentar
// asli "row 2 batch 8b622538"). TAPI ini pattern yang SAMA JUGA
// ke-trigger kalau user upload BATCH BARU (bukan retry) yang KEBETULAN
// pakai Trans No + item + harga + qty yang SAMA PERSIS dengan batch
// SEBELUMNYA (mis. client iterasi test — nambah PPN/Atribut Tambahan di
// file yang sama, upload ulang) — akibatnya field BARU (PPN, Atribut
// Tambahan, dst) TIDAK PERNAH benar-benar terkirim ke Accurate (save.do
// tidak dipanggil sama sekali), tapi batch tetap dilaporkan "success"
// tanpa info apa pun bahwa tidak ada yang benar-benar dikirim ulang.
//
// Fix: bedakan 2 skenario yang KELIHATANNYA sama (newRows.length === 0)
// tapi maksudnya beda:
// 1. Match ditemukan di BATCH YANG SAMA (retry baris yang gagal di
//    tengah proses grup multi-baris, sebagian baris SUDAH sukses
//    sebelum crash/retry) — INI retry-safety asli, TETAP dianggap
//    sukses (behavior lama, TIDAK berubah).
// 2. Match ditemukan di BATCH LAIN/SEBELUMNYA (upload baru yang
//    kebetulan identik) — BUKAN retry, kemungkinan besar user tidak
//    sadar transaksinya "tidak ada yang baru dikirim". Ditolak dengan
//    pesan jelas, BUKAN silent success.
//
// Diekstrak jadi fungsi murni terpisah dari worker (yang tidak punya
// test infrastructure sama sekali, § Known Limitations phase-56/62 dst)
// supaya keputusan intinya tetap bisa dites langsung.
export function isCoincidentalDuplicateAcrossBatches(params: { newRowsCount: number; existingBatchId: string; currentBatchId: string }): boolean {
  return params.newRowsCount === 0 && params.existingBatchId !== params.currentBatchId;
}
