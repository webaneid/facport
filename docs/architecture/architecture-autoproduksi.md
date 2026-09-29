# Architecture — AutoProduksi (Formula/BOM + Input Produksi)

> Fase 159. Modul PERTAMA Produk AutoProduksi (Produk ke-3 Facport, dikunci
> ADR-0033 sejak Fase 117 tapi 0 kode sampai fase ini). Sumber kebutuhan:
> simulasi client `docs/referencehtml/facport/Autoproduksi.xlsx` — dibongkar
> penuh (teks + 4 screenshot UI mockup + Accurate asli) dan dianalisis
> sebelum eksekusi (bukan tebakan). **Rencana lengkap**:
> `.claude/plans/ancient-floating-glacier.md` (arsip Plan Mode fase ini).

## Konsep

AutoProduksi = modul manufaktur sederhana untuk client dengan proses
produksi berbasis resep (contoh client: bakery — "Bolu" dari Telur+Tepung).
Beda dari Work Order/Material Slip/Finished Good Slip (Fase 147-149, produksi
berbasis BOM juga tapi dokumen-berurutan: SPK → Material Release → Finished
Good) — AutoProduksi jauh lebih ringkas: **1 formula = 1 dokumen Penyesuaian
Persediaan langsung**, tanpa alur SPK/realisasi bertahap. Cocok untuk usaha
kecil-menengah yang tidak butuh tracking WIP (work-in-progress) per tahap.

**Alur** (dikonfirmasi user 2026-09-28):
1. **Setup Formula** (sekali per resep): definisikan 1 Barang Jadi +
   kombinasi N Bahan Baku dengan takaran PER 1 unit Barang Jadi.
2. **Input Produksi** (rutin): pilih formula, input qty Barang Jadi yang
   diproduksi.
3. **Otomatis**: sistem hitung kebutuhan Bahan Baku (takaran formula × qty
   produksi) dan kirim 1 transaksi Penyesuaian Persediaan ke Accurate —
   Bahan Baku berkurang (`ADJUSTMENT_OUT`), Barang Jadi bertambah
   (`ADJUSTMENT_IN`).

## Endpoint Accurate — REUSE, Bukan Integrasi Baru

`POST /accurate/api/item-adjustment/save.do` — **endpoint yang SAMA PERSIS**
dengan modul Inventory Adjustment Facport (Fase 136-138, sudah live). Field
yang dipetakan dari Formula/Input Produksi cocok 1:1 dengan spec resmi
(`docs/referencehtml/accurate-openapi.json`, `required: ["adjustmentAccountNo",
"detailItem", "transDate"]`) DAN dengan screenshot Accurate asli di simulasi
client (kolom "Akun Penyesuaian"/"Keterangan"/"Cabang" cocok field
`adjustmentAccountNo`/`description`/`branchName`).

Implementasi: reuse `saveInventoryAdjustment()` (`lib/accurate-inventory-
adjustment.ts`) apa adanya — **tidak ada fungsi Accurate client baru
ditulis** untuk fase ini.

## Beda dari 23 Modul Lain — Form-Based, Bukan Excel

Ini modul PERTAMA di Facport yang **form-based** (Formula & Input Produksi
diisi lewat form web langsung), bukan upload Excel. Konsekuensi desain:

- `itemNo`/`adjustmentAccountNo`/`branchName`/`warehouseName` diketik APA
  ADANYA di form (bukan hasil parsing kolom Excel) — TETAP tidak ada
  live-lookup/search ke Accurate saat isi form (konsisten filosofi SEMUA
  modul lain: "Accurate validasi eksistensi saat SAVE beneran"). Ini
  keputusan SADAR, dicek dulu saat eksekusi: **tidak ada satu pun modul di
  Facport** yang punya live-search Accurate dari browser
  (`openAccurateSession` SELALU dipanggil dari worker job, tidak pernah
  dari route request sinkron) — menambah live-lookup akan jadi pola
  arsitektur baru yang butuh desain sendiri (sesi Accurate per-request,
  bukan per-job), di luar scope Fase 1.
- Kalau kode barang/akun/cabang salah, gagalnya baru ketahuan saat "Input
  Produksi" diproses (pesan error jelas dari Accurate, ditampilkan di
  Riwayat) — BUKAN saat setup Formula. Sama filosofi persis modul Excel
  lain (baris gagal ketahuan saat proses, bukan saat upload).

## Skema Database

3 tabel baru (`apps/api/src/db/schema/autoproduksi.schema.ts`), scoped per
Data Usaha (`dataUsahaId`) + subscription (`subscriptionId`, menentukan
`accurate_connections` mana yang dipakai — pola sama SEMUA modul lain):

- **`autoproduksi_formulas`** — 1 baris = 1 resep. `standardCost` diisi
  MANUAL (bukan hitung otomatis dari harga beli Accurate — lihat "Di Luar
  Scope" di bawah).
- **`autoproduksi_formula_items`** — Bahan Baku per formula (FK cascade
  delete dari formula). `warehouseName` per baris SUDAH diakomodasi (field
  API `detailItem.warehouseName` memang ada di spec) — mengatasi "Catatan
  #1" client sendiri di simulasi ("seharusnya bisa input gudang pada
  setiap barang").
- **`autoproduksi_production_entries`** — log tiap "Input Produksi" = 1 job
  worker = 1 transaksi Accurate. TIDAK reuse `import_batches`/
  `import_batch_rows` (skema itu untuk Excel-row-based; di sini 1 baris =
  1 dokumen Accurate langsung, tanpa parsing file) — pola desain sama
  seperti `conversion_logs` Konverter yang juga sengaja tabel sendiri (§
  ADR-0033 Alternatif).

## Job Queue

`JOBS.PROCESS_AUTOPRODUKSI_ENTRY` (`workers/index.ts`) — 1 job per Input
Produksi, mirror pola guard `IMPORT_TO_ACCURATE` (resolve koneksi → cek
scope → buka sesi → panggil Accurate → update status) tapi jauh lebih
simpel (1 panggilan, bukan loop banyak baris). Pakai default pg-boss
options (retry 2x, expire 15 menit) — CUKUP untuk 1 panggilan ringan, tidak
perlu `NO_DUPLICATE_DISPATCH_QUEUE_OPTIONS` seperti `IMPORT_TO_ACCURATE`
(§ lessons-learned 2026-09-27 soal race condition — TIDAK relevan di sini
karena tidak ada "banyak baris diproses lama" yang bisa melewati window
expire default).

Kalkulasi kebutuhan Bahan Baku (inti fitur "Auto") dipisah jadi fungsi
murni `buildProductionEntryPayload()` (`lib/autoproduksi.ts`) — TANPA
DB/network — supaya bisa di-unit-test tanpa mock (§ `autoproduksi.test.ts`).

## Kategori & Katalog

`module-catalog.ts`: 1 Varian `autoproduksi_production` (Formula CRUD +
Input Produksi + Riwayat dibundel 1 SKU — mirror pola modul lain yang juga
bundel CRUD+transaksi+riwayat dalam 1 `moduleKey`, § ADR-0019). Kategori
"Produksi" BARU ditambah ke `MODULE_CATEGORIES` (array yang SAMA dipakai
lintas SEMUA Produk, BUKAN per-Produk sendiri seperti sempat disebut di
`architecture-product-lines.md` versi lama sebelum Konverter/AutoProduksi
benar-benar dibangun — dikoreksi juga di dokumen itu).

## Keputusan Desain (dikonfirmasi user sebelum eksekusi)

- **Form manual dulu, Excel bulk menyusul fase terpisah** — simulasi
  client punya menu "Kirim Dengan Excel" tapi Fase 1 fokus form single-entry
  (mirror alur utama simulasi: pilih formula, input qty, submit).
- **Proses via job queue, bukan sinkron** — konsisten pola 23 modul lain,
  tahan gangguan/rate-limit Accurate, walau ini cuma 1 panggilan per entry
  (bukan bulk).
- **Standard Cost diisi manual** (bukan auto-pull dari harga beli Accurate)
  — sesuai contoh client sendiri di simulasi ("Nilai dimasukan manual").
  Auto-pull adalah enhancement lanjutan, bukan Fase 1.
- **Trial row budget TIDAK ditegakkan** untuk AutoProduksi di Fase 1 (beda
  dari `checkTrialRowBudget`/`checkAndRecordConversionRowBudget` yang
  dipakai Facport/Konverter) — belum ada kejelasan bisnis soal satuan
  kuota yang masuk akal untuk modul ini (per-entry? per-kg bahan baku?).
  Dicatat sebagai known limitation, follow-up terpisah kalau dibutuhkan.

## Known Limitations (di luar scope Fase 1, dicatat sengaja)
- Excel bulk input ("Kirim Dengan Excel") — fase terpisah.
- Harga Beli bahan baku otomatis dari Accurate (`item/list.do` sudah
  endpoint baseline, gampang ditambah) — enhancement lanjutan.
- Trial row budget belum ditegakkan (lihat di atas) — evaluasi ditunda
  eksplisit oleh user 2026-09-29 (§ `project_autoproduksi_trial_maxrows_pending`).
- ~~Live-search Accurate (Item/Akun/Cabang) dari form~~ — **Fase 163**
  (menyusul, evaluasi client 2026-09-29): pola live-search SINKRON dari
  route (bukan lagi "tidak ada sama sekali", premis awal ini SUDAH
  DIKOREKSI). ADR baru + migration (simpan nama hasil lookup) direncanakan
  di fase itu.
- **Test call NYATA ke Accurate sandbox** — SUDAH dilakukan (§ Fase 159
  Ringkasan Hasil, sukses).

### Fase 162 (2026-09-29, evaluasi client) — Selesai
- Search nama Formula + filter Cabang di `/autoproduksi/formulas`
  (client-side, § `lib/filter-formulas.ts`).
- Input "Gudang Bahan Baku" per baris Bahan Baku — kolom `warehouseName`
  di `autoproduksi_formula_items` SUDAH ada di backend sejak Fase 159,
  cuma belum dimunculkan di form; sekarang ada.

## Referensi
- ADR: `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`
- Katalog Produk: `docs/architecture/architecture-product-lines.md`
- Modul yang di-reuse endpoint-nya: `docs/architecture/architecture-inventory-adjustment.md`
- Phase doc: `docs/phases/phase-159-autoproduksi-formula-input-produksi.md`
- Sumber kebutuhan (gitignored, cuma referensi lokal): `docs/referencehtml/facport/Autoproduksi.xlsx`
