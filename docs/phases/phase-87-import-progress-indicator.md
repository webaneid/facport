# Fase 87 — Indikator Progres Import (Reusable)

**Status:** Done
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Import Excel besar (1000-20000 baris) butuh waktu lama diproses ke
Accurate, tapi halaman detail batch selama ini cuma menampilkan teks
ringkasan polos ("X sukses, Y gagal, Z menunggu") — tidak ada progress
bar atau indikasi visual bahwa sistem sedang bekerja. User minta
indikator progres (progress bar + teks berputar bergaya "thinking"
Claude) yang bisa **reuse lintas semua fitur import** (mirror pola
`editable-grid.tsx`, Fase 51).

## Scope
Murni FRONTEND, TIDAK ada perubahan backend/database — riset awal
(sebelum eksekusi) mengonfirmasi database SUDAH menyimpan progress
granular (`importBatchRows.status` di-update per baris/grup SAAT
proses jalan) dan frontend SUDAH polling tiap 3 detik di 6 halaman
detail batch — tinggal render UI dari data yang sudah ada.

- [x] Komponen baru `apps/web/components/import/import-progress.tsx`
      (generic, module-agnostic — pola sama `editable-grid.tsx`)
- [x] Progress bar % ASLI dari `(success+failed)/totalRows` (data
      polling yang sudah ada, BUKAN animasi)
- [x] Teks berputar di bawah bar, HANYA aktif saat `status === "processing"`
- [x] Wiring ke 6 halaman detail batch: Sales Receipt, Purchase Invoice,
      Sales Invoice, Purchase Payment, Journal Voucher, Vendor Payable
      Account
- [x] Unit test komponen (6 test: hidden state, kalkulasi %, siklus
      pesan, edge case total=0, clamp 100%)

## Keputusan Kecil Selama Riset & Eksekusi
- **Cosmetic, bukan real-time literal** — project TIDAK punya event
  stream real-time dari backend (no websocket/SSE, cuma polling
  agregat). User awalnya membayangkan teks berputar "per baris" —
  DIKLARIFIKASI ke user: teks berputar itu murni siklus berbasis
  WAKTU (timer, default 2.5 detik/pesan, urutan tetap lalu ulang dari
  awal), TIDAK sinkron ke baris/step literal yang sedang diproses.
  Yang akurat cuma progress bar-nya (dari data polling asli). User
  setuju scope ini (vs. alternatif "presisi real-time per baris" yang
  butuh perubahan backend besar — ditawarkan eksplisit, user pilih
  yang cosmetic/frontend-only).
- **"Mengirim transaksi" → "Mengirim data"** — koreksi user, supaya
  istilah universal dipakai semua sub-modul (Journal Voucher misalnya
  bukan "transaksi" dalam arti sempit).
- **`messageIntervalMs` dibuat configurable (default 2500ms)** — biar
  unit test bisa jalan cepat tanpa fake timers (project belum punya
  precedent fake timers di test suite frontend), bukan hardcode.
- **Tidak masuk `architecture-components.md`** — index itu khusus 4
  komponen "core" yang WAJIB disiapkan sejak Fase 00 (Autocomplete,
  Editor, Media Library, Image Processing). `editable-grid.tsx` (Fase
  51, komponen reusable sejenis) juga TIDAK ada di situ, cuma
  didokumentasikan di phase doc + PROGRESS.md — `ImportProgress`
  ikut pola yang sama, konsisten.

## File yang Diubah
- `apps/web/components/import/import-progress.tsx` (BARU)
- `apps/web/components/import/import-progress.test.tsx` (BARU, 6 test)
- 6 halaman detail batch — tambah import + 1 baris JSX
  `<ImportProgress status={batch.status} total={batch.totalRows} processed={summary.success + summary.failed} />`
  di dalam `CardHeader` "Ringkasan" (persis di bawah baris `StatusBadge`):
  - `apps/web/app/app/(protected)/sales-receipt/import/[batchId]/page.tsx`
  - `apps/web/app/app/(protected)/purchase-invoice/import/[batchId]/page.tsx`
  - `apps/web/app/app/(protected)/sales-invoice/import/[batchId]/page.tsx`
  - `apps/web/app/app/(protected)/purchase-payment/import/[batchId]/page.tsx`
  - `apps/web/app/app/(protected)/journal-voucher/import/[batchId]/page.tsx`
  - `apps/web/app/app/(protected)/vendor/payable-account/import/[batchId]/page.tsx`

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru (6 test, semua state + edge case).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — komponen presentasional murni, tidak ada
      endpoint/data flow baru, tidak ada input user diproses. Tidak ada
      temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.
- [ ] Verifikasi visual di browser — **TIDAK BISA dilakukan sesi ini**
      (browser automation gagal connect, mismatch akun OAuth extension)
      — WAJIB dicek manual oleh user sebelum/sesudah deploy (lihat Known
      Limitations).

## Known Limitations
- **Belum diverifikasi visual di browser** oleh Claude (keterbatasan
  environment sesi ini, bukan diskip sengaja) — correctness dipastikan
  lewat unit test + review kode terhadap layout `CardHeader` (`flex
  flex-col gap-1.5`, sudah dicek cocok tanpa perlu spacing tambahan),
  TAPI tampilan visual asli (warna, ukuran, transisi) perlu dicek
  langsung oleh user di `http://app.localhost:6209` sebelum dianggap
  benar-benar final.
- Teks berputar TIDAK merepresentasikan baris/step literal (§ Keputusan
  Kecil) — kalau nanti ada infra real-time (SSE/websocket), ini bisa
  diupgrade ke presisi per-baris sebagai fase terpisah.
- Belum di-test dengan import SUNGGUHAN 1000-20000 baris (cuma
  divalidasi dengan unit test terisolasi) — perilaku visual saat
  proses BENERAN lama (bukan cuma detik) belum dikonfirmasi lapangan.

## Ringkasan Hasil
Komponen `ImportProgress` (generic, reusable) berhasil dibangun dan
dipasang di 6 fitur import — progress bar akurat (data asli dari
polling yang sudah ada) + teks berputar ambient bergaya "thinking"
saat status `processing`. Murni perubahan frontend, 0 perubahan
backend/database. `bun run typecheck` 0 error, `apps/web` 50 pass/0
fail (6 baru). Verifikasi visual browser TERTUNDA (keterbatasan
environment sesi ini) — didelegasikan ke user sebagai langkah wajib
sebelum dianggap tuntas 100%.
