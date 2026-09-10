# Fase 95 — Ekspansi Field Jurnal Umum Opsi B + Redesain Kolom Debit/Kredit

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Client minta isian import Jurnal Umum Facport mendekati format yang biasa
dipakai kompetitor. Riset 2 sumber: (1) template kompetitor
`FACPORT_JV_v3.xlsx`/`FACPORT_JV_v4.1.xlsx` (20 kolom resmi + spec
`journal-voucher/save.do`), (2) template dari klien sendiri berisi
"Yang diinginkan" + 3 screenshot UI Accurate asli (Branch wajib, Kurs,
Departemen/Proyek/Memo, kolom Debit/Credit terpisah). Semua field dari
KEDUA sumber diimplementasikan ("yang maksimal", per instruksi user).

## Scope
- [x] Riset field mapping ke `journal-voucher/save.do` (cross-check spec
      resmi 2 versi + test call nyata untuk currency dan rate/primeAmount)
- [x] **Breaking change Opsi B** (disengaja): hapus `lineAmount`/
      `lineAmountType` ("JV Amount"/"JV Amount Type"), ganti kolom
      **"Debit"**/**"Credit"** terpisah (`lineDebitAmount`/`lineCreditAmount`) —
      tipe baris otomatis dari kolom mana yang terisi
- [x] Tambah `branchName` (root, **WAJIB** — dikonfirmasi screenshot UI
      klien tanda merah *)
- [x] Tambah per baris: `lineRate`, `linePrimeAmount`, `lineDepartmentName`,
      `lineProjectNo`, `lineMemo`, `lineSubsidiaryType`+`lineCustomerNo`/
      `lineEmployeeNo`/`lineVendorNo`, `attribut1`-`attribut10`
      (`dataClassification1-10Name`)
- [x] TIDAK implementasi `currencyCode` — dikonfirmasi test call nyata:
      bukan field input, murni properti akun COA (`glaccount/save.do`)
- [x] Update `journal-voucher.mapping.ts` + test (25 test, semua pass)
- [x] Update frontend: `ACCURATE_FIELDS` (dropdown mapping), `EditRowDialog`
      (`REQUIRED_INTERNAL_FIELDS_TALL`, `FIELD_HINTS`), `[batchId]/page.tsx`
- [x] Update `template-guide.ts` (template Excel yang di-download user)
- [x] Fix validasi XOR di endpoint edit-baris (`debitCreditRowError` baru,
      diekspor dari mapping, dipanggil route — `requiredFieldsFor("tall")`
      TIDAK BISA dipakai apa adanya untuk 2 field yang saling eksklusif)
- [x] `workers/index.ts` — TIDAK perlu perubahan (field-agnostic, cuma
      panggil `buildJournalVoucherPayloadTall`/`groupJournalVoucherRows`)
- [x] Update `docs/architecture/architecture-journal-voucher.md`
- [x] Typecheck (0 error) + test (api 600 pass, web 50 pass) + security
      review (tidak ada temuan)
- [x] Hapus script debug sekali-pakai (`debug-journal-voucher-currency.ts`)

## Referensi
- Architecture doc: `docs/architecture/architecture-journal-voucher.md`
  § "Fase 95"
- Template kompetitor: `docs/referencehtml/FACPORT_JV_v3.xlsx`,
  `FACPORT_JV_v4.1.xlsx`, `CLIENT_template-jurnal-umum.xlsx` (+ 3
  screenshot UI Accurate asli di `docs/referencehtml/jv-client-images/`)
- Spec resmi: `docs/referencehtml/accurate-openapi.json` (di-update ke
  versi 1.5806.4763 saat riset fase ini — dicek TIDAK ADA perubahan
  field journal-voucher antar versi)
- Precedent field ekspansi serupa: Fase 61 (dataClassification1-10 Sales
  Invoice), Fase 85 (Sales Receipt), Fase 89 (Purchase Payment), Fase 90
  (branchName wajib — pola sama diterapkan lagi di fase ini)

## Keputusan Kecil Selama Eksekusi
- Kolom "Debit"/"Credit" GANTI TOTAL (bukan opsi tambahan) — instruksi
  eksplisit user, disadari risikonya (project belum ada customer
  produksi nyata pakai Opsi B, jadi breaking change ini aman).
- `primeAmount` dibuka sebagai kolom opsional walau tidak ada di
  template client — dikonfirmasi test call: kalau kosong, Accurate
  auto-hitung dari `amount`/`rate`, jadi aman dibiarkan opsional.
- Semua 10 `dataClassification` dibuka (bukan cuma 3 seperti template
  kompetitor) — konsisten precedent Sales Invoice Fase 61.
- Nama internal field pakai prefix "line" (`lineDebitAmount`, dst) —
  BUKAN reuse `debitAmount`/`creditAmount` Opsi A, yang sudah dipakai
  untuk index [0]/[1] fixed (beda makna total dari kolom per-baris
  Opsi B).
- Ditemukan (di tengah eksekusi, bukan direncanakan sejak awal): endpoint
  edit-baris (`PUT /rows/:rowId` dan `PUT /rows` bulk) memvalidasi
  `requiredFieldsFor(format)` sebagai "SEMUA field wajib berisi nilai
  per baris" — tidak cocok untuk `lineDebitAmount`/`lineCreditAmount`
  yang sifatnya XOR (isi SATU, bukan wajib DUA-DUANYA). Diperbaiki
  dengan fungsi baru `debitCreditRowError()` (diekspor dari mapping,
  dipanggil terpisah di kedua endpoint, field XOR difilter keluar dari
  loop generik).
- Alias kolom Excel ditambah untuk kompatibilitas 2 sumber: "JV No" DAN
  "Akun Perkiraan" sama-sama map ke `lineAccountNo`; "Kategori Keuangan
  N" (istilah resmi Facport/Accurate) DAN "Classification N" (istilah
  kompetitor, cuma sampai 3) sama-sama map ke `attribut1-10`.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) —
      tidak ada temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Validasi konsistensi `lineSubsidiaryType` vs
  `lineCustomerNo`/`lineEmployeeNo`/`lineVendorNo` SENGAJA TIDAK
  dilakukan di Facport (mis. `subsidiaryType=CUSTOMER` tapi
  `lineVendorNo` yang diisi) — kirim apa adanya, Accurate yang validasi
  konsistensi & eksistensi. Konsisten pola project ini (tidak
  lookup-dulu sebelum kirim), tapi berarti pesan error kalau salah isi
  akan datang dari Accurate, bukan Facport.
- Field baru (kecuali `branchName`) belum pernah dites test call nyata
  ke Accurate produksi (beda dari `rate`/`primeAmount`/`currencyCode`
  yang SUDAH dites nyata) — risiko sama seperti Fase 85 Sales Receipt
  yang field-nya lolos code review tapi ternyata tidak diproses Accurate
  (§ `lessons-learned.md` 2026-09-10 "PPh23 di Sales Receipt"). REKOMENDASI:
  setelah deploy, user WAJIB test import nyata minimal 1x per field baru
  (department/project/memo/subsidiary+cust-vendor-employee/kategori
  keuangan) sebelum dianggap benar-benar berfungsi.
- Template Excel yang di-download (`template-guide.ts`) sekarang jadi
  SANGAT PANJANG (20+ kolom digabung 1 baris header) — belum dipisah
  jadi 2 sheet terpisah per-Opsi (A vs B), konsisten pola lama yang
  SUDAH begini sejak Fase 50 (bukan regresi baru fase ini, tapi makin
  terasa sekarang jumlah kolom bertambah banyak).

## Ringkasan Hasil
Modul Jurnal Umum Opsi B (format panjang, N-akun) sekarang mendukung
14 field baru hasil riset 2 sumber (template kompetitor + template
client dengan 3 screenshot UI Accurate asli): `branchName` (wajib),
`rate`, `primeAmount`, `departmentName`, `projectNo`, `memo`,
`subsidiaryType`+`customerNo`/`employeeNo`/`vendorNo`, dan 10
`dataClassification` (Kategori Keuangan). Kolom "JV Amount"+"JV Amount
Type" diganti total jadi "Debit"/"Credit" terpisah sesuai permintaan
eksplisit user, dengan validasi XOR baru yang benar di 3 tempat
(build-payload, endpoint edit-baris tunggal, endpoint edit-baris bulk).
`currencyCode` dikonfirmasi TIDAK diimplementasi berdasarkan riset
mendalam (bukan asumsi) — dibuktikan test call nyata bahwa mata uang
adalah properti akun COA, bukan input transaksi. `bun run typecheck`
0 error, `apps/api` 600 pass/0 fail, `apps/web` 50 pass/0 fail.
Security review tidak menemukan temuan. Script debug sekali-pakai
sudah dihapus.
