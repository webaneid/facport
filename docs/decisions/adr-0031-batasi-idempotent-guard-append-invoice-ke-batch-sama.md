# ADR-0031: Batasi Idempotent-Guard "Append ke Faktur Existing" Hanya untuk Retry dalam Batch yang Sama

**Status:** Accepted
**Tanggal:** 2026-09-08

## Context
ADR-0012 (Retry Cerdas — Update Faktur Existing via `save.do`) menambah
mekanisme: kalau Bill No/Trans No grup ini SUDAH PERNAH sukses jadi
faktur (lintas-batch, subscription sama), sistem APPEND item baru ke
faktur existing (bukan create faktur baru yang bakal ditolak Accurate
sebagai duplikat nomor). Sebagai bagian dari itu, ada guard idempotent:
kalau SEMUA item baris grup PERSIS SAMA (`itemNo`+`unitPrice`+`quantity`)
dengan yang sudah ada di faktur existing, `save.do` DI-SKIP TOTAL
(dianggap sukses tanpa panggilan API) — didesain untuk retry-safety
(cegah item dobel kalau tombol Retry diklik berkali-kali).

**Bug produksi ditemukan (2026-09-08)**: client testing fitur Atribut
Tambahan Sales Invoice — upload batch BARU (bukan retry) yang KEBETULAN
Trans No + item + harga + qty-nya PERSIS SAMA dengan batch test
SEBELUMNYA (iterasi wajar: pakai file template yang sama, tambah kolom
PPN/Atribut Tambahan, upload ulang). Guard idempotent ADR-0012
men-skip `save.do` SEPENUHNYA untuk baris ini — field BARU (PPN,
Atribut Tambahan) TIDAK PERNAH benar-benar terkirim ke Accurate, tapi
baris tetap dilaporkan "success" tanpa info apa pun. Dibuktikan lewat
data produksi nyata: batch `de033564-...` (11:34) dan `977775bc-...`
(11:44) — 2 batch BERBEDA — menghasilkan `accurate_transaction_id`
DAN `accurate_detail_item_id` yang **identik** (102350 / 102250,
102251), padahal batch ke-2 seharusnya membawa data field baru.

## Decision
Guard idempotent ADR-0012 (skip `save.do` kalau semua item sudah match)
**HANYA berlaku kalau match ditemukan di BATCH YANG SAMA** dengan baris
yang sedang diproses (retry-safety asli ADR-0012: partial completion —
sebagian baris 1 grup sudah sukses sebelum crash/retry, SISANYA
di-retry, group masih dalam 1 batch yang sama).

Kalau match ditemukan di **BATCH LAIN/SEBELUMNYA** DAN tidak ada satu
pun baris baru untuk dikirim — ini BUKAN retry, melainkan upload baru
yang kebetulan identik. Sistem SEKARANG menolak dengan pesan jelas
(row jadi `failed`, `errorMessage` menyebutkan faktur existing yang
"bentrok"), BUKAN silent success.

Kalau match ditemukan di batch lain TAPI ADA sebagian baris baru untuk
ditambahkan (genuine append use case ADR-0012 — mis. lanjutan input
line item untuk faktur yang sama di sesi berbeda) — behavior TETAP
seperti ADR-0012 asli, append normal.

## Implementasi
`apps/api/src/lib/append-invoice-guard.ts` — fungsi murni
`isCoincidentalDuplicateAcrossBatches({ newRowsCount, existingBatchId,
currentBatchId })`, dipanggil dari `appendToExistingPurchaseInvoice`
DAN `appendToExistingSalesInvoice` (`apps/api/src/workers/index.ts`) —
diterapkan KONSISTEN ke kedua modul (bug sama, mirror 1:1). Fungsi
finder (`findExistingAccurateInvoiceId`/`findExistingAccurateSalesInvoiceId`)
diperluas kembalikan `batchId` sumber match, bukan cuma
`accurateTransactionId`.

## Alternatif yang Dipertimbangkan
- **Hapus guard idempotent sepenuhnya** — ditolak, akan meregresi
  retry-safety ADR-0012 (retry berkali-kali pada batch yang sama bisa
  bikin item dobel di faktur Accurate).
- **Perluas kriteria "duplicate" (ikut bandingkan field pajak/atribut,
  bukan cuma itemNo+harga+qty)** — ditolak, memperluas kriteria match
  membuat retry-safety asli JADI TIDAK RELIABLE (baris retry yang
  formatnya sedikit beda dari percobaan pertama bisa salah dianggap
  "item baru", menyebabkan item dobel beneran di faktur Accurate —
  risiko lebih besar dari masalah yang mau diperbaiki).
- **Selalu tolak kalau match ditemukan (hapus fitur append sepenuhnya)**
  — ditolak, akan meregresi TOTAL tujuan ADR-0012 (append genuine untuk
  faktur yang sengaja dilanjutkan lintas sesi import).

## Konsekuensi
- Client yang testing berulang dengan data identik (item+harga+qty+
  Trans No sama) SEKARANG dapat pesan error yang jelas, bukan silent
  success yang menyesatkan.
- User yang GENUINE ingin lanjutkan faktur yang sama (Trans No sama,
  item BARU/beda) di batch terpisah TETAP bisa (behavior ADR-0012 tidak
  berubah untuk kasus ini).
- Update-in-place untuk field NON-item (pajak, atribut tambahan, dst)
  pada faktur yang SUDAH ADA persis TETAP tidak didukung — pesan error
  mengarahkan user untuk pakai Trans No baru atau edit manual di
  Accurate, BUKAN mencoba auto-update (di luar scope ADR ini).

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-XXXX" di file baru itu.
