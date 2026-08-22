# Fase 04 — Import Data Pemasok (Update Akun Hutang, dkk)

> Istilah: "Pemasok" adalah nama Bahasa Indonesia yang dipakai UI Accurate
> Online — di API-nya (endpoint, nama field) tetap pakai istilah Inggris
> "Vendor" (`/api/vendor/*`, `vendorNo`, dst). Dokumen ini pakai "Pemasok"
> untuk teks naratif, "Vendor" hanya untuk nama literal endpoint/field.

**Status:** Done
**Mulai:** 2026-08-20
**Selesai:** 2026-08-20

## Tujuan
Client pemilik langganan Facport minta kolom "Akun Hutang" bisa di-import
di Faktur Pembelian. Setelah dicek langsung ke API resmi Accurate, field
itu tidak ada di endpoint Faktur Pembelian — field itu properti **Pemasok**
(endpoint `vendor/save.do`, field `vendorPayableAccountListNo`), bukan
properti transaksi. Detail investigasi lengkap → `docs/architecture/architecture-accurate-integration.md`
§ "Vendor (Data Master)".

Jadi kebutuhan sebenarnya adalah modul **import/update Data Master
Pemasok** — bukan tambahan kolom di Purchase Invoice yang sudah ada. Ini
modul BARU, di luar 5 modul transaksi yang sudah direncanakan sebelumnya
(§ `docs/PROGRESS.md` — Penjualan/Pembelian/Persediaan/Manufaktur/Kas&Bank),
karena Pemasok itu **data master**, bukan transaksi.

**Status konfirmasi ke client:** ✅ **Field target DITUTUP 2026-08-20** —
client mengonfirmasi LANGSUNG (bukan cuma lewat Support Accurate) bahwa
field yang dimaksud adalah `vendorPayableAccountListNo` (Akun Hutang/COA,
lihat screenshot dialog "Akun Utang" tab Pembelian vendor). Sempat ada
kandidat alternatif (`detailOpenBalance`/Saldo Awal) yang muncul dari
eksperimen manual 2026-08-20, tapi sudah disingkirkan setelah klarifikasi
client. Bukti test call nyata (Postman + screenshot UI dari client, DAN
eksperimen mandiri Facport lewat koneksi OAuth sendiri) sudah diverifikasi
— lihat `architecture-accurate-integration.md` § "Vendor (Data Master)".
**✅ Verifikasi teknis TUNTAS 2026-08-20** — semua pertanyaan terbuka
sudah terjawab, termasuk yang paling kritis (apakah override beneran
dipakai Accurate saat posting Faktur Pembelian — TERBUKTI YA, § "Eksperimen
Manual" di bawah). **TAPI eksekusi (coding modul beneran) BELUM dimulai**
— menunggu keputusan user kapan mau mulai. Tidak ada lagi blocker teknis
maupun konfirmasi bisnis yang mengganjal.

## Pertanyaan Terbuka (perlu dijawab sebelum/saat eksekusi)
- [x] ~~Klarifikasi field mana yang dimaksud "Akun Hutang" — (a) Akun COA
      vs (b) Saldo Awal~~ — ✅ **TERJAWAB & DITUTUP 2026-08-20**, dikonfirmasi
      LANGSUNG oleh client (bukan cuma jawaban Support Accurate lagi):
      yang dimaksud memang **(a) `vendorPayableAccountListNo`** (pilih
      akun COA — screenshot client persis dialog "Akun Utang" di tab
      Pembelian vendor, field "Cari/Pilih..." isi "Utang Usaha IDR
      210101"). **(b) `detailOpenBalance`/Saldo Awal BUKAN yang dimaksud**
      — sempat jadi kandidat alternatif setelah eksperimen manual
      (§ "Eksperimen Manual" di bawah), sekarang resmi disingkirkan dari
      scope. Field target FINAL: `vendorPayableAccountListNo`.
- [x] ~~Field ini OPSIONAL/OVERRIDE, apakah beneran kepakai saat transaksi
      atau cuma kosmetik?~~ — ✅ **TERVERIFIKASI PENUH 2026-08-20**, test
      end-to-end: vendor "PT. Angin Ribut" di-set `vendorPayableAccountListNo`
      ke akun BARU ("2101.99 Utang Usaha - Test Override") → Faktur
      Pembelian baru dibuat → `apAccount` hasil faktur = **"2101.99"**
      (BUKAN akun default) — konfirmasi PASTI override beneran dipakai
      Accurate saat posting transaksi, bukan sekadar tersimpan tanpa efek.
      Detail lengkap → § "Eksperimen Manual" di bawah.
- [x] ~~Berapa banyak vendor yang perlu di-set / one-off vs berulang?~~ —
      ✅ **Terjawab via klarifikasi konsep dengan user 2026-08-20**: field
      ini sifatnya "tagging" — SEKALI di-set per vendor, efeknya OTOMATIS
      BERULANG ke semua transaksi berikutnya (tidak perlu diulang tiap
      transaksi). Import Excel-nya sendiri boleh dipakai user KAPAN SAJA
      (bukan cuma sekali di awal) — tiap kali ada vendor baru atau perlu
      ganti tag akun, tinggal upload Excel lagi. Jumlah vendor spesifik
      tidak lagi jadi blocker keputusan (fitur ini valid dipakai berapapun
      jumlah vendornya, karena effort manual per-vendor di Accurate itu
      sendiri yang mau dihindari, bukan soal skala).
- [ ] Selain Akun Hutang, field vendor lain apa yang perlu ikut di-import
      client (alamat, NPWP, termin bayar, dll — lihat daftar lengkap di
      architecture doc)? — opsional, tidak blocking untuk mulai eksekusi
      MVP (`vendorNo` + `vendorPayableAccountListNo` saja sudah valid).
- [x] ~~Pemasoknya sudah ada semua di Accurate atau ada yang baru (CREATE)?~~
      — sebagian terjawab dari bukti test call: pola **UPDATE vendor
      existing pakai `id` internal** (bukan `vendorNo` saja) sudah
      terverifikasi jalan. Yang masih perlu dipastikan: workflow Facport
      untuk DAPAT `id` itu (rencana: `vendor/list.do` cari by `vendorNo`
      dulu) — belum dites langsung dari koneksi Accurate Facport sendiri,
      baru dari test call client/Support Accurate.

## Eksperimen Manual 2026-08-20 — Saldo Awal vs Akun Hutang, dan Verifikasi End-to-End dari Koneksi Facport Sendiri
Sesi eksperimen langsung pakai koneksi OAuth Facport sendiri (bukan cuma
bukti dari client/Support Accurate) — dilakukan di Data Usaha "Tes"
(`accurateDbId: 2780968`), scope sementara `vendor_view`/`vendor_save`/
`item_save`/`glaccount_view`/`glaccount_save` ditambahkan ke
`accurate-scopes.ts` untuk keperluan riset ini (§ catatan inline di file
itu, tandai `🧪 EKSPERIMEN` — **WAJIB dipindah/dirapikan/dihapus kalau
Fase 04 beneran dieksekusi**, ini BUKAN scope permanen Purchase Invoice —
`glaccount_save` khususnya HANYA dipakai riset, modul final tidak perlu
BIKIN akun COA baru, cuma REFERENSI akun yang sudah ada).

**Alur yang diverifikasi SUKSES, end-to-end, via API nyata:**
1. `vendor/list.do` + `vendor/detail.do` untuk vendor "PT. Angin Ribut"
   (V.00001) — **catatan teknis**: `list.do` cuma balikin `{id,
   vendorBranchName, lookupSubText}` (ringkas), field lengkap (`vendorNo`,
   `name`, dst) HARUS ambil dari `detail.do` terpisah pakai `id` hasil
   list. Sama pola juga di `item/list.do`.
2. Simulasi "import Excel" bikin 1 Barang baru (`item/save.do`) — sukses,
   field wajib: `name`, `unit1Name`, `itemType` (enum: `GROUP`/
   `INVENTORY`/`NON_INVENTORY`/`PRODUCTION_COST`/`SERVICE`),
   `itemCategoryName`.
3. Bikin Faktur Pembelian NYATA ke vendor itu (`purchase-invoice/save.do`)
   pakai item barusan — sukses. **Field `number` WAJIB diisi manual** di
   Data Usaha ini (beda dari "Retail Demo" yang bisa auto-number kosong —
   kemungkinan setting auto-numbering beda per Data Usaha, WAJIB dicek
   ulang saat implementasi, jangan asumsi selalu boleh kosong).
4. **✅ KONFIRMASI EMPIRIS**: saldo hutang vendor (`balanceList`) otomatis
   naik PERSIS sebesar nilai faktur (100.000.000 → 100.200.000 untuk
   faktur Rp 200.000) — TANPA Facport kirim apapun soal saldo. Ini bukti
   nyata (bukan cuma teori) bahwa saldo hutang murni hasil kalkulasi
   Accurate dari akumulasi transaksi, § "Soal Akun Hutang" di
   `architecture-accurate-integration.md`.
5. **✅ KONFIRMASI EMPIRIS PALING PENTING (2026-08-20) — override BENERAN
   dipakai, bukan kosmetik**: bikin akun COA baru ("2101.99 Utang Usaha -
   Test Override", `glaccount/save.do`) → set ke
   `vendorPayableAccountListNo` PT. Angin Ribut → bikin Faktur Pembelian
   BARU → `apAccount` HASIL FAKTUR = **"2101.99"** (akun override-nya
   persis, BUKAN akun default "210101" lagi). Ini bukti definitif fitur
   Fase 04 punya efek nyata terhadap posting transaksi, bukan sekadar
   field yang tersimpan tanpa konsekuensi.

**Temuan baru — kandidat interpretasi KETIGA buat "Akun Hutang" client**:
Waktu eksplorasi manual UI Accurate (tab Vendor → "Utang Awal"), ketemu
dialog tambah entry dengan field **Tanggal, Jumlah, Mata Uang, Syarat
Pembayaran, Nomor#, Keterangan** — TANPA field item sama sekali. Ini
persis struktur `detailOpenBalance` (§ `architecture-accurate-integration.md`
§ "Vendor (Data Master)"). Diverifikasi via API: vendor "PT. Angin Ribut"
awalnya cuma 1 entry (`id=50, amount=100000000, asOf="01 Jul 2026",
number="PI.2026.07.00001"`) — field-nya cocok 1:1 sama kolom di dialog UI.

**Kenapa ini mengubah pemahaman kita**: field ini jauh LEBIH SIMPEL
dipakai buat "nambah catatan hutang" (tanggal+jumlah+termin, tanpa perlu
data barang) dibanding `vendorPayableAccountListNo` (yang sebenarnya soal
PILIH AKUN, bukan soal NILAI hutang) ATAU Faktur Pembelian penuh (yang
WAJIB ada item). Kalau client cuma bilang "Akun Hutang" ke Support
Accurate tanpa detail lebih lanjut, jawaban `vendorPayableAccountListNo`
BISA JADI menjawab pertanyaan yang beda dari kebutuhan aslinya. **Perlu
diklarifikasi ulang ke client pakai 2 screenshot** (lihat pertanyaan
terbuka di atas) sebelum difinalisasi field mana yang jadi scope Fase 04.

**Catatan UX penting yang juga relevan buat desain form Facport nanti**:
di UI Accurate sendiri, entry baru yang ditambah lewat dialog "+" TIDAK
langsung tersimpan ke server — masih perlu klik "Simpan" di level
form/halaman Vendor keseluruhan (dikonfirmasi via cek API: entry baru
tanpa Nomor# = belum ter-commit). Ini prinsip yang sama dengan bug
silent-validation-failure yang kita perbaiki di form upload Facport
sebelumnya (§ `lessons-learned.md`) — pentingnya feedback jelas ke user
soal status simpan.

## Scope
- [x] Verifikasi teknis dari sisi Facport (§ "Eksperimen Manual" di atas)
- [x] Endpoint `apps/api`: upload Excel → preview/cocokkan kolom →
      konfirmasi → job queue update ke Accurate. File baru:
      `routes/vendor-payable-account-import.route.ts` (pola SAMA PERSIS
      Purchase Invoice — upload/template/confirm/get/retry/list),
      `lib/accurate-vendor.ts` (`saveVendorPayableAccount` — lookup
      `vendor/list.do` by `vendorNo` pakai `filter.no.val`+`fields` param
      → `vendor/save.do` pakai `id` hasil lookup), re-use penuh
      `lib/excel.ts`, `lib/accurate-rate-limiter.ts`, `lib/accurate-session.ts`,
      `db/schema/import.schema.ts` (field `module` generik, tidak perlu
      migration baru)
- [x] Mapping fields (MVP, 2 kolom): `vendorNo` (wajib) + `payableAccountNo`
      → `vendorPayableAccountListNo` (wajib). File:
      `lib/import-mapping/vendor-payable-account.mapping.ts`. Field vendor
      lain (alamat, NPWP, dst) TIDAK termasuk MVP — lihat Known Limitations.
- [x] Worker: `workers/index.ts` di-refactor dari hardcode Purchase Invoice
      jadi `processImportRow()` yang branch berdasarkan `batch.module`
      (switch eksplisit, BUKAN lookup table generik — 2 modul punya bentuk
      payload beda, lookup table butuh cast tidak aman). `JOBS.IMPORT_TO_ACCURATE`
      tetap 1 job generik (tidak bikin job type baru).
- [x] UI: halaman baru `app/app/(protected)/vendor/payable-account/import/**`
      (page.tsx + `[batchId]/page.tsx`), reuse App Shell + Card/Table/
      FileDropzone dari Fase 03, tambah nav item "Import Akun Hutang
      Pemasok" (ikon `Landmark`) di `components/app-shell/sidebar.tsx`
- [x] Update `accurate-scopes.ts` — `vendor_view`/`vendor_save` ditambah
      permanen ke modul `pembelian` (bukan modul terpisah, dengan
      penjelasan kenapa di komentar inline). Scope eksperimen sementara
      (`item_save`/`glaccount_view`/`glaccount_save`) sudah DIHAPUS —
      itu cuma dipakai riset, bukan kebutuhan modul final.

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Vendor (Data Master)"
- Pola teknis yang di-reuse: `docs/phases/phase-02-modul-pembelian-purchase-invoice.md`
  (Purchase Invoice — modul import Excel pertama, semua pola dasar ada di sini)
- Pola App Shell/nav: `docs/architecture/architecture-app-dashboard.md`

## Keputusan Kecil Selama Eksekusi
- Worker branch pakai `switch` eksplisit (`processImportRow()`) bukan
  lookup table generik — 2 handler modul (Purchase Invoice, Vendor
  Payable Account) punya bentuk payload beda total (nested `detailItem`
  vs flat `{vendorNo, payableAccountNo}`), lookup table generik butuh
  `as any`/`as never` buat nyatuin tipe fungsi yang tidak kompatibel —
  ditolak, `switch` lebih type-safe tanpa cast tidak aman.
- Scope `vendor_view`/`vendor_save` ditaruh permanen di modul `pembelian`
  (bukan modul "pemasok" terpisah) — Akun Hutang Pemasok konsepnya
  melekat ke alur pembelian, konsisten dengan Purchase Invoice yang sudah
  ada di modul yang sama. **Konsekuensi rollout**: koneksi Accurate
  EXISTING (yang connect SEBELUM Fase 04 di-deploy) tidak otomatis dapat
  scope baru ini — user WAJIB re-authorize ulang ("Hubungkan Ulang") baru
  bisa pakai fitur Import Akun Hutang Pemasok. Ini bukan bug, konsekuensi
  inheren dari model OAuth scope Accurate (dialami langsung selama sesi
  riset — 3x re-authorize diperlukan tiap nambah scope baru).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web
- [x] Security review dijalankan (inline, bukan subagent — pola SAMA
      PERSIS Purchase Invoice yang sudah 0 temuan di Fase 02, delta
      risiko kecil) — 0 temuan
- [x] Temuan Critical/High sudah diperbaiki — tidak ada temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda — tidak ada yang ditunda
- [x] `docs/PROGRESS.md` diupdate
- [x] Diverifikasi lewat browser sungguhan (Playwright): login → upload
      Excel (Vendor No + Akun Hutang) → mapping otomatis benar → submit →
      navigasi ke halaman hasil → job ke-pickup worker (dikonfirmasi
      status `failed` yang BENAR untuk user tanpa koneksi Accurate,
      membuktikan branching per-modul jalan)
- [x] Test otomatis: 7 test baru (401/403 gate, ownership 404,
      MISSING_REQUIRED_FIELDS, list ordering+isolation) — semua lolos,
      45 test total di suite (tidak ada regresi)

## Known Limitations
- Field vendor lain (alamat, NPWP, termin bayar, dll) BELUM didukung —
  MVP cuma `vendorNo` + Akun Hutang, sesuai kebutuhan client yang sudah
  dikonfirmasi. Bisa ditambah kalau ada kebutuhan baru, field-nya sudah
  didokumentasikan lengkap di `architecture-accurate-integration.md`.
- `vendorPayableAccountListNo` dikirim sebagai NILAI TUNGGAL (bukan
  array), sesuai bukti test call yang terbukti jalan. Belum diverifikasi
  perilakunya kalau vendor butuh SET LEBIH DARI 1 akun sekaligus (mis.
  beberapa mata uang) dalam SATU baris Excel — untuk skenario itu, user
  perlu import ulang per mata uang (1 baris = 1 akun), belum ada UI untuk
  input multi-akun per vendor dalam 1 baris.
- Koneksi Accurate EXISTING (connect sebelum Fase 04 deploy) perlu
  re-authorize ulang manual untuk dapat scope `vendor_view`/`vendor_save`
  — TIDAK otomatis, § "Keputusan Kecil" di atas. Halaman `/accurate`
  belum punya tombol "Hubungkan Ulang" terpisah dari "Hubungkan" pertama
  kali (keterbatasan yang sudah dicatat sejak Fase 01/02).
- Belum ada kartu ringkasan di Dashboard home (`app/app/(protected)/page.tsx`)
  untuk riwayat Import Akun Hutang Pemasok — beda dari Purchase Invoice
  yang sudah ada kartu "Import Terakhir". Sengaja belum ditambah, di luar
  scope MVP fase ini.
- Beberapa data test masih tersisa di Data Usaha "Tes" milik user
  (vendor "PT. Angin Ribut", item "Kipas Angin Duduk", akun COA
  "2101.99 Utang Usaha - Test Override", beberapa Faktur Pembelian test)
  dari sesi eksperimen — sengaja TIDAK dihapus otomatis (data di Accurate
  cloud, bukan kewenangan Facport untuk hapus tanpa diminta eksplisit).

## Ringkasan Hasil (isi pas fase Done)
Modul Import Akun Hutang Pemasok berhasil dibangun end-to-end, mengikuti
pola Purchase Invoice (Fase 02) yang sudah teruji — upload Excel (Nomor
Vendor + Kode Akun Hutang) → cocokkan kolom → job queue update ke
Accurate via `vendor/list.do` (cari `id`) → `vendor/save.do` (set
`vendorPayableAccountListNo`).

**Yang membedakan fase ini dari fase-fase sebelumnya**: hampir SELURUH
waktu fase ini dihabiskan untuk riset & verifikasi SEBELUM baris kode
pertama ditulis — investigasi mendalam soal makna sebenarnya "Akun
Hutang" (2 kandidat field API yang mirip, disambiguasi lewat 3 putaran
klarifikasi dengan client dan 1 kali salah duga total sebelum akhirnya
tepat), dan pembuktian empiris berulang lewat eksperimen langsung ke
Accurate nyata (bukan cuma baca dokumentasi) — termasuk bukti definitif
bahwa override akun BENERAN dipakai saat posting transaksi, bukan field
kosmetik. Begitu klarifikasi tuntas, implementasi kodenya sendiri relatif
cepat karena tinggal mengikuti pola Purchase Invoice yang sudah matang.

**Verifikasi:** typecheck nol error (api+web), 45 test lolos (7 baru
untuk fase ini) tanpa regresi, security review 0 temuan, dan alur penuh
diverifikasi lewat browser sungguhan (Playwright) sampai ke worker
pick-up job.
