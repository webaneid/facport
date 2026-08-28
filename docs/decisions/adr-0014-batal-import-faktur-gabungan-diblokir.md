# ADR-0014: Faktur Gabungan Lintas-Batch DIBLOKIR dari Batal Import (Koreksi ADR-0013)

**Status:** Accepted
**Tanggal:** 2026-08-28

## Context
ADR-0013 mendesain "Batal Import" untuk faktur gabungan lintas-batch
(akibat Fase 08) dengan cara "menyusutkan" faktur — kirim ulang
`detailItem[]` via `save.do` mode update, HANYA berisi item milik batch
LAIN (referensi via `id`), TANPA item milik batch yang dibatalkan. Asumsi
ini didasarkan pada catatan ADR-0012: *"detailItem yang dikirim ulang
REPLACE seluruh array (bukan merge)."*

**Asumsi ini SALAH** — ADR-0012 cuma pernah menguji arah TAMBAH item
(kirim existing items via `id` + item baru tanpa `id`, semua BERTAMBAH).
Arah BUANG item (omit 1 existing item dari array yang dikirim, harap
terhapus) TIDAK PERNAH diuji sampai verifikasi nyata fase ini (Fase 09,
2026-08-28).

## Riset & Bukti Empiris
Dites 2x secara terpisah terhadap invoice test (Data Usaha "PT Frozen
Food"), keduanya DENGAN cleanup (`delete.do`) setelahnya:

1. **Test langsung** (create 2 item, langsung coba buang 1 via update
   omit) → `save.do` balas `s: false`, error: *"Tidak dapat mengubah
   barang Beras. Proses perhitungan biaya barang belum selesai."* — pada
   awalnya disangka isu timing (kalkulasi biaya barang Accurate belum
   selesai).
2. **Test ulang dengan jeda 45 detik** (pastikan bukan isu timing) →
   `save.do` kali ini balas **`s: true`** ("berhasil disimpan", TIDAK ADA
   error) — tapi fetch ULANG `detail.do` segera sesudahnya menunjukkan
   **KEDUA item MASIH ADA**, termasuk item yang sengaja di-omit dari
   payload update.

**Kesimpulan tidak terbantahkan**: `purchase-invoice/save.do` mode update
bersifat **upsert-only** untuk `detailItem[]` — item yang direferensikan
via `id` dipertahankan/diupdate, item BARU (tanpa `id`) ditambahkan, TAPI
item yang ADA di faktur namun TIDAK disertakan dalam payload **TIDAK
dihapus** (diam-diam dipertahankan apa adanya). Tidak ada field/flag
alternatif (`isDelete`/`_delete`/dst) yang ditemukan di dokumentasi resmi
Accurate untuk mengekspresikan "hapus baris item ini secara eksplisit".
Endpoint delete.do (§ ADR-0013) SUDAH dikonfirmasi cuma hapus SELURUH
faktur, tidak ada mode per-baris juga.

**Ini mengoreksi ADR-0012** — klaim "detailItem di-REPLACE, bukan merge"
SALAH untuk arah pengurangan (cuma benar untuk arah penambahan, yang
memang satu-satunya arah yang diuji Fase 08). ADR-0012 TIDAK diedit
(sudah Accepted, konvensi immutability project) — koreksi didokumentasikan
di sini.

## Decision
**Faktur gabungan lintas-batch (`otherBatchRows.length > 0`) DIBLOKIR
dari auto-cancel** — digabung ke bucket yang SAMA dengan "baris tanpa
tracking id" (ADR-0013 Decision #2), BUKAN disusutkan. Kode
"menyusutkan" (`getPurchaseInvoiceDetail` + `savePurchaseInvoice` dengan
`detailItem` parsial) DIHAPUS dari `workers/index.ts` — diganti langsung
`summary.blocked.push(...)`.

Auto-cancel ("Batal Import") sekarang HANYA berlaku untuk faktur yang
100% milik SATU batch (tidak pernah disentuh batch lain, baik sebagai
pembuat maupun lewat append Fase 08). Ini SATU-SATUNYA kasus yang benar-
benar aman: `delete.do` menghapus faktur utuh, dan karena tidak ada batch
lain yang punya data di faktur itu, tidak ada risiko kehilangan data
pihak lain.

## Konsekuensi
- **Cakupan "Batal Import" jadi LEBIH SEMPIT** dari desain awal ADR-0013
  — batch yang faktur-nya pernah "disentuh" append Fase 08 (dari batch
  manapun, ke arah manapun) TIDAK BISA di-cancel otomatis sama sekali,
  bukan cuma "kalau tracking-nya tidak lengkap". Ini WAJIB dikomunikasikan
  jelas ke user (UI + dokumentasi), bukan disembunyikan sebagai batasan
  teknis kecil.
- **Positif**: tidak ada risiko "silent no-op yang dilaporkan sukses" —
  bug yang SEMPAT terjadi di draf awal (job melaporkan `cancelled`
  padahal faktur Accurate TIDAK berubah sama sekali) sudah tidak mungkin
  terjadi lagi, karena jalur susutkan sudah dihapus total dari kode.
  Ditemukan & diperbaiki SEBELUM fase ditutup, lewat verifikasi nyata —
  bukan lolos ke production.
- **Trade-off diterima**: kalau user butuh benar-benar menghapus SEBAGIAN
  item dari faktur gabungan, satu-satunya jalan adalah manual di Accurate
  langsung (edit faktur, hapus baris item, simpan) — di luar kapabilitas
  API publik Accurate saat ini.

## Referensi
- ADR-0013 — desain awal (bagian "susutkan faktur" dikoreksi ADR ini,
  bagian lain — hapus utuh, blokir baris tanpa tracking, type-to-confirm,
  audit log — TETAP BERLAKU tanpa perubahan).
- ADR-0012 — klaim "detailItem REPLACE" yang terbukti cuma berlaku arah
  tambah, dikoreksi di sini untuk arah buang.
- `docs/phases/phase-09-batal-import.md` — hasil verifikasi nyata lengkap.
