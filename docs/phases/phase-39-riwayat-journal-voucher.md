# Fase 39 — Paritas Fitur Riwayat/Edit Baris/Hapus: Jurnal Umum (Batch Terakhir)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Batch ke-4 (terakhir) dari 4 (§ `docs/phases/phase-36-riwayat-vendor-payable-account.md`
untuk konteks penuh & rasional — TIDAK diulang di sini). Modul: Jurnal
Umum. Fase ini JUGA menutup verifikasi GABUNGAN seluruh batch 4-modul
(typecheck/lint/test suite penuh) karena keempatnya dikerjakan
berurutan tanpa jeda commit di 1 sesi.

## Scope
- [x] `apps/api/src/routes/journal-voucher-import.route.ts` — GET list
      +offset/+total, PUT `:batchId/rows/:rowId` (Edit Baris), DELETE
      `:batchId` (hapus lokal)
- [x] `apps/web/components/journal-voucher/delete-import-dialog.tsx` (baru)
- [x] `apps/web/components/journal-voucher/edit-row-dialog.tsx` (baru —
      `REQUIRED_INTERNAL_FIELDS`: transDate/debitAccountNo/debitAmount/
      creditAccountNo/creditAmount)
- [x] `apps/web/app/app/(protected)/journal-voucher/import/riwayat/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/journal-voucher/import/[batchId]/page.tsx`
      — tambah kolom "Aksi"
- [x] `apps/web/app/app/(protected)/page.tsx` — tambah card "Import
      Terakhir" (icon `BookOpenCheck`)
- [x] `apps/api/src/routes/journal-voucher-import.route.test.ts` — 10
      test baru

**TIDAK termasuk**: Batal Import (alasan sama modul lain). Validasi
balance debit=kredit TIDAK diulang di endpoint Edit Baris (cukup cek
field wajib terisi, sama pola modul lain) — kalau nominal tidak
seimbang, retry akan gagal lagi dengan pesan jelas dari
`buildJournalVoucherPayload()` (sudah ada sejak Fase 35), user edit
ulang. Ini konsisten dengan pola Purchase Invoice: validasi bisnis
(bukan cuma "field terisi") terjadi di retry/worker, bukan di endpoint
edit itu sendiri.

## Referensi
- Template & rasional lengkap: Fase 36
- Audit pemicu: `docs/lessons-learned.md` 2026-09-06

## Checklist Sebelum Ditutup (sesuai SOP) — VERIFIKASI GABUNGAN 4 FASE
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Lint nol error (`bun run lint`) — 0 error
- [x] Test suite penuh `apps/api` — **258 pass / 0 fail** (36 test baru
      dari 4 modul × ~9 test masing-masing, naik dari 222 di akhir
      Fase 35)
- [x] Security review dijalankan (inline, gabungan — 8 endpoint baru
      [2 per modul × 4 modul] SEMUA mekanis, reuse pola
      `purchase-invoice-import.route.ts` yang sudah diaudit: ownership
      check `subscriptionId`, guard permission+moduleAccess dua lapis,
      Drizzle parameterized query, audit log SEBELUM delete. Frontend:
      dialog reuse pola yang sudah diaudit, tidak ada input baru yang
      lolos tanpa validasi backend. 0 temuan.)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — tidak ada
- [x] `docs/PROGRESS.md` diupdate (gabungan, 1 entri untuk seluruh
      batch 4-fase)
- [x] `docs/lessons-learned.md` — gap 2026-09-06 ditandai RESOLVED

## Known Limitations
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung sepanjang sesi ini) — verifikasi lewat test suite otomatis
  (258 pass) + typecheck/lint saja.
- Halaman Riwayat 4 modul ini BELUM dilink dari sidebar nav secara
  langsung (sama seperti PI/SI — akses lewat tombol "Tampilkan Arsip
  Lain" di card dashboard atau langsung ke URL), konsisten dengan pola
  yang sudah ada, bukan regresi baru.

## Ringkasan Hasil
**Seluruh 4 modul (Vendor Payable Account, Purchase Payment, Sales
Receipt, Jurnal Umum) sekarang punya paritas fitur PENUH dengan
Purchase Invoice/Sales Invoice**: halaman Riwayat (arsip paginated),
Edit Baris (perbaiki data gagal tanpa upload ulang), Hapus Riwayat
Batch (lokal saja, tidak sentuh Accurate), dan card "Import Terakhir"
di dashboard homepage. Batal Import SENGAJA tidak ditambahkan ke 4
modul ini (bukan gap — keputusan bisnis terdokumentasi, § architecture
doc masing-masing modul).

Total pekerjaan: 4 route file (masing-masing +2 endpoint: PUT edit-row,
DELETE batch; +offset/total di GET list), 4 pasang komponen dialog baru
(edit-row + delete), 4 halaman Riwayat baru, 4 halaman detail batch
diupdate (+kolom Aksi), 1 dashboard homepage diupdate (+4 card), 4 file
test diupdate (+40 test kasus).

Typecheck 0 error (api+web), lint 0 error, test suite 258 pass/0 fail
(36 baru). Security review inline gabungan: 0 temuan (semua endpoint
baru mekanis, mereplikasi pola Purchase Invoice yang sudah diaudit
Fase 08/09).

**Ini menutup audit konsistensi 6 modul yang dimulai 2026-09-06** — gap
besar yang ditemukan (paritas fitur history/edit/hapus) sekarang
selesai untuk SEMUA 6 modul. Bug lain dari audit yang sama (admin
batch-view tidak render 3 modul baru) sudah diperbaiki sebelumnya di
hari yang sama (§ `docs/lessons-learned.md` 2026-09-06, entri pertama).
