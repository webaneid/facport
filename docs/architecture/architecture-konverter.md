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
Elysia HANYA dipakai untuk: auth (Better Auth, sama Facport), gating subscription (`moduleAccess()`, sama Facport),
dan 1 endpoint kecil `POST /me/conversion-logs` (insert riwayat self-reported, § di bawah).

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
| `checkTrialRowBudget()` | **TIDAK dipanggil sama sekali** — Konverter tidak punya route import server, jadi otomatis tidak lewat fungsi ini |
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
- `POST /me/conversion-logs` — endpoint baru, `auth: true` + `moduleAccess(moduleKey dari body)`, insert 1 baris,
  BARE payload (§ konvensi Response Format project), TIDAK ada validasi rowCount/fileName selain schema dasar
  (self-reported, sengaja tidak diverifikasi — § filosofi privacy-first app lama, data Excel TIDAK PERNAH dikirim
  ke server, cuma metadata).
- `GET /me/conversion-logs` — riwayat customer sendiri, dipakai halaman "Riwayat Konversi" (mirror ringkas "Arsip
  Import" Facport, tapi baca tabel berbeda).
- `apps/api/src/lib/module-catalog.ts` — 16 entry `MODULE_CATALOG` baru (`productLine: "konverter"`), + 1 nilai
  baru di `MODULE_CATEGORIES` ("Master Data").
- `apps/web/components/app-shell/sidebar.tsx` — `NavGroup` baru `{label: "Konverter", productLine: "konverter",
  items: [...]}` — TES NYATA dengan grup "Facport" aktif bersamaan (§ Known Limitations kalau ternyata ada bug).

## Halaman UI (per tipe, dibangun Fase 151+)
`apps/web/app/app/(protected)/konverter/{tipe}/page.tsx` — pola: (1) `FileDropzone` upload Excel, (2) dynamic-import
`xlsx`, parse buffer di browser, (3) panggil `process()`+`build()` dari `lib/converter/types/{tipe}.ts`, (4) tampilkan
`summary()` (jumlah dokumen/baris/error) SEBELUM download — kalau ada error, tampilkan jelas per baris (mirror pola
`EditRowDialog` Facport: user harus tahu APA yang salah, bukan cuma "gagal"), (5) tombol download panggil
`downloadTextFile()`, (6) (opsional, kalau berhasil) `POST /me/conversion-logs`.

## Known Limitations (isi seiring Fase 151+ menemukan hal baru)
- Belum ada Web Worker — kalau file besar (banyak ribu baris) bikin UI freeze terasa, pertimbangkan pindah proses
  ke Web Worker (belum ada precedent project ini, akan jadi yang pertama).
- `conversion_logs` self-reported TIDAK bisa dipakai enforcement kuota keras (§ ADR-0038 poin 5) — kalau bisnis
  nanti butuh kuota trial yang benar-benar dijaga, perlu desain ulang (mis. proses SEBAGIAN di server untuk
  verifikasi, yang akan mengubah filosofi privacy-first 100%-client-side).
- Sidebar clustering multi-Produk belum pernah dites sebelum Fase 150 — kalau ketemu bug di `navGroupsFor()`,
  catat di sini.
- Nomor dokumen referensi (No_Faktur/No_SO/No_PO di tipe yang merujuk dokumen existing) TIDAK divalidasi
  eksistensinya — kegagalan baru diketahui user saat impor manual ke Accurate Desktop, bukan saat convert.

## Referensi
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Fondasi Produk (Brand→Produk→Kategori→Varian): `docs/architecture/architecture-product-lines.md`
- Phase doc: `docs/phases/phase-150-arsitektur-konverter.md`
- Sumber app lama (di luar repo, akses lokal saja): `/Users/webane/sites/konverter/tool.html` (16 tipe transaksi,
  baris 494-1350), `akun.php`/`billing.php`/`lib.php` (referensi model entitlement lama, TIDAK diporting kodenya)
