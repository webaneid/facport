# Architecture — Produk Konverter (Excel→XML untuk Accurate Desktop)

> Fase 150 (arsitektur). Keputusan besar → `docs/decisions/adr-0038-produk-konverter.md` (baca dulu untuk konteks
> "kenapa"). Dokumen ini REFERENSI HIDUP (diupdate tiap Fase 151+ menambah tipe transaksi nyata), pola sama
> `architecture-product-lines.md`.

## Apa Ini
Excel → XML **100% di browser** (client-side, TIDAK ada API call ke Accurate, TIDAK ada job server) untuk pengguna
**Accurate DESKTOP** (beda dari Facport yang untuk Accurate Online via OAuth). User upload Excel, browser
parse+validasi+build XML, user download file `.xml`, lalu impor manual sendiri ke Accurate Desktop-nya. Diporting
dari app lama (`/Users/webane/sites/konverter`, PHP, di luar repo) — HANYA logic konversi 16 tipe transaksi yang
diambil, auth/billing/session lama TIDAK diporting (§ ADR-0038 poin 1).

## Alur Data (beda total dari Facport)
```
Facport:    Upload Excel → SERVER parse+validasi → job queue → Accurate Online API → hasil disimpan (import_batches)
Konverter:  Upload Excel → BROWSER parse+validasi+build XML → download .xml → (opsional) lapor log ke server
```
Tidak ada `import_batches`/`import_batch_rows`, tidak ada `pg-boss` job, tidak ada `accurate_connections`. Server
Elysia dipakai untuk: auth (Better Auth, sama Facport), gating subscription (`moduleAccess()`, sama Facport), dan
1 endpoint `POST /me/conversion-logs` yang SEKALIGUS jadi **gerbang kuota trial** (§ "Trial — Kuota Baris,
Ditegakkan Server" di bawah) — browser WAJIB dapat OK dari endpoint ini SEBELUM tombol download aktif, bukan cuma
lapor riwayat setelah fakta.

## 16 Tipe Transaksi (diporting dari `tool.html` app lama)
Tabel lengkap moduleKey + kategori → `docs/decisions/adr-0038-produk-konverter.md` poin 2. Tiap tipe = 1 "unit"
independen dengan 3 fungsi PURE (tanpa dependency DOM, langsung portable ke TypeScript):
- `process(rows, opts)` — validasi header wajib, grouping baris Excel → dokumen (baris dgn nomor dokumen sama,
  mis. `No_Faktur`, digabung jadi 1 transaksi), validasi bisnis per tipe (lihat catatan khusus di bawah).
- `build(ctx)` — rakit string XML dari hasil `process()`.
- `summary(ctx)` — statistik ringkas (jumlah dokumen, baris, error, warning) untuk ditampilkan ke user sebelum download.

Envelope XML SELALU sama untuk semua tipe:
```xml
<NMEXML EximID="1" BranchCode="...">
  <TRANSACTIONS OnError="CONTINUE">
    <!-- 1 elemen per dokumen, tag sesuai tipe (SALESINVOICE/PURCHASEINVOICE/JV/dst) -->
  </TRANSACTIONS>
</NMEXML>
```

**Catatan bisnis khusus per tipe (WAJIB diporting, bukan cuma struktur XML-nya):**
- `journalvoucher` (JV) — validasi WAJIB debit=kredit per dokumen (balance check), tolak kalau tidak balance.
- `customerreceipt`/`vendorpayment`/`purchasereturn`/`salesreturn`/`deliveryorder`(referensi SO)/`receiveitem`(referensi PO)
  — merujuk dokumen Accurate yang SUDAH ADA (`No_Faktur`, `No_SO`, `No_PO`, dst) — nomor harus PERSIS cocok, TAPI
  **TIDAK divalidasi eksistensinya** di sisi kita (tidak ada koneksi Accurate untuk cek) — Accurate Desktop sendiri
  yang akan menolak saat user impor manual kalau nomornya salah. Beritahu user ini di UI (bukan silent).
- `otherdeposit`/`otherpayment` — pola sama (`ACCOUNTLINE` array), app lama bikin via 1 factory function
  (`cashbookType(kind)`) — port dengan pola sama (1 builder generik, parameter `kind`), JANGAN duplikasi 2x manual.
- `stdcost` (Update Harga Pokok Standar & Jual) — BUKAN transaksi, update data master barang (`MATERIALSTANDARDCOST`).
- Semua tipe ber-pajak (`salesinvoice`/`purchaseinvoice`/dst): kolom `Kena_Pajak` (flag)/`Kode_Pajak`/`Tarif_Pajak`/
  `Pajak_Inklusif` — TIDAK ada lookup Data Master Pajak (tidak ada koneksi Accurate), semua field dikirim APA ADANYA
  sebagai teks di XML, Accurate Desktop yang resolve saat impor.
- Semua tipe ber-mata-uang (`needsCurrency`): `Mata_Uang` + `Kurs` — sama prinsipnya, dikirim apa adanya.

**Helper generik yang diporting SEKALI, dipakai SEMUA tipe** (`apps/web/lib/converter/shared.ts`):
`escapeXml`, `str`, `flag1` (parse boolean gaya Indonesia: 1/ya/y/yes/true/benar), `num` (parse angka format Indonesia:
koma desimal, titik ribuan), `normDate` (terima Date object Excel, serial number Excel, ISO, atau DD/MM/YYYY),
`reserved()` (10x `<ITEMRESERVEDn/>` placeholder wajib schema Accurate — JANGAN dihapus walau kelihatan aneh, itu
memang wajib ada di skema resmi Accurate Desktop XML import).

## Reuse Infrastruktur Facport (§ detail lengkap di ADR-0038)
| Yang dipakai | Cara pakai |
|---|---|
| `moduleAccess()` macro | Apa adanya — `moduleAccess("konverter_sales_invoice")` di route halaman Konverter yang butuh gating (kalau ada server-side check; halaman Next.js sendiri sudah difilter dari sisi UI via `subscriptionModules`, sama pola modul Facport) |
| `createTrialSubscription()` | Apa adanya |
| `checkTrialRowBudget()` | **TIDAK dipanggil apa adanya** (hardcode `import_batches`, Konverter tidak punya) — tapi settingnya (`trial.maxRows`) DIPAKAI ULANG oleh fungsi TWIN baru `checkAndRecordConversionRowBudget()`, § "Trial — Kuota Baris" di bawah |
| `plans.productLine/kind/durationDays/trialEligible` | Apa adanya, admin bikin Plan lewat `/admin/plans` seperti biasa, `productLine: "konverter"` |
| Union TypeBox `admin/plans.route.ts` | Tambah 16 `t.Literal` manual (§ ADR-0038 poin 6) |
| `FileDropzone` (`components/ui/file-dropzone.tsx`) | Apa adanya — ganti handler submit jadi proses `File` di browser, bukan POST server |

## Fondasi Kode Baru (Fase 150, dibangun sekali)
- `apps/web/lib/converter/shared.ts` — helper generik (§ di atas).
- `apps/web/lib/converter/types/*.ts` — 1 file per tipe transaksi (dibangun bertahap Fase 151+, BUKAN Fase 150).
- `apps/web/lib/download-file.ts` — `downloadTextFile(filename, content, mimeType)`, pola BARU (`Blob`+
  `URL.createObjectURL`+`<a download>` sintetis) — TIDAK ADA precedent di project ini sebelumnya, semua download
  existing (template Excel, PDF invoice) lewat link ke server. **WAJIB `URL.revokeObjectURL()` setelah klik** untuk
  hindari memory leak (blob URL menumpuk kalau user convert berkali-kali dalam 1 sesi tanpa reload).
- `xlsx` (SheetJS) ditambah ke `apps/web/package.json`, versi CDN SAMA dengan `apps/api` (`xlsx-0.20.3`, konsistensi
  fitur/lisensi). **WAJIB `dynamic import()`** (`const XLSX = await import("xlsx")`) di halaman `/konverter/*` SAJA
  — full build ~1MB+ minified, jangan masuk bundle global/initial load.
- `apps/api/src/db/schema/*.ts` — tabel `conversion_logs` baru (skema § ADR-0038 poin 4) + migration.
- `POST /me/conversion-logs` — endpoint baru, `auth: true` + `moduleAccess(moduleKey dari body)`. Body
  `{moduleKey, fileName, rowCount}` — `rowCount` = HASIL HITUNGAN OTOMATIS browser dari parsing (bukan angka bebas).
  Handler panggil `checkAndRecordConversionRowBudget()` (§ di bawah) SEBELUM insert — kalau ditolak (trial sudah
  lewat kuota), balas 400 `TRIAL_ROW_LIMIT_EXCEEDED` TANPA insert; kalau lolos, insert 1 baris `conversion_logs`
  (BARE payload, § konvensi Response Format project) lalu balas `{ok:true}`. Isi Excel TIDAK PERNAH dikirim ke
  server, cuma metadata (nama file, jumlah baris) — prinsip privacy-first app lama dipertahankan.
- `GET /me/conversion-logs` — riwayat customer sendiri, dipakai halaman "Riwayat Konversi" (mirror ringkas "Arsip
  Import" Facport, tapi baca tabel berbeda).

## Trial — Kuota Baris, Ditegakkan Server (revisi 2026-09-22)
Draft awal dokumen ini sempat menyimpulkan "kuota baris tidak mungkin ditegakkan untuk Konverter, trial cuma
durasi-hari" — **DIKOREKSI** (masukan user): kuota baris TETAP bisa nyata, sama seperti Facport, karena `rowCount`
bukan input bebas — dia hasil parsing yang browser toh WAJIB lakukan untuk membangun XML.

**Alur (mirror `checkTrialRowBudget` Facport, tapi pre-flight bukan post-hoc):**
1. Browser parse Excel (`xlsx`) → panggil `process()`+`build()` type Konverter yang relevan → dapat `summary()`
   (jumlah baris yang LOLOS validasi, bukan jumlah baris upload mentah — mirror filosofi Facport "hanya baris
   sukses yang dihitung").
2. Browser panggil `POST /me/conversion-logs` dengan `rowCount` itu **SEBELUM** tombol download aktif/enabled.
3. Server (`lib/trial.ts`, fungsi BARU `checkAndRecordConversionRowBudget(subscriptionId, moduleKey, fileName, rowCount)`,
   SEJAJAR `checkTrialRowBudget` yang sudah ada): kalau `subscription.isTrial` — jumlahkan `rowCount` SEMUA baris
   `conversion_logs` existing milik subscription itu + `rowCount` baru, banding ke setting global `trial.maxRows`
   (REUSE, TIDAK perlu setting baru); melebihi → return `{ok:false, remaining, max}` TANPA insert; kalau bukan
   trial atau masih dalam kuota → INSERT baris `conversion_logs` SEKARANG (bukan self-report pasif setelah fakta)
   → return `{ok:true}`.
4. Browser HANYA panggil `downloadTextFile()` setelah dapat `{ok:true}`. Kalau ditolak, tampilkan pesan yang SAMA
   gayanya dengan Facport ("batas trial tercapai", reuse komponen/copy yang sudah ada kalau memungkinkan).

**Kejujuran model ini**: pengguna sangat teknis (DevTools) tetap BISA memanipulasi angka yang dikirim langsung ke
API — risiko generik yang sama di semua endpoint manapun, BUKAN celah baru yang lebih lemah. Untuk pemakaian
NORMAL lewat UI, angka SELALU jujur (hasil hitung otomatis, bukan field yang diketik user). Proporsional untuk
kasus low-stakes (abuse trial gratis), bukan skenario keamanan data sensitif.
- `apps/api/src/lib/module-catalog.ts` — 16 entry `MODULE_CATALOG` baru (`productLine: "konverter"`), + 1 nilai
  baru di `MODULE_CATEGORIES` ("Master Data").
- `apps/web/components/app-shell/sidebar.tsx` — `NavGroup` baru `{label: "Konverter", productLine: "konverter",
  items: [...]}` — TES NYATA dengan grup "Facport" aktif bersamaan (§ Known Limitations kalau ternyata ada bug).

## Halaman UI (per tipe, dibangun Fase 151+)
`apps/web/app/app/(protected)/konverter/{tipe}/page.tsx` — pola FINAL, divalidasi Fase 151 (`requisition`, port
pertama), REUSE apa adanya untuk 15 tipe sisanya:
1. `page.tsx` (Server Component TIPIS, pola sama `import/arsip/page.tsx`) — gerbang subscription: fetch
   `/me/subscriptions`, cek moduleKey tipe ini aktif di Data Usaha aktif (cookie). TIDAK subscribe → render
   `EmptyState` + CTA `/subscribe`. WAJIB ada per halaman (BEDA dari Facport, § alasan di "Known Limitations" —
   pemrosesan Konverter 100% client-side, jadi TIDAK ada 403 server yang otomatis menahan preview kalau
   page-level tidak menahan duluan).
2. Subscribe → render `ConverterTypeView` (`components/converter/converter-type-view.tsx`, GENERIK terhadap
   `ConverterType<TCtx>` apa pun — tiap tipe cuma pass instance type-nya sendiri, TIDAK perlu bikin UI baru).
3. Di dalam `ConverterTypeView`: isi Branch Code (+Mata Uang kalau `needsCurrency`) → `FileDropzone` upload →
   `readExcelFile()` (`lib/converter/read-excel.ts`, dynamic-import `xlsx`) → `type.process()`+`type.build()` →
   tampilkan `summary()` (stats+error/warning, mirror `EditRowDialog` Facport: user harus tahu APA yang salah)
   → tombol Download panggil `POST /me/conversion-logs` DULU (gerbang kuota trial) → `{ok:true}` baru
   `downloadTextFile()`. Template Excel: `downloadConverterTemplate()` (`lib/converter/template.ts`, client-side,
   generate dari `type.headers`+`type.examples`, baris contoh ditandai "CONTOH-HAPUS").

**Status porting per tipe** (update tiap fase menambah tipe baru):
| Tipe | moduleKey | Fase | Status |
|---|---|---|---|
| requisition | `konverter_requisition` | 151 | ✅ Done |
| itemtransfer | `konverter_item_transfer` | 152 | ✅ Done |
| journalvoucher | `konverter_journal_voucher` | 152 | ✅ Done |
| otherdeposit | `konverter_other_deposit` | 153 | ✅ Done |
| otherpayment | `konverter_other_payment` | 153 | ✅ Done |
| customerreceipt | `konverter_customer_receipt` | 153 | ✅ Done |
| vendorpayment | `konverter_vendor_payment` | 153 | ✅ Done |
| purchaseinvoice | `konverter_purchase_invoice` | 154 | ✅ Done |
| purchaseorder | `konverter_purchase_order` | 154 | ✅ Done |
| receiveitem | `konverter_receive_item` | 154 | ✅ Done |
| purchasereturn | `konverter_purchase_return` | 154 | ✅ Done |
| salesinvoice | `konverter_sales_invoice` | 155 | ✅ Done |
| salesorder | `konverter_sales_order` | 155 | ✅ Done |
| deliveryorder | `konverter_delivery_order` | 155 | ✅ Done |
| salesreturn | `konverter_sales_return` | 155 | ✅ Done |
| stdcost (Master Data, bukan transaksi) | `konverter_standard_cost` | 156 | Belum diporting |

## Known Limitations (isi seiring Fase 151+ menemukan hal baru)
- Belum ada Web Worker — kalau file besar (banyak ribu baris) bikin UI freeze terasa, pertimbangkan pindah proses
  ke Web Worker (belum ada precedent project ini, akan jadi yang pertama).
- Kuota trial (§ "Trial — Kuota Baris" di atas) ditegakkan lewat `rowCount` yang DIKIRIM browser — pengguna yang
  memanipulasi request API langsung (bukan lewat UI biasa) bisa melaporkan angka palsu. Risiko diterima (sepadan
  dengan risiko generik semua endpoint), TIDAK butuh mitigasi tambahan sekarang; revisit kalau ternyata abuse
  trial jadi masalah nyata di produksi.
- Sidebar clustering multi-Produk belum pernah dites sebelum Fase 150 — kalau ketemu bug di `navGroupsFor()`,
  catat di sini.
- Nomor dokumen referensi (No_Faktur/No_SO/No_PO di tipe yang merujuk dokumen existing) TIDAK divalidasi
  eksistensinya — kegagalan baru diketahui user saat impor manual ke Accurate Desktop, bukan saat convert.
- **Gerbang page-level (Fase 151, security review) TIDAK airtight terhadap user teknis**: halaman
  `/konverter/{tipe}` cek subscription server-side SEBELUM render `ConverterTypeView` (mencegah preview XML
  gratis lewat navigasi biasa), TAPI logic `process()`/`build()` tetap terkirim sebagai bundle JS ke browser
  SIAPA PUN yang login (Next.js code-splitting tidak menjamin chunk client component tidak terunduh) — user yang
  buka DevTools & panggil fungsi itu langsung BISA dapat preview XML tanpa subscription, melewati gerbang
  halaman. KATEGORI RISIKO SAMA dengan kuota trial self-reported di atas (mesin 100% client-side = business
  logic-nya visible ke yang punya akses tool teknis) — diterima, proporsional untuk produk low-stakes ini,
  TIDAK butuh mitigasi tambahan sekarang. Gerbang OTORITATIF tetap `POST /me/conversion-logs` (download file
  sungguhan TIDAK BISA didapat tanpa lolos gerbang itu, TIDAK PEDULI preview-nya terlihat atau tidak).

## Referensi
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Fondasi Produk (Brand→Produk→Kategori→Varian): `docs/architecture/architecture-product-lines.md`
- Phase doc: `docs/phases/phase-150-arsitektur-konverter.md`
- Sumber app lama (di luar repo, akses lokal saja): `/Users/webane/sites/konverter/tool.html` (16 tipe transaksi,
  baris 494-1350), `akun.php`/`billing.php`/`lib.php` (referensi model entitlement lama, TIDAK diporting kodenya)
