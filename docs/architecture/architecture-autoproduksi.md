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
  **§ Fase 168** — `branchName`/`warehouseName` di atas sudah tidak lagi
  milik Formula (pindah ke Input Produksi, lihat "Skema Database" di
  bawah) — paragraf ini tetap benar untuk `itemNo`/`adjustmentAccountNo`
  Formula dan untuk field konteks produksi yang baru.
- Kalau kode barang/akun/cabang salah, gagalnya baru ketahuan saat "Input
  Produksi" diproses (pesan error jelas dari Accurate, ditampilkan di
  Riwayat) — BUKAN saat setup Formula. Sama filosofi persis modul Excel
  lain (baris gagal ketahuan saat proses, bukan saat upload).

## Skema Database

3 tabel baru (`apps/api/src/db/schema/autoproduksi.schema.ts`), scoped per
Data Usaha (`dataUsahaId`) + subscription (`subscriptionId`, menentukan
`accurate_connections` mana yang dipakai — pola sama SEMUA modul lain):

- **`autoproduksi_formulas`** — 1 baris = 1 resep: Nama + Barang Jadi +
  Akun Perantara + `standardCost` (diisi MANUAL, bukan hitung otomatis
  dari harga beli Accurate — lihat "Di Luar Scope" di bawah) + `isActive`
  (§ Fase 168, toggle List Formula — nonaktif = tidak bisa dipilih/dicari
  utk Input Produksi baru, tapi tetap tampil sebagai dokumentasi).
  **§ Fase 168** — Cabang/Gudang Barang Jadi/Nomor Project/Departemen
  DIHAPUS TOTAL dari tabel ini (pindah ke `autoproduksi_production_entries`
  di bawah) — alasan client: customer dengan banyak cabang terpaksa bikin
  Formula terpisah per cabang padahal resepnya identik; sekarang 1 Formula
  dipakai lintas cabang/gudang, dipilih ulang tiap kali produksi.
- **`autoproduksi_formula_items`** — Bahan Baku per formula (FK cascade
  delete dari formula): `itemNo`/`itemUnitName`/`quantity` (takaran per 1
  unit Barang Jadi) saja. **§ Fase 168** — `warehouseName`/`projectNo`/
  `departmentName` per baris (sempat ditambah Fase 162/166) DIHAPUS —
  Gudang Bahan Baku sekarang SATU pilihan di level Input Produksi, berlaku
  seragam ke SEMUA baris Bahan Baku (bukan per-item lagi).
- **`autoproduksi_production_entries`** — log tiap "Input Produksi" = 1 job
  worker = 1 transaksi Accurate. TIDAK reuse `import_batches`/
  `import_batch_rows` (skema itu untuk Excel-row-based; di sini 1 baris =
  1 dokumen Accurate langsung, tanpa parsing file) — pola desain sama
  seperti `conversion_logs` Konverter yang juga sengaja tabel sendiri (§
  ADR-0033 Alternatif). **§ Fase 168** — tabel ini sekarang JUGA menyimpan
  konteks per-produksi (semua nullable/opsional): `branchName`,
  `warehouseName` (Gudang Barang Jadi), `rawMaterialWarehouseName` (Gudang
  Bahan Baku, seragam semua baris Bahan Baku), `projectNo`/`departmentName`
  (dipakai ulang sama persis ke Barang Jadi maupun semua baris Bahan Baku)
  — pindahan dari `autoproduksi_formulas`/`autoproduksi_formula_items` di
  atas. `branchName` kosong = field di-omit dari payload, Accurate pakai
  default preferensi (dikonfirmasi `accurate-openapi.json`: `branchName`
  TIDAK required di top-level `item-adjustment/save.do`).

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
- ~~Excel bulk input ("Kirim Dengan Excel")~~ — **Done, § "Import Formula & Import Produksi (Excel)" di bawah.**
- Harga Beli bahan baku otomatis dari Accurate (`item/list.do` sudah
  endpoint baseline, gampang ditambah) — enhancement lanjutan.
- Trial row budget belum ditegakkan (lihat di atas) — evaluasi ditunda
  eksplisit oleh user 2026-09-29 (§ `project_autoproduksi_trial_maxrows_pending`).
- ~~Live-search Accurate (Item/Akun/Cabang) dari form~~ — **Fase 163,
  ADR-0039 (Done, 2026-09-29)**: `GET /accurate/items/search`,
  `GET /accurate/glaccounts/search` — pola PERTAMA di Facport, panggilan
  Accurate SINKRON dari route (read-only, timeout+rate-limit). Cabang
  TETAP diketik manual (tidak diminta client).
- ~~Test call NYATA ke Accurate sandbox (endpoint search Fase 163)~~ —
  **Done, terverifikasi via produksi nyata 2026-09-30** (bukan sandbox —
  client langsung test di app produksinya sendiri). 2 bug ketahuan &
  diperbaiki dari test call nyata ini, § `docs/lessons-learned.md` entri
  2026-09-30 (dua entri): (1) `fields` param tidak dikirim sama sekali →
  `no`/`name` kosong; (2) field Satuan salah tebak `unit1Name` (flat),
  yang benar `unit1` (objek nested `{name}`).
- ~~Gudang Bahan Baku/Barang Jadi diketik bebas (rawan typo)~~ — **Done,
  2026-09-30**: diubah jadi `Combobox` search-pilih ke
  `GET /accurate/warehouses/search` (baru, proxy `warehouse/list.do`).
  CATATAN: ini search-pilih dari daftar ASLI, BUKAN auto-fill seperti
  Satuan — Accurate tidak punya konsep "gudang default" per Item (stok
  bisa tersebar di banyak gudang sekaligus), jadi user tetap wajib pilih
  gudangnya sendiri.

### Fase 162 (2026-09-29, evaluasi client) — Selesai
- Search nama Formula + filter Cabang di `/autoproduksi/formulas`
  (client-side, § `lib/filter-formulas.ts`).
- Input "Gudang Bahan Baku" per baris Bahan Baku — kolom `warehouseName`
  di `autoproduksi_formula_items` SUDAH ada di backend sejak Fase 159,
  cuma belum dimunculkan di form; sekarang ada.

### Fase 163 (2026-09-29, evaluasi client) — Selesai
- Barang Jadi, Bahan Baku, Akun Perantara sekarang dicari live ke Accurate
  lewat `Combobox` — kode+satuan+nama otomatis terisi begitu dipilih.
  Detail arsitektur → `docs/decisions/adr-0039-live-search-accurate-dari-route.md`.

### HOTFIX 2026-09-30 (post-deploy Fase 163, evaluasi client) — Selesai
- Search Accurate sempat balikin hasil kosong total (`fields` param tidak
  pernah dikirim), lalu Satuan tetap kosong walau `no`/`name` sudah benar
  (`unit1Name` salah tebak, field asli `unit1` nested) — 2 putaran fix,
  detail lengkap § `docs/lessons-learned.md`.
- Gudang Barang Jadi & Gudang Bahan Baku (`GET /accurate/warehouses/search`,
  proxy `warehouse/list.do`) sekarang search-pilih juga (bukan ketik
  bebas), diminta sekalian oleh client untuk minimalkan siklus deploy.

### Fase 168 (2026-10-02, evaluasi client — perubahan fundamental) — Selesai
Client menemukan masalah desain: Cabang/Gudang Barang Jadi/Gudang Bahan
Baku melekat ke Formula memaksa customer multi-cabang bikin Formula
terpisah per cabang padahal resepnya identik. Perubahan:
- Cabang/Gudang Barang Jadi/Gudang Bahan Baku/Nomor Project/Departemen
  DIPINDAH dari Formula (`autoproduksi_formulas`/`autoproduksi_formula_items`)
  ke Input Produksi (`autoproduksi_production_entries`), semua OPSIONAL —
  Formula sekarang murni resep, 1 Formula dipakai lintas cabang/gudang.
  Gudang Bahan Baku & Proyek/Departemen jadi SATU pilihan per transaksi
  (bukan per-Bahan-Baku lagi seperti Fase 162/166) — reduksi granularitas
  yang DISENGAJA, sesuai literal permintaan client.
- `buildProductionEntryPayload()` (`lib/autoproduksi.ts`) dirombak:
  `branchName`/gudang/proyek/departemen sekarang dari parameter `entry`
  (konteks produksi), BUKAN dari `formula` lagi. `unitCost` (dari
  `formula.standardCost`) TIDAK disentuh — fix Fase 166 tetap berlaku.
- Toggle Aktif/Nonaktif BARU (`autoproduksi_formulas.isActive`,
  `PATCH /autoproduksi/formulas/:id/active`) — nonaktif = tidak bisa
  dipilih/dicari utk Input Produksi baru (manual: 409 `FORMULA_INACTIVE`;
  Excel: baris gagal pesan jelas di worker), tapi tetap tampil di List
  Formula sebagai dokumentasi & tetap bisa diedit.
- Import Formula (Excel) kehilangan kolom Cabang/Gudang/Nomor
  Project/Departemen; Import Produksi (Excel) mendapat 5 kolom baru
  opsional yang sama (lihat "Import Formula & Import Produksi" di bawah).
- Laporan client "Standard Cost tidak terkirim ke Accurate" dikonfirmasi
  SEBELUM rilis v2.21.0 (yang sudah berisi fix Fase 166) — bukan bug baru,
  tidak ada perubahan tambahan di luar memastikan logic `unitCost` tetap
  benar setelah payload builder dirombak.
- Detail → `docs/phases/phase-168-autoproduksi-formula-lintas-cabang-toggle-aktif.md`.

## Import Formula & Import Produksi (Excel) — "Kirim Dengan Excel"

> Dieksekusi setelah Fase 160 ("Planned" sejak itu, GitHub #79). Sumber
> kebutuhan: 2 file Excel NYATA dari client (`Autoproduksi_Formula
> Produksi.xlsx`, `Autoproduksi_Barang Jadi.xlsx`, 2026-10-02, gitignored).

Dua flow BARU, keduanya reuse infrastruktur `import_batches`/
`import_batch_rows` yang sama dengan 24 modul Excel-import lain (upload →
cocokkan kolom → riwayat → retry → edit baris gagal) — BUKAN mekanisme
bulk-upload terpisah. Tapi KEDUANYA beda secara struktural dari 24 modul
itu, dengan cara yang BERBEDA satu sama lain:

### A. Import Formula — (Fase 166: dulu SYNCHRONOUS; **Fase 186: kini ASINKRON via job `IMPORT_AUTOPRODUKSI_FORMULA`, lihat bagian akhir**)
`import_batches.module = "autoproduksi_formula"` (moduleAccess TETAP
`autoproduksi_production`, 1 SKU bundel — key ini SENGAJA tidak masuk
`module-catalog.ts` supaya tidak muncul sebagai opsi "jual terpisah" di
dropdown admin/plans, § `module-import-routes.ts` `MODULE_DISPLAY_LABEL_
OVERRIDES` untuk label tampilan).

Formula TIDAK PERNAH memanggil Accurate (data lokal murni) — jadi confirm
diproses LANGSUNG di request handler (`autoproduksi-formula-import.route.ts`),
TANPA pg-boss job. `import_batches.status` langsung `completed`/
`completed_with_errors`, TIDAK PERNAH singgah di `processing`. TIDAK ADA
endpoint cancel (tidak ada transaksi Accurate untuk dibatalkan).

Baris Excel dikelompokkan by "Nama Resep/Formula" (ADR-0011), tiap grup
WAJIB tepat 1 baris `Tipe Barang=BJ` (jadi header `autoproduksi_formulas`)
+ minimal 1 baris `Tipe Barang=BB` (jadi `autoproduksi_formula_items`).

**Keputusan eksplisit user (ditanya langsung, bukan diasumsikan)**: Nama
Resep/Formula yang SUDAH ADA → **selalu insert Formula BARU** (duplikat
nama DIBOLEHKAN), BUKAN update/timpa. Konsekuensi: Import Produksi (lihat
di bawah) WAJIB menolak baris yang nama Formula-nya ganda, bukan menebak
salah satu. Konsekuensi lain: **retry HANYA memproses ulang baris yang
masih pending/failed** (grouping dihitung ulang dari situ) — grup yang
SUDAH sukses tidak pernah diproses lagi, supaya retry tidak diam-diam
membuat Formula duplikat tambahan.

**§ Fase 168** — kolom "Cabang"/"Gudang"/"Nomor Project"/"Departemen"
DIHAPUS dari modul ini total (pindah ke Import Produksi, § bawah) —
Formula sekarang murni: Nama Resep + Akun Perantara + Tipe Barang/Item/
Jumlah/Satuan/Unit Cost.

### B. Import Produksi — reuse module key `autoproduksi_production`, ASYNC seperti biasa
`import_batches.module = "autoproduksi_production"` (key yang SAMA
dengan moduleAccess-nya — first-time registration, tidak pernah ada
batch dengan module ini sebelumnya karena flow manual tidak pakai
`import_batches` sama sekali). 1 baris Excel = 1 Input Produksi (TIDAK
ADA grouping) — struktural identik dengan 19 modul "sederhana" Fase 165.

Worker (`processAutoproduksiProductionImportRow`, workers/index.ts)
resolve "Nama Resep/Formula" ke `autoproduksi_formulas` LOKAL (bukan
Accurate) dulu: 0 match → baris gagal `Formula tidak ditemukan`; **2+
match (duplikat nama, § keputusan di atas) → baris gagal eksplisit,
TIDAK PERNAH menebak salah satu** (aman di atas cakupan, ADR-0013);
match tapi `isActive = false` (§ Fase 168) → baris gagal pesan jelas
("sedang NONAKTIF"), beda dari "tidak ditemukan"; 1 match aktif → reuse
`buildProductionEntryPayload()` (lib/autoproduksi.ts, SAMA PERSIS fungsi
yang dipakai flow manual single-entry) lalu `saveInventoryAdjustment()`.
Hasil (sukses/gagal) JUGA diinsert sebagai baris
`autoproduksi_production_entries` biasa — entry dari Excel tampil
di `/autoproduksi/riwayat` PERSIS seperti entry manual, tanpa kolom FK
baru yang menghubungkan 2 tabel (2 audit trail independen dari hasil
yang sama). **Job `PROCESS_AUTOPRODUKSI_ENTRY`/route single-entry manual
TIDAK disentuh sama sekali** — reuse murni via pemanggilan fungsi, bukan
modifikasi.

**§ Fase 168** — modul ini mendapat 5 kolom BARU opsional: Cabang, Gudang
Barang Jadi, Gudang Bahan Baku (berlaku seragam ke SEMUA baris Bahan Baku
resep yang dipakai), Proyek, Departemen (Proyek/Departemen dipakai ulang
sama persis ke Barang Jadi maupun Bahan Baku) — pindahan dari Import
Formula (§ di atas), divalidasi panjangnya (`MAX_LENGTHS`) sama pola
Import Formula karena insert langsung ke kolom `varchar` kita sendiri.

Tidak ada scope Accurate baru (endpoint `item-adjustment/save.do` sudah
terdaftar untuk `autoproduksi_production` sejak Fase 159).

**Batal Import untuk Import Produksi SENGAJA BELUM ADA** — walau
struktural memenuhi syarat "modul sederhana" Fase 165 (1 baris = 1
dokumen Accurate, tanpa merge lintas-batch), flow manual single-entry
JUGA belum punya Cancel — menambahkannya HANYA untuk entry hasil bulk
import akan jadi asimetri yang membingungkan. Follow-up terpisah kalau
diminta.

### Checklist registrasi (§ architecture-accurate-integration.md § 3b)
- Backend: `import-mapping/autoproduksi-{formula,production}.mapping.ts`
  (+`.test.ts`), `routes/autoproduksi-{formula,production}-import.route.ts`
  (+`.test.ts`), dispatch worker (HANYA untuk Produksi — Formula
  synchronous), `template-guide.ts` (2 entri BARU, header SAMA PERSIS
  file Excel client).
- Frontend: `app/.../autoproduksi/import-{formula,produksi}/{page,[batchId]/page,riwayat/page}.tsx`,
  `components/autoproduksi/{formula,production}-import-{delete,edit-row}-dialog.tsx`,
  `sidebar.tsx` (2 NavItem baru, moduleKey SAMA `autoproduksi_production`),
  `module-import-routes.ts` (2 entri BARU + `MODULE_DISPLAY_LABEL_OVERRIDES`),
  `import-batch-table.tsx` (Delete dispatch, TANPA Cancel), admin batch-view
  (`{Module}View` + `MODULE_TITLE` × 2).
- `module-catalog.ts`: **TIDAK ADA entri baru** — `autoproduksi_formula`
  sengaja TIDAK didaftarkan (bukan SKU terpisah, § "Import Formula" di
  atas); `autoproduksi_production` reuse entri yang sudah ada.
- `accurate-endpoint-registry.ts`: **TIDAK ADA perubahan** — Formula tidak
  memanggil Accurate, Produksi reuse endpoint yang sudah terdaftar.
- `admin/plans.route.ts`: **TIDAK disentuh** — tidak ada SKU baru.

## Referensi
- ADR: `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`
- Katalog Produk: `docs/architecture/architecture-product-lines.md`
- Modul yang di-reuse endpoint-nya: `docs/architecture/architecture-inventory-adjustment.md`
- Phase doc: `docs/phases/phase-159-autoproduksi-formula-input-produksi.md`,
  `docs/phases/phase-166-autoproduksi-import-formula-produksi.md` (Import Formula/Produksi)
- Sumber kebutuhan (gitignored, cuma referensi lokal): `docs/referencehtml/facport/Autoproduksi.xlsx`,
  `Autoproduksi_Formula Produksi.xlsx`/`Autoproduksi_Barang Jadi.xlsx` (contoh nyata client, 2026-10-02, di luar repo)

## Satuan ke-2..5 barang (evaluasi client 2026-10-03)
Barang di Accurate bisa punya sampai 5 satuan (`unit1..5` + `ratio2..5` terhadap satuan 1) — contoh client: GULA `100028` = KG (satuan 1) dan Pouch (= 10 KG). Sebelumnya `GET /accurate/items/search` hanya membaca `unit1`, jadi form Formula hanya menawarkan satuan terkecil. Sekarang endpoint itu juga mengembalikan `units: {name, ratio}[]` (`lib/accurate-item-units.ts`, dibaca defensif: objek nested/string/flat), dan form Formula (Barang Jadi + tiap Bahan Baku) menampilkan `<Select>` satuan lewat `UnitField` kalau barang punya >1 satuan; selain itu tetap `Input` bebas. `itemUnitName` yang disimpan dikirim apa adanya ke `item-adjustment/save.do` — Accurate yang mengonversi kuantitas lewat rasio.
⚠️ Nama field BACA `unit2..5`/`ratio2..5` di `item/list.do` belum diverifikasi test call nyata (hanya `unit1` yang pernah). Kalau Accurate menolak permintaan yang diperluas, route mengulang dengan field lama (pencarian tidak rusak, daftar satuan saja yang hilang). Verifikasi dengan barang 100028 di akun client setelah deploy.

## Nomor transaksi Accurate di Riwayat/batch (evaluasi client 2026-10-03)
Kolom "No. Penyesuaian Accurate" dulu menampilkan `accurateTransactionId` = **id internal numerik** Accurate (mis. `1250`), yang tidak dikenali client. Sekarang `number` dari respons `item-adjustment/save.do` (mis. `ADJ.2026.10.00001`) disimpan di kolom baru `accurate_transaction_number` (`autoproduksi_production_entries` + `import_batch_rows`, migration 0039, nullable) oleh worker manual maupun Import Produksi Excel, dan ditampilkan lewat `accurateResultText()` (`apps/web/lib/accurate-result-text.ts`). Baris/entry lama (tanpa nomor) tampil sebagai "ID internal N". `accurateTransactionId` tetap disimpan (id dibutuhkan kalau suatu saat perlu `detail.do`). Kolom `import_batch_rows.accurate_transaction_number` generik — modul lain belum mengisinya (semua halaman batch 24 modul lain masih menampilkan id; kandidat fase lanjutan kalau client mengeluhkan hal yang sama).
⚠️ `number` pada respons save.do belum pernah dibaca worker mana pun sebelumnya (hanya dideklarasikan di tipe) — verifikasi di transaksi pertama setelah deploy; kalau kosong, UI otomatis jatuh ke "ID internal N".

## Default Cabang & Gudang (evaluasi client 2026-10-03)
Permintaan client: Cabang/Gudang Barang Jadi/Gudang Bahan Baku yang dikosongkan di Input Produksi → otomatis masuk cabang kantor pusat / gudang utama. Accurate TIDAK menyediakan "cabang pusat"/"gudang utama" bawaan lewat API (dan perusahaan multi-cabang menolak transaksi tanpa cabang, § Fase 90 `architecture-purchase-payment.md`), nama keduanya beda tiap Data Usaha — jadi nilainya diatur sendiri per subscription: tabel `autoproduksi_defaults` (migration 0040, `subscription_id` unik, 3 kolom nullable), `GET`/`PUT /autoproduksi/defaults` (lokal, tanpa Accurate), kartu "Default Cabang & Gudang" di `/autoproduksi/settings`.
- Aturan (`applyContextDefaults`, `lib/autoproduksi.ts`, murni): nilai yang diisi user SELALU menang; hanya yang kosong/spasi diisi default; default belum diatur → tetap null (perilaku lama, field di-omit).
- Berlaku di KEDUA jalur: `POST /autoproduksi/production-entries` (manual) dan `processAutoproduksiProductionImportRow` (Excel). Nilai yang TERPAKAI disalin ke `autoproduksi_production_entries` (Riwayat akurat walau default diganti kemudian); tidak ada FK ke tabel default.
- Proyek/Departemen TIDAK punya default (tidak diminta).
- Tidak ada pemaksaan "wajib diatur" — UI hanya menyarankan mengisi Cabang default untuk perusahaan multi-cabang.
⚠️ Belum diuji ke Accurate sungguhan: efek mengirim `warehouseName` default ke baris Bahan Baku & Barang Jadi (nama gudang harus persis ada di Accurate; salah ketik → ditolak Accurate dengan pesan jelas di Riwayat).

## Validasi satuan Formula terhadap master barang Accurate (evaluasi client 2026-10-03)
Keluhan: Formula bisa disimpan dengan satuan yang tidak ada di master barang Accurate (mis. "pcs" untuk barang berisi KG/Pouch), errornya baru muncul saat Input Produksi ("satuan barang pcs tidak ditemukan"); satuan juga sering harus diketik manual (rawan salah). Sekarang `POST`/`PUT /autoproduksi/formulas` mencocokkan satuan Barang Jadi + tiap Bahan Baku ke master Accurate (`item/list.do` filter `no` persis, `lib/autoproduksi-unit-check.ts`) SEBELUM menyimpan:
- tidak ada di master → `422 {code:"UNIT_NOT_IN_ITEM", itemNo, unitName, availableUnits}` (form menampilkan "Satuan "pcs" tidak terdaftar di barang X. Satuan yang tersedia: …");
- beda huruf besar/kecil/spasi ("pcs" vs "Pcs") → diperbaiki otomatis ke ejaan master, tidak ditolak.
**FAIL-OPEN** (Formula tetap disimpan seperti dulu): tidak terkoneksi Accurate, sesi gagal/timeout, barang tidak ketemu, atau daftar satuan tidak lengkap (Accurate tidak mengembalikan kunci `unit2` → field satuan tambahan tidak dikenali, jadi tidak boleh menolak satuan ke-2 yang sah). Saklar darurat: env `AUTOPRODUKSI_UNIT_VALIDATION=off`.
**Belum dicakup (tindak lanjut)**: Import Formula (Excel) — sengaja lokal & sinkron tanpa Accurate (bisa 10.000 baris), jadi belum divalidasi; satuan salah di jalur itu masih baru ketahuan saat Input Produksi. Perlu desain batas panggilan Accurate (distinct itemNo × rate limit) sebelum ditambahkan.
⚠️ Nama field baca `unit2..5` belum diverifikasi test call nyata — verifikasi dengan barang 100028 (KG & Pouch) setelah deploy.

## Nomor Formula (Fase 184)
Tiap Formula punya nomor internal otomatis per Data Usaha (`autoproduksi_formulas.formula_number`, tampil `F-001`; penghitung `data_usaha.formula_last_number`, atomik, tidak dipakai ulang). Tidak bisa dikustom, tidak ada kolom nomor di Excel, tidak dikirim ke Accurate. Nama Formula boleh kembar; List Formula & autocomplete menampilkan nomor, pencarian nama tidak peka huruf besar/kecil dan bisa lewat nomor. Import Produksi mencocokkan nama (`lower(trim())`); kembar aktif → baris gagal, pesan menyebut nomor kandidat.

## Input Produksi: konfirmasi, progres, isian terakhir (Fase 185)
Klik "Input Produksi" membuka popup 3 tahap: Periksa dulu (ringkasan + peringatan duplikat; Kirim/Batal) → Progres (polling `GET /autoproduksi/production-entries/:id` tiap 1 dtk; `pending` = antre + menghubungi Accurate, `processing` = mengirim) → Hasil (Lihat riwayat / Input produksi baru). Form terisi dari `GET /autoproduksi/production-entries/last` (milik user, tanpa tanggal); tanggal selalu hari ini menurut zona perusahaan.

## Import Formula asinkron & konsistensi UI (Fase 186)
Keputusan sinkron Fase 166 dicabut: `confirm`/`retry` Import Formula mengubah batch ke `processing` dan meng-enqueue job `IMPORT_AUTOPRODUKSI_FORMULA` (`retryLimit: 0`, kedaluwarsa 1 jam); isi job = `lib/autoproduksi-formula-import.ts` (`runFormulaImportJob`). Penandaan baris "sukses" satu grup ada di transaksi yang sama dengan insert Formula-nya (tidak ada celah Formula ganda saat crash/ulang). Halaman Hasil memakai polling + `ImportProgress` seperti modul lain; `retry` ditolak 409 `BATCH_BUSY` saat memproses, begitu juga Hapus. Teks halaman (judul upload "… dari Excel", "Hasil Import", "Arsip Riwayat Import") diseragamkan dengan modul Facport.

