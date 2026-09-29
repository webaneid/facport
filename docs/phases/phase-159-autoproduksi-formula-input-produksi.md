# Fase 159 — Modul Pertama Produk AutoProduksi: Formula (BOM) + Input Produksi Manual

**Status:** Done
**Mulai:** 2026-09-29
**Selesai:** 2026-09-29

## Tujuan
Bangun modul PERTAMA Produk AutoProduksi (dikunci ADR-0033 sejak Fase 117,
0 kode sampai fase ini). Client kasih file simulasi
(`docs/referencehtml/facport/Autoproduksi.xlsx`) yang dibongkar & dianalisis
penuh — ternyata integrasi Accurate-nya REUSE endpoint modul Inventory
Adjustment yang sudah ada (`item-adjustment/save.do`), bukan integrasi baru.
Yang genuinely baru: master data Formula/BOM (belum ada di Facport) + pola
UI form-based (pertama kalinya, 23 modul lain semua Excel-upload).

## Scope
- [x] Rencana ditulis via Plan Mode, disetujui user (`.claude/plans/ancient-floating-glacier.md`)
- [x] 2 keputusan scope dikonfirmasi user: form manual dulu (Excel fase terpisah), proses via job queue
- [x] Schema DB: `autoproduksi_formulas`, `autoproduksi_formula_items`, `autoproduksi_production_entries`
- [x] Migration (`0034_clumsy_wasp.sql`) — murni additive, diterapkan lokal
- [x] `module-catalog.ts`: Varian `autoproduksi_production` + kategori "Produksi" baru
- [x] `accurate-endpoint-registry.ts`: reuse endpoint `item-adjustment/save.do`
- [x] `admin/plans.route.ts`: tambah `t.Literal("autoproduksi_production")`
- [x] `lib/autoproduksi.ts`: fungsi murni hitung kebutuhan bahan baku + build payload
- [x] `routes/autoproduksi.route.ts`: CRUD Formula + submit/riwayat Input Produksi
- [x] `workers/index.ts`: job `PROCESS_AUTOPRODUKSI_ENTRY`
- [x] Frontend: `/autoproduksi/formulas` (List+CRUD), `/autoproduksi/input`, `/autoproduksi/riwayat`
- [x] Sidebar: grup nav baru "AutoProduksi"
- [x] Test: `autoproduksi.test.ts` (kalkulasi), `autoproduksi.route.test.ts` (CRUD+ownership+guard), `resolve-nav-label.test.ts` (fix bug sidebar)
- [x] Fix test guard lama yang asumsinya salah (`accurate-scopes.test.ts` — AutoProduksi TERNYATA integrasi Accurate)
- [x] Fix `cleanup-test-data.ts` (belum tahu tabel baru — ditemukan saat eksekusi, FK violation)
- [x] `docs/architecture/architecture-autoproduksi.md` (baru)
- [x] Update `docs/architecture/architecture-product-lines.md` (koreksi asumsi lama + status katalog)
- [x] Update root `CLAUDE.md` Peta Dokumen
- [x] Security review (skill `security-review`) — 1 temuan (maxLength schema) diperbaiki
- [x] Test call NYATA ke Accurate sandbox (Data Usaha "Webane Indonesia", database "Retail Demo") — SUKSES
- [x] Browser-test manual end-to-end (Formula create → Input Produksi → Riwayat) — menemukan & memperbaiki 1 bug sidebar
- [x] `docs/PROGRESS.md` status jadi Done
- [x] Commit + push ke `develop`

## Referensi
- Architecture doc: `docs/architecture/architecture-autoproduksi.md`
- ADR: `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`
- Rencana lengkap (Plan Mode): `.claude/plans/ancient-floating-glacier.md`
- Sumber kebutuhan (gitignored): `docs/referencehtml/facport/Autoproduksi.xlsx`

## Keputusan Kecil Selama Eksekusi
- **Tidak ada live-search Accurate (Item/Akun/Cabang) di form Formula** —
  awalnya direncanakan pakai `Combobox` dengan `onSearch` ke Accurate
  (mirip pola lookup Item/Vendor), TAPI dicek dulu ke kode: **tidak ada
  satu pun modul Facport** yang pernah melakukan live-lookup Accurate dari
  route request (SEMUA panggilan Accurate lewat `openAccurateSession` di
  dalam worker job, bukan sinkron dari HTTP request). Menambah pola ini
  butuh desain baru (sesi Accurate per-request) — diputuskan pakai text
  input polos (user ketik kode, Accurate validasi saat proses), konsisten
  filosofi SEMUA modul lain ("Accurate validasi saat save").
- **Kategori "Produksi" ditambah ke `MODULE_CATEGORIES` yang SAMA** (bukan
  array terpisah per Produk) — dicek dulu ke kode: `groupItemsByCategory`/
  `groupByCategory` (sidebar & `/subscribe`) SUDAH SATU array dibagi lintas
  SEMUA Produk sejak Konverter dibangun (Fase 150), BUKAN per-Produk
  seperti sempat disebut dokumen lama sebelum Konverter/AutoProduksi
  benar-benar dibangun. Dikoreksi juga di `architecture-product-lines.md`.
- **`checkTrialRowBudget`/sejenisnya TIDAK dipakai** — trial quota untuk
  AutoProduksi ditunda (lihat Known Limitations).
- **Bug sidebar ditemukan saat browser-test**: 3 item nav berbagi 1
  moduleKey (situasi PERTAMA di Facport) membongkar asumsi implisit fitur
  lama "tampilkan nama Plan di sidebar" (1 moduleKey = 1 item). Diperbaiki
  (`resolveNavLabel`, dipisah ke file non-"use client" biar testable) —
  detail lengkap di `docs/lessons-learned.md` 2026-09-29.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web)
- [x] Lint bersih (`bun run lint`)
- [x] Test: api 1707 pass/0 fail, web 284 pass/0 fail
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (1 temuan maxLength, fixed)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` (tidak ada yang ditunda)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Excel bulk input ("Kirim Dengan Excel" — terlihat di simulasi client)
  belum dibangun — fase terpisah, dikonfirmasi user.
- Harga Beli bahan baku tidak auto-pull dari Accurate — Standard Cost
  formula diisi manual (sesuai contoh client sendiri).
- Trial row budget belum ditegakkan untuk modul ini.
- Tidak ada live-search Accurate (Item/Akun/Cabang/Gudang) di form Formula
  — konsisten filosofi project, tapi enhancement lanjutan kalau dibutuhkan
  (butuh desain baru: sesi Accurate per-request, bukan per-job).

## Ringkasan Hasil
Modul PERTAMA Produk AutoProduksi berhasil dibangun dan diverifikasi
end-to-end nyata (bukan cuma test otomatis): simulasi client (Excel +
screenshot) dianalisis dulu sebelum coding, ketahuan integrasi Accurate-nya
**reuse 100% endpoint modul Inventory Adjustment yang sudah ada** — nol
integrasi Accurate baru dibangun. 3 tabel DB baru (Formula/Formula Items/
Production Entries), 1 job worker baru, 3 halaman frontend baru (form-based,
pertama kalinya di Facport — bukan Excel-upload).

**Test call nyata ke Accurate sandbox SUKSES** (Data Usaha "Webane
Indonesia", database "Retail Demo", item `Bolu`/`Telur`/`Tepung` yang
dipakai sebagai contoh TERNYATA sudah ada beneran di sandbox client —
formula dibuat & input produksi diproses, Accurate balas sukses dengan
`accurateTransactionId` nyata).

**Browser-test manual end-to-end** (bukan cuma API) menemukan 1 bug NYATA
yang lolos dari SEMUA lapisan verifikasi otomatis (typecheck/lint/test/
security-review/test-call-API) — 3 item sidebar tampil teks identik karena
asumsi implisit fitur lama "1 moduleKey = 1 item nav" dilanggar pertama
kalinya. Diperbaiki + ditest, jadi pelajaran penting: verifikasi otomatis
tidak pernah cukup untuk bug rendering/UX, browser-test manual TETAP wajib
untuk perubahan UI.

2 asumsi lama di kode/dokumen dikoreksi selama eksekusi (bukan bug baru,
tapi ketinggalan update): `accurate-scopes.test.ts` (AutoProduksi TERNYATA
integrasi Accurate, bukan "formula lokal" seperti diasumsikan Fase 117) dan
`cleanup-test-data.ts` (belum tahu tabel baru, ditambah sebelum jadi
masalah production).

Typecheck 0 error, lint bersih, test 1707 (api) + 284 (web) pass/0 fail.
Security review: 1 temuan (maxLength schema hilang) diperbaiki + ditest.
