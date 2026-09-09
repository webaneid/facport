# Fase 85 — Ekspansi Field Opsional Sales Receipt (Sesuai Wishlist Client)

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Client kirim file Excel referensi mereka (sheet "NOTE") berisi wishlist
28 kolom untuk fitur Sales Receipt — jauh lebih lengkap dari 6 kolom
MVP yang sudah ada (Fase 34/49). Riset menemukan sheet NOTE ini adalah
COPY PERSIS dari template kompetitor (`FACPORT_Sales Receipt_v5.xlsx`)
yang sudah dipakai nyata di lapangan.

## Scope
Detail lengkap tabel keputusan per-kolom, keputusan desain (Cheque
Amount, konvensi boolean, enum Payment Method, struktur
`detailDiscount[]`, penempatan kolom) → lihat
`docs/architecture/architecture-sales-receipt.md` §
"Ekspansi Field Opsional — Fase 85".

**Nama field internal final "Cheque Amount"**: `receiptTotalAmount` —
dipilih sendiri (user delegasikan "eksekusi yang bisa") karena field
internal `chequeAmount` yang sudah ada TERNYATA sebenarnya per-baris
(`detailInvoice[].paymentAmount`), bukan root — nama baru ini jelas
beda supaya tidak bentrok makna.

**Mirror ke Purchase Payment**: TIDAK dilakukan di fase ini — belum
diminta eksplisit, di luar scope riset yang sudah matang (riset ini
KHUSUS Sales Receipt). Bisa jadi fase terpisah nanti kalau diminta.

Ringkasan:
- **18 field baru** dikonfirmasi ganda (spec resmi Accurate + template
  kompetitor riil): `description`, `branchName`, `currencyCode`,
  `rate`, `chequeAmount` (eksplisit, desain khusus), `chequeNo`,
  `chequeDate`, `paymentMethod` (enum), `passValidateInvoiceDate`,
  `useCredit`, `detailInvoice[].departmentName`,
  `detailInvoice[].paidPph`, `detailInvoice[].pphNumber`, dan 5 field
  `detailInvoice[].detailDiscount[]` (amount/accountNo/discountNotes/departmentName/projectNo).
- **4 field DI-SKIP, SEKARANG DENGAN ALASAN TERKONFIRMASI** (bukan lagi
  "tidak ketemu dokumentasinya" — dikonfirmasi via 7 screenshot UI
  Accurate ASLI dari client, 2026-09-10): Existing Credit ("Sisa
  Kredit", read-only) & Tax Amount ("Jasa Kebersihan: Rp 40.000",
  komputasi otomatis) TERBUKTI nilai display, bukan input; Return
  Overpay ("Retur Kredit") TERBUKTI NYATA di UI tapi TIDAK ADA di API
  manapun (dicek exhaustif 17 property root); Tax ID tidak ada info
  baru.

## Referensi
- Client kirim template Excel referensi (sheet "NOTE") + file
  kompetitor `FACPORT_Sales Receipt_v5.xlsx` (sheet "Import CR" +
  "Penjelasan Kolom") + **7 screenshot UI Accurate ASLI** (form
  Penerimaan Penjualan sungguhan) sebagai pembanding riset.
- `docs/architecture/architecture-sales-receipt.md` § "Ekspansi Field
  Opsional — Fase 85" — detail lengkap riset & keputusan desain.
- Metodologi cross-check 3 sumber (spec resmi + template kompetitor +
  screenshot UI asli) LEBIH KETAT dari Fase 49/61/64/73/75 sebelumnya
  (yang cuma 2 sumber).

## Keputusan Kecil Selama Riset
- Metodologi riset SENGAJA cross-check 3 sumber independen (spec resmi
  Accurate + template kompetitor riil + screenshot UI Accurate asli
  dari client) — BUKAN cuma percaya 1-2 sumber, konsisten pola disiplin
  riset fase-fase sebelumnya (hindari mengulang kesalahan asumsi
  seperti saga charField Fase 61 dulu).
- **Screenshot UI asli TERBUKTI berguna nyata**: enum `paymentMethod`
  yang direncanakan dari sumber kompetitor (8 nilai) TERNYATA KURANG 3
  nilai (`CREDIT_CARD`/`DEBIT_CARD`/`E_WALLET`) — ketahuan SEBELUM
  eksekusi lewat cross-check ke spec resmi + screenshot dropdown UI,
  dikoreksi jadi 11 nilai yang benar. Kalau tidak dicek ulang, user
  yang pilih "Kartu Kredit" akan gagal validasi di production.
- 4 field yang di-skip TIDAK diimplementasikan dengan tebakan — SEMUA
  3 sumber riset (spec, kompetitor, DAN screenshot UI asli) konsisten
  tidak bisa menyediakan field API yang valid untuk 4 field ini, jadi
  keputusan aman-nya adalah TIDAK menebak.
- **Client eksplisit minta presisi 6 digit desimal untuk semua field
  angka** — dicek ke spec, ini MEMANG batasan resmi Accurate untuk
  `chequeAmount`/`paymentAmount`/`detailDiscount.amount` (spec sebut
  eksplisit "Nilai maksimum: 999 miliar dengan 6 digit desimal"), bukan
  permintaan di luar API. Detail implikasi implementasi (jangan
  round/parseInt, deskripsi kolom harus sebut eksplisit) →
  `architecture-sales-receipt.md` § Keputusan Desain #7.

## File yang Diubah
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.ts` — 18 field
  baru di `fieldToAccuratePath`/`defaultColumnMap`, infrastruktur
  transformasi baru (`toAccurateBoolean`/`TRUE_TEXT_VALUES` — konvensi
  "Y"/kosong, `toAccurateDate` — `chequeDate`, `toAccuratePaymentMethod`
  — enum 11 nilai + terjemahan label Indonesia), fungsi baru
  `buildDetailDiscountFromRowValues` (nested `detailDiscount[]` di
  dalam `detailInvoice[]`), `buildSalesReceiptPayload` diperluas
  (return type dilonggarkan ke `Record<string, unknown>`, konsisten
  `buildSalesInvoicePayload`/`buildPurchaseInvoicePayload`).
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.test.ts` — 26
  test baru (37 total, dari 11).
- `apps/api/src/lib/import-mapping/template-guide.ts` — 18 baris
  `salesReceiptTemplateGuide` baru, konstanta baru `Y_BOOLEAN_FORMAT`.
  Urutan array DIKOREKSI setelah eksekusi awal — lihat "Koreksi Urutan
  Kolom" di bawah.
- `apps/web/app/app/(protected)/sales-receipt/import/page.tsx` — 18
  opsi dropdown baru. Urutan array `ACCURATE_FIELDS` DIKOREKSI setelah
  eksekusi awal — lihat "Koreksi Urutan Kolom" di bawah.
- `apps/web/components/sales-receipt/edit-row-dialog.tsx` —
  `chequeDate` ditambah ke `DATE_INTERNAL_FIELDS`, `FIELD_HINTS` untuk
  `paymentMethod`/boolean fields.
- `workers/index.ts` — TIDAK PERLU diubah (`processSalesReceiptGroup`
  generic, tidak hardcode field payload).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru — termasuk kasus nilai desimal presisi tinggi
      (`1000000.123456`, `95275.123456`) untuk field Number baru,
      dikonfirmasi TIDAK ada pembulatan/pemotongan (§ Keputusan Desain #7).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — field pass-through sederhana (string/number/boolean),
      tidak ada endpoint/data flow baru, `paymentMethod` diterjemahkan
      via whitelist map (bukan raw pass-through tanpa kontrol). Tidak
      ada temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.
- [x] Dev DB dibersihkan dari data test.

## Known Limitations (Sejauh Riset)
- Field `chequeNo`/`chequeDate` DITANDAI "Wajib" oleh kompetitor di
  sheet "Penjelasan Kolom" mereka, TAPI data sample nyata mereka
  sendiri mengosongkan kolom ini untuk transaksi non-cek (kontradiksi
  internal template kompetitor) — rencana kita ikuti SPEC RESMI
  (opsional), bukan label kompetitor yang tidak konsisten dengan
  praktiknya sendiri.
- Belum diverifikasi test call nyata (beda dari Fase 80 yang
  diverifikasi test call langsung) — field-field ini SEMUA ada di spec
  resmi publik (`accurate-openapi.json`), confidence tinggi TANPA perlu
  test call, beda dari kasus charField/projectNo yang memang tidak
  terdokumentasi resmi.

## Ringkasan Hasil
Riset menyeluruh via 4 sumber independen (spec resmi + template
kompetitor + 7 screenshot UI Accurate asli + dokumentasi resmi
`/api/tax`), 1 koreksi penting ditemukan & diperbaiki SEBELUM eksekusi
(enum `paymentMethod` dari 8 jadi 11 nilai yang benar). 18 field baru
BERHASIL diimplementasikan: 9 field root (`description`/`branchName`/
`currencyCode`/`rate`/`receiptTotalAmount`/`chequeNo`/`chequeDate`/
`paymentMethod`/`passValidateInvoiceDate`/`useCredit`), 3 field
per-invoice (`invoiceDepartmentName`/`paidPph`/`pphNumber`), 5 field
`detailDiscount[]` nested. "Cheque Amount" eksplisit (kalau diisi)
menang atas auto-SUM (kalau kosong, tetap fallback — zero regression
Fase 49). Konvensi boolean "Y"/kosong & enum Payment Method (dengan
terjemahan label Indonesia) diimplementasikan sesuai temuan riset. 4
field TETAP di-skip (Existing Credit/Return Overpay/Tax Amount/Tax ID)
— didokumentasikan lengkap untuk ditanyakan ke Accurate CS langsung
kalau diperlukan nanti. `bun run typecheck` 0 error, `bun test` apps/api
533 pass/0 fail (26 baru), apps/web 44 pass/0 fail. Dev DB dibersihkan.

### Koreksi Urutan Kolom (2026-09-10, setelah eksekusi awal)
Eksekusi awal menaruh 18 kolom baru di AKHIR template (konsisten
konvensi Fase 70-84). User kemudian eksplisit minta susunan kolom Excel
disamakan PERSIS dengan urutan file client asli ("susunan excel harus
sama dengan yg dibuat client, karena itu permintaannya") — pengecualian
KHUSUS Sales Receipt, bukan perubahan konvensi modul lain. Direorder di
3 tempat: `defaultColumnMap`, `salesReceiptTemplateGuide`, dropdown
`ACCURATE_FIELDS` — field lama ikut disisipkan ulang ke posisi asli
client (bukan tetap di depan). Detail urutan final & rasional lengkap →
`architecture-sales-receipt.md` § Keputusan Desain #5. Re-run
`bun run typecheck` (0 error) + full suite (`apps/api` 533 pass,
`apps/web` 44 pass) setelah reorder — tidak ada regresi.
