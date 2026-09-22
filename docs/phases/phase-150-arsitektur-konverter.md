# Fase 150 — Arsitektur Produk Konverter (Fondasi, Belum Ada Tipe Transaksi)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Bangun FONDASI Produk Konverter (Excel→XML client-side untuk Accurate Desktop) — SEBELUM porting tipe transaksi
apa pun. Fase ini murni infrastruktur: katalog modul, skema DB `conversion_logs`, helper klien (download file,
shared XML helpers), pendaftaran union TypeBox admin, dan sidebar clustering multi-Produk (pertama kali benar-benar
dites). TIDAK ada tipe transaksi yang diimplementasi penuh di fase ini (menyusul Fase 151+, per kelompok kecil).

## Scope (task)
- [x] T1 `docs/decisions/adr-0038-produk-konverter.md` (SUDAH ditulis) + `docs/architecture/architecture-konverter.md`
      (SUDAH ditulis) — verifikasi ulang isinya masih akurat sebelum eksekusi kode dimulai.
- [x] T2 Migration: tabel `conversion_logs` (skema § ADR-0038 poin 4) di `apps/api/src/db/schema/*.ts`
- [x] T3 `apps/api/src/lib/module-catalog.ts` — 16 entry `MODULE_CATALOG` (`productLine: "konverter"`) + kategori
      baru "Master Data" di `MODULE_CATEGORIES`
- [x] T4 `apps/api/src/routes/admin/plans.route.ts` — 16 `t.Literal` union TypeBox baru
- [x] T5 `POST /me/conversion-logs` (gerbang kuota trial + insert log, § "Trial — Kuota Baris" di architecture doc)
      + `GET /me/conversion-logs` (riwayat) — route baru Elysia; `lib/trial.ts` fungsi baru
      `checkAndRecordConversionRowBudget()` (sejajar `checkTrialRowBudget`, reuse setting `trial.maxRows`)
- [x] T6 `apps/web/lib/converter/shared.ts` — port helper generik (`escapeXml`/`str`/`flag1`/`num`/`normDate`/
      `reserved`/`envelope`) dari `tool.html` app lama
- [x] T7 `apps/web/lib/download-file.ts` — helper `downloadTextFile()` baru (Blob+`<a download>`)
- [x] T8 Tambah dependency `xlsx` ke `apps/web/package.json` (versi CDN sama `apps/api`), verifikasi `dynamic
      import()` bekerja tanpa masuk bundle global
- [x] T9 `apps/web/components/app-shell/sidebar.tsx` — `NavGroup` baru `productLine: "konverter"`, TES nyata
      berjalan bersamaan dengan grup "Facport" — DIADAPTASI saat eksekusi (§ "Keputusan Kecil" di bawah): baru 1
      item nyata ("Riwayat Konversi"), 16 item per-Varian ditunda ke Fase 151+ karena halamannya belum ada.
- [x] T10 Halaman "Riwayat Konversi" (ringkas, baca `conversion_logs`) — MVP: tabel + pagination, scope per Data
      Usaha (mirror Arsip Import), TANPA retensi/aksi hapus (tidak relevan — tidak ada proses async server).
- [x] T11 Typecheck + lint + tes penuh; security review; dokumen (lessons-learned kalau ada temuan, PROGRESS.md)

## Referensi
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Architecture doc: `docs/architecture/architecture-konverter.md`
- Sumber app lama: `/Users/webane/sites/konverter` (di luar repo)

## Keputusan Kecil Selama Eksekusi
- **T9 diadaptasi**: rencana awal "NavGroup Konverter dengan item nyata" tetap dijalankan, TAPI tanpa 16 item
  per-Varian (halaman-halamannya belum dibangun — baru Fase 151+ per-tipe). Ditambah SATU item nyata: "Riwayat
  Konversi" (`/konverter/riwayat`, T10) — cukup untuk validasi clustering multi-Produk (`groupItemsByCategory`)
  jalan benar dengan >1 `productLine` aktif BERSAMAAN, tanpa bikin tautan mati ke halaman yang belum ada.
- **Gerbang visibilitas grup baru**: item tanpa `moduleKey` (mis. "Riwayat Konversi") awalnya akan SELALU tampil
  di sidebar untuk SEMUA customer (mirror "Arsip Import"), tapi itu salah untuk grup Produk BARU yang 0% orang
  sudah subscribe — bisa bikin SEMUA customer existing (termasuk yang cuma pakai Facport) tiba-tiba lihat menu
  "Konverter" yang isinya kosong selamanya. Ditambah field `NavItem.moduleKeys?: string[]` (ATAU beberapa modul,
  beda dari `moduleKey?` tunggal) + helper `modulesForProductLine()` (`module-catalog.ts`) — item ini sekarang
  cuma tampil kalau user subscribe SALAH SATU dari 16 Varian Konverter. Behavior "Arsip Import"/grup "Facport"
  TIDAK berubah (item tanpa `moduleKey`/`moduleKeys` sama sekali tetap selalu tampil, sesuai desain lama).
- **`ModuleKey` global vs per-Produk**: `MODULE_CATALOG` sekarang lintas-Produk, jadi `Record<ModuleKey, T>` di
  konten KHUSUS Facport (`landing-content.ts`, dipakai landing + `/subscribe`) berhenti type-check (harus lengkap
  SEMUA modul lintas Produk). Ditambah tipe turunan `ModuleKeyForProductLine<P>` (`module-catalog.ts`) supaya
  exhaustiveness-check tetap jalan HANYA untuk modul Produk yang relevan, plus alias lebar `LANDING_MODULE_ICON_ANY`
  /`LANDING_MODULE_TAGLINE_ANY` (index langsung, BUKAN function call — function call di posisi JSX tag kena lint
  `react-hooks/static-components`) untuk 2 komponen yang me-reuse konten ini lintas Produk (`module-features.tsx`,
  `module-pricing-panel.tsx`) — Konverter belum punya copy sendiri, jadi Icon/tagline-nya `undefined` (render
  kosong, sudah toleran).
- `apps/api/src/scripts/cleanup-test-data.ts` ditambah blok hapus `conversion_logs` (3 FK sendiri: user/dataUsaha/
  subscription, semua `ON DELETE no action`) SEBELUM subscriptions/dataUsaha/user — kalau tidak, test suite yang
  nulis baris `conversion_logs` bikin script ini gagal FK violation begitu Fase 151+ mulai nulis test transaksi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api + apps/web, bersih.
- [x] Security review dijalankan — 4 file inti (`conversion-logs.route.ts`, `trial.ts`, `conversion.schema.ts`,
      `converter/shared.ts`+`download-file.ts`).
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan.
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan Medium/Low.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada satu pun tipe transaksi yang benar-benar bisa dipakai user di akhir fase ini — fase ini murni fondasi.
  16 Varian sudah terdaftar di katalog (admin BISA mulai setup Plan) tapi halaman konversi sungguhannya belum ada.
  Sidebar Konverter hari ini cuma berisi "Riwayat Konversi" (selalu kosong sampai Varian pertama live).
- Migrasi 34 user app lama sengaja tidak masuk scope (keputusan user, § ADR-0038 poin 9).
- Belum ada halaman/copy marketing khusus Konverter (landing page publik tetap murni Facport) — begitu admin
  bikin Plan Konverter aktif, modul itu akan ikut nongol di `/subscribe` (customer app) TANPA icon/tagline (fallback
  `undefined`, § Keputusan Kecil), tapi TIDAK di landing page publik (`GET /plans` belum difilter per Produk — jadi
  scope publik-page filtering ini masih terbuka, dicatat di lessons-learned kalau nanti jadi masalah nyata).

## Ringkasan Hasil
Fondasi Produk Konverter selesai dibangun 100% sesuai T1-T11: skema `conversion_logs` (migration `0031`), 16 entry
katalog modul (`konverter_*`, kategori baru "Master Data"), union TypeBox admin plans, gerbang kuota trial
check-and-record atomik (`checkAndRecordConversionRowBudget`, twin `checkTrialRowBudget`), route
`POST`/`GET /me/conversion-logs` (replikasi manual logic `moduleAccess()` karena moduleKey dinamis lintas 16
Varian), helper klien murni (`converter/shared.ts` — port VERBATIM 7 fungsi legacy dari `tool.html`,
`download-file.ts`), dependency `xlsx` (versi CDN sama `apps/api`), halaman "Riwayat Konversi" + 1 NavGroup
sidebar baru (Produk ke-2 yang divalidasi hidup bersamaan Facport, dengan gerbang visibilitas baru `moduleKeys`
supaya tidak nongol kosong ke SEMUA customer existing). 19 test baru (`trial.test.ts` +
`conversion-logs.route.test.ts`), semua lolos; suite penuh 1636+97 pass, 0 fail. Security review bersih, tidak ada
temuan. Dev DB dibersihkan (`db:cleanup-test-data`, sudah mencakup `conversion_logs`). Siap lanjut Fase 151+ (port
16 tipe transaksi satu-per-satu, mulai dari `requisition` per rencana awal).
