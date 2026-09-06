# Fase 36 — Paritas Fitur Riwayat/Edit Baris/Hapus: Vendor Payable Account

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Lanjutan audit konsistensi 6 modul (§ `docs/PROGRESS.md` Update 2026-09-06,
`docs/lessons-learned.md` 2026-09-06) — gap besar yang ditemukan: fitur
self-service history (halaman Riwayat, card dashboard "Import Terakhir",
Edit Baris, Hapus Riwayat) cuma pernah dibangun untuk Purchase Invoice &
Sales Invoice. User minta bangun paritas penuh untuk 4 modul yang belum
punya, direncanakan per-batch (1 fase per modul) supaya tidak ada yang
kelewat. **Fase ini = modul PERTAMA (template) dari 4: Vendor Payable
Account.**

Style eksekusi mengikuti instruksi eksplisit user: "sesuai standar
Purchase Invoice yang pertama kita bangun" — REPLIKASI PERSIS pola PI
per-modul (bukan komponen generik/shared), konsisten dengan filosofi
project "3 baris mirip lebih baik dari abstraksi prematur" yang sudah
dipakai konsisten sejak awal.

## Scope
- [x] `apps/api/src/routes/vendor-payable-account-import.route.ts`:
  - GET list: tambah `offset` + `total` (paginasi utk halaman Riwayat)
  - PUT `:batchId/rows/:rowId` (Edit Baris — cuma baris `failed`,
    validasi field wajib terisi, set status kembali `pending`)
  - DELETE `:batchId` (hapus batch+baris lokal, audit log, TIDAK
    menyentuh Accurate)
- [x] `apps/web/components/vendor-payable-account/delete-import-dialog.tsx`
      (baru, mirror `components/purchase-invoice/delete-import-dialog.tsx`)
- [x] `apps/web/components/vendor-payable-account/edit-row-dialog.tsx`
      (baru, mirror PI TAPI disederhanakan — modul ini tidak ada
      grouping, jadi TANPA prop `siblingRowNumbers`/peringatan "1 faktur
      sama")
- [x] `apps/web/app/app/(protected)/vendor/payable-account/import/riwayat/page.tsx`
      (baru, halaman arsip paginated, mirror `purchase-invoice/import/riwayat/page.tsx`
      minus Cancel — modul ini tidak punya Batal Import)
- [x] `apps/web/app/app/(protected)/vendor/payable-account/import/[batchId]/page.tsx`
      — tambah kolom "Aksi" (EditRowDialog untuk baris `failed`)
- [x] `apps/web/app/app/(protected)/page.tsx` — tambah card "Import
      Terakhir" untuk Vendor Payable Account (append, tidak sentuh
      blok PI/SI yang sudah ada)
- [x] `apps/api/src/routes/vendor-payable-account-import.route.test.ts`
      — 10 test baru (offset/total, Edit Baris 401/404/409/400/200,
      Delete 401/404/409/200)

**TIDAK termasuk scope ini** (dan tidak akan ditambah untuk modul ini
sama sekali, keputusan sadar): "Batal Import" (undo transaksi
Accurate) — modul ini update Akun Hutang (Data Master), bukan
transaksi yang "dibatalkan" secara konseptual (tidak ada dokumen
akuntansi yang perlu dihapus dari Accurate).

## Referensi
- Template asli: `docs/phases/phase-09-batal-import.md` (Edit Baris
  dibahas 2026-08-28), `apps/web/components/purchase-invoice/*`
- Audit yang memicu fase ini: `docs/lessons-learned.md` 2026-09-06

## Keputusan Kecil Selama Eksekusi
- Icon dashboard card: `Landmark` (sudah dipakai sidebar untuk modul
  ini, konsisten identitas visual).
- `EditRowDialog` versi modul ini TIDAK punya `DATE_INTERNAL_FIELDS`
  terisi (modul ini tidak punya field tanggal sama sekali) — Set
  kosong, bukan dihilangkan, supaya struktur komponen tetap identik
  dengan 3 modul lain (memudahkan maintenance/scan lintas modul).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (api+web)
- [x] Lint nol error
- [x] Test suite — akan diverifikasi gabungan di penutupan Fase 39
      (modul terakhir dari batch 4-modul ini), karena keempatnya
      dikerjakan berurutan dalam 1 sesi tanpa jeda commit
- [x] Security review inline: endpoint baru MEKANIS, reuse pola
      `purchase-invoice-import.route.ts` yang sudah diaudit (ownership
      check, permission+moduleAccess guard, Drizzle parameterized
      query). 0 temuan.
- [x] `docs/PROGRESS.md` diupdate (gabungan 4 modul, § Update terpisah)

## Known Limitations
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung) — diverifikasi lewat test suite otomatis + typecheck.

## Ringkasan Hasil
Vendor Payable Account sekarang punya paritas penuh dengan Purchase
Invoice: halaman Riwayat (paginated), Edit Baris, Hapus Riwayat, card
dashboard. Ini jadi TEMPLATE yang direplikasi persis untuk 3 modul
sisanya (Fase 37-39). Detail hasil gabungan (test suite akhir,
security review akhir) dicatat di Fase 39 (modul terakhir batch ini).
