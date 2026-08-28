# Fase 09 — Batal Import (Hapus Faktur di Accurate)

**Status:** Done
**Mulai:** 2026-08-28
**Selesai:** 2026-08-28

## Tujuan
Item ke-3 dari 3 feedback client pasca-presentasi 2026-08-27 (item 1 =
Fase 07, item 2 = Fase 06), sengaja ditunda sampai Fase 06 & Fase 08
solid. Tombol "Batal Import" di tabel Riwayat Import yang BENERAN
menghapus transaksi terkait dari Accurate Online (bukan cuma
menyembunyikan record lokal Facport), aman terhadap risiko data-loss
lintas-batch yang ditimbulkan mekanisme Fase 08 (append ke faktur
existing). Detail riset & keputusan → ADR-0013 (desain awal) dan
ADR-0014 (koreksi penting, ditemukan lewat verifikasi nyata fase ini —
lihat § Ringkasan Hasil).

## Scope
- [x] **Verifikasi wajib** (langkah pertama, sebelum kode apa pun):
      konfirmasi nyata `save.do` respons CREATE mengandung
      `detailItem[].id`, dan `delete.do` benar menghapus (bukan
      soft-delete). Hasil: KEDUANYA terkonfirmasi via test call nyata
      (buat+hapus 1 test invoice, self-cleaning).
- [x] Schema: `import_batch_rows.accurateDetailItemId` (varchar,
      nullable) + `cancelledAt` (timestamptz, nullable); status baru
      `"cancelled"` (row) dan `"cancelled"`/`"cancelled_partial"` (batch).
- [x] Tangkap `accurateDetailItemId` di jalur CREATE
      (`processPurchaseInvoiceGroup`, Fase 06) & UPDATE
      (`appendToExistingPurchaseInvoice`, Fase 08) — refactor update
      grup dari bulk (`inArray`) jadi per-baris.
- [x] `deletePurchaseInvoice()` baru di `lib/accurate-purchase-invoice.ts`.
- [x] Job baru `CANCEL_IMPORT` — eligibility check lintas-batch (blokir
      kalau ada baris manapun tanpa `accurateDetailItemId`, ATAU kalau
      faktur ternyata gabungan lintas-batch — **direvisi dari desain awal
      "susutkan", lihat ADR-0014**), delete-utuh HANYA untuk faktur yang
      100% milik 1 batch.
- [x] Endpoint `POST /purchase-invoice/import/:batchId/cancel` (pola
      sama retry — ownership check, permission `import.create`).
- [x] `GET /purchase-invoice/import` — tambah pagination (`offset` + `total`).
- [x] Audit log (`auditLogs`, tabel sudah ada) per batch yang dibatalkan.
- [x] Halaman arsip baru `purchase-invoice/import/riwayat` — semua batch,
      paginated, kolom aksi icon (Detail=`Eye`, Batal Import=`Trash2`).
- [x] Dashboard — link "Tampilkan Arsip Lain →" ke halaman arsip (tabel
      5-baris existing TIDAK diubah).
- [x] Dialog konfirmasi type-to-confirm (ketik ulang nama file batch).

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Purchase Invoice — Batal Import / Hapus Faktur (Fase 09)"
- ADR: `docs/decisions/adr-0013-batal-import.md` (desain awal),
  `docs/decisions/adr-0014-batal-import-faktur-gabungan-diblokir.md`
  (koreksi — faktur gabungan DIBLOKIR, bukan disusutkan)
- Fase sebelumnya: Fase 06 (ADR-0011, multi-item), Fase 08 (ADR-0012,
  update faktur existing)

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
- Verifikasi nyata skenario 2 (faktur gabungan) SEMPAT dilakukan dengan
  desain "susutkan" ASLI (sebelum ADR-0014) — hasilnya JUSTRU yang
  menemukan bug (job melaporkan sukses padahal faktur Accurate tidak
  berubah). Kode langsung diperbaiki (susutkan dihapus, ganti blokir)
  SEBELUM fase ditutup — bukan technical debt yang ditunda.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] Temuan Critical/High — tidak ada
- [x] `docs/PROGRESS.md` diupdate
- [x] **Divalidasi ke akun Accurate Online NYATA** — 3 skenario riil
      (lihat § Ringkasan Hasil untuk detail lengkap tiap skenario)

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Batch yang diproses SEBELUM fase ini tidak punya `accurateDetailItemId`
  tercatat → tidak bisa di-cancel otomatis (diblokir by design, lihat
  ADR-0013 Decision #2), perlu dihapus manual di Accurate kalau memang
  dibutuhkan.
- **Batasan BARU, ditemukan lewat verifikasi nyata (ADR-0014)**: faktur
  yang PERNAH disentuh append lintas-batch (Fase 08) — dari batch manapun,
  ke arah manapun — TIDAK BISA di-cancel otomatis SAMA SEKALI, bukan cuma
  kalau tracking-nya tidak lengkap. Accurate tidak menyediakan cara aman
  menghapus 1 item dari faktur multi-item lewat API publik (`save.do`
  detailItem bersifat upsert-only, `delete.do` cuma hapus faktur utuh).
  Cakupan efektif "Batal Import" jadi: HANYA batch yang Bill No-nya tidak
  pernah dipakai/di-retry batch lain.
- Perilaku Accurate saat faktur sudah "dipakai" downstream (dibayar/
  direferensikan transaksi lain) ditangani sebagai error per-faktur
  (batch jadi `cancelled_partial`, bukan gagal total) — belum ketemu
  contoh nyata pesan errornya di verifikasi fase ini (semua test invoice
  masih fresh/belum dipakai downstream), akan dicatat begitu ketemu di
  pemakaian produksi.

## Ringkasan Hasil
Tombol "Batal Import" (halaman arsip baru `/purchase-invoice/import/riwayat`)
menghapus PERMANEN transaksi Purchase Invoice terkait dari Accurate
Online, dengan pengaman ganda: (1) eligibility check lintas-batch — WAJIB
semua baris yang pernah terhubung ke faktur itu (batch manapun) punya
`accurateDetailItemId` tercatat, kalau tidak → blokir; (2) faktur yang
gabungan lintas-batch (sekarang, PASCA-ADR-0014) juga DIBLOKIR total —
**tidak ada cara aman menghapus SEBAGIAN item dari faktur lewat API
Accurate**, temuan penting yang BARU ketemu lewat verifikasi nyata fase
ini sendiri (lihat ADR-0014). Auto-cancel yang benar-benar jalan HANYA
untuk faktur yang 100% milik 1 batch — dieksekusi via `delete.do` (hapus
faktur utuh), verified aman (tidak soft-delete, permanen).

**Diverifikasi PENUH lewat 3 skenario nyata** ke Data Usaha Accurate asli
("PT Frozen Food", akun `user1@fasport.com`), lewat job worker
sungguhan (bukan simulasi/mock):
1. **Faktur murni 1 batch** → cancel → row lokal `cancelled`, faktur
   Accurate BENAR HILANG (`detail.do` balas `s:false`). ✅
2. **Faktur gabungan lintas-batch** (batch A buat faktur, batch B append
   item — dikonfirmasi append BEKERJA, faktur dapat 2 detailItem) →
   cancel batch A DENGAN kode "susutkan" versi ASLI → job melaporkan
   `cancelled` TAPI faktur Accurate TIDAK BERUBAH (kedua item MASIH ADA)
   — **BUG SERIUS ketemu di sini**, akar masalahnya diriset (2 test
   terpisah, termasuk jeda 45 detik buat pastikan bukan isu timing) →
   dikonfirmasi `save.do` upsert-only, ADR-0014 ditulis, kode diperbaiki
   (susutkan dihapus, ganti blokir) SEBELUM fase ditutup.
3. **Setelah fix, di-deploy ulang (v1.6.1) dan DIULANG NYATA ke Accurate**
   — skenario faktur gabungan (batch A buat, batch B append, dikonfirmasi
   2 item) → cancel batch A → batch jadi `cancelled_partial`, row A
   **TETAP `success`** (tidak diubah), dan faktur Accurate **TIDAK
   BERUBAH SAMA SEKALI** (`detail.do` fresh: masih 2 item persis sama) —
   perilaku sekarang JUJUR (tidak ada silent no-op yang salah lapor
   sukses). Skenario 1 (faktur murni 1 batch) DIULANG juga di v1.6.1 —
   tetap sukses persis seperti sebelumnya.

Test invoice yang dipakai verifikasi SEMUA sudah dibersihkan (dihapus)
sebagai bagian proses test — invoice skenario-1 self-cleaning lewat
fitur Batal Import sendiri, invoice skenario-2 (faktur gabungan, TIDAK
BISA dihapus lewat fitur karena memang diblokir by design) dibersihkan
manual via `delete.do` langsung di akhir test — TIDAK ada data test
tersisa di Data Usaha client. Hasil test suite: 61/61 tetap lolos (tidak
ada regresi, karena perubahan Fase 09 tidak menyentuh logic murni
`purchase-invoice.mapping.ts`), typecheck 0 error, security review 0
temuan.

**Pelajaran penting** (juga dicatat `docs/lessons-learned.md`): asumsi
"detailItem di-REPLACE penuh" dari ADR-0012 TERBUKTI cuma valid untuk
arah TAMBAH (satu-satunya arah yang pernah diuji Fase 08) — arah BUANG
tidak pernah diuji sampai fase ini, dan ternyata TIDAK didukung sama
sekali. Ini konsisten dengan standar project: asumsi soal perilaku
Accurate WAJIB diuji ulang tiap kali dipakai untuk skenario BARU, tidak
cukup diturunkan dari hasil test skenario yang mirip tapi tidak identik.
