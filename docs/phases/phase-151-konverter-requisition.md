# Fase 151 — Konverter: Port Tipe Transaksi Pertama (Requisition)

**Status:** Done
**Mulai:** 2026-09-23
**Selesai:** 2026-09-23

## Tujuan
Port tipe transaksi PERTAMA dari 16 Varian Konverter (§ ADR-0038, `architecture-konverter.md`) — validasi
end-to-end pipeline lengkap: upload Excel → parse+`process()`+`build()` di browser → ringkasan/error → gerbang
kuota trial server → download `.xml`. `requisition` (Permintaan Barang) dipilih sebagai pilot karena PALING
SEDERHANA dari 16 tipe (tanpa pajak/stok/jurnal, dokumen internal) — kalau pipeline-nya benar di sini, pola yang
sama tinggal direplikasi untuk 15 tipe sisanya di Fase 152+.

## Scope
- [x] `lib/converter/shared.ts` — tambah `checkHeaders()` (helper generik legacy yang kelewat diporting Fase 150)
- [x] `lib/converter/converter-type.ts` — interface generik `ConverterType<TCtx>` (dipakai SEMUA 16 tipe)
- [x] `lib/converter/types/requisition.ts` — port VERBATIM `TYPES.requisition` (`tool.html` baris 1082-1128)
- [x] `lib/converter/read-excel.ts` — baca file Excel + filter baris contoh "CONTOH-HAPUS" (shared, dipakai semua tipe)
- [x] `lib/converter/template.ts` — generate template Excel client-side (shared, dipakai semua tipe)
- [x] `components/converter/converter-type-view.tsx` — UI generik (Branch Code, upload, ringkasan, preview XML, download)
- [x] `app/app/(protected)/konverter/requisition/page.tsx` — Server Component, gerbang subscription SEBELUM render UI
- [x] Sidebar: item nyata "Permintaan Barang (Requisition)" di grup "Konverter"
- [x] Test: `shared.test.ts` (helper generik, kasus tepi `num`/`normDate`/`flag1`) + `requisition.test.ts`
      (process/build/summary, termasuk 1 assertion XML EXACT STRING MATCH untuk verifikasi kesetaraan legacy)
- [x] Typecheck + lint + test penuh; security review

## Referensi
- Architecture doc: `docs/architecture/architecture-konverter.md`
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Phase fondasi: `docs/phases/phase-150-arsitektur-konverter.md`
- Sumber legacy: `/Users/webane/sites/konverter/tool.html` baris 1082-1128 (`TYPES.requisition`), 457-491 (helper),
  1350-1495 (orkestrasi UI: `readExcel`/`handleFile`/`render`/template/download)

## Keputusan Kecil Selama Eksekusi
- **Gerbang page-level baru (TIDAK ada presedennya di halaman import Facport manapun)**: karena `process()`/
  `build()` jalan 100% di browser, kalau halaman TIDAK dicek subscription-nya SENDIRI (Server Component, sebelum
  render UI interaktif), user yang login tapi tidak subscribe tetap bisa lihat SELURUH hasil konversi (preview
  XML) tanpa panggilan server sama sekali — beda dari Facport yang aman tanpa gerbang page-level karena
  pemrosesan sungguhan selalu di server (403 duluan). Ditambahkan pola baru: fetch `/me/subscriptions` (Server
  Component, pola sama `import/arsip/page.tsx`), render `EmptyState` "Belum berlangganan" + CTA ke `/subscribe`
  kalau modul ini tidak aktif di Data Usaha aktif. Pola ini akan di-REUSE apa adanya untuk 15 tipe sisanya.
- **`ConverterSummary.rowCount` sebagai field EKSPLISIT** (bukan diambil dari posisi tertentu di `stats[]`) —
  desain awal saya sempat mengambil `stats[1][0]` (asumsi index 1 selalu "baris item"), tapi ini asumsi rapuh
  yang tidak akan berlaku sama untuk semua 16 tipe (mis. `stdcost` kemungkinan struktur `stats`-nya beda).
  Diperbaiki SEBELUM commit: `summary()` tiap tipe WAJIB balikin `rowCount` eksplisit, dipakai `POST
  /me/conversion-logs` apa adanya.
- Nama file `template_{moduleKey}.xlsx` (bukan `template_{legacyCode}_accurate5.xlsx` seperti legacy) — legacy
  pakai kode internal singkat ("requisition") yang TIDAK 1:1 dengan moduleKey kita untuk semua 16 tipe (mis.
  "salesinvoice" vs `konverter_sales_invoice`), jadi disederhanakan pakai moduleKey langsung (konsisten,
  deterministik lintas tipe) — bukan bagian yang perlu identik dengan legacy (cuma nama file template, BUKAN
  struktur kolom/XML yang wajib sama).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api + apps/web, bersih.
- [x] Security review dijalankan — 6 file (page gate, view, requisition.ts, converter-type.ts, read-excel.ts, template.ts).
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan.
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 1 risiko arsitektural (bundle JS
      visible ke user teknis, melewati gerbang page-level) dicatat di Known Limitations `architecture-konverter.md`
      (kategori risiko SAMA dengan kuota trial self-reported Fase 150, sudah diterima ADR-0038, bukan bug baru).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Lihat `architecture-konverter.md` § Known Limitations (bagian baru ditambah fase ini: gerbang page-level tidak
  airtight terhadap user teknis yang panggil bundle JS langsung — risiko diterima, sama kategori kuota trial).
- 15 tipe transaksi sisanya BELUM diporting — menyusul Fase 152+, per kelompok kecil (2-4 tipe/fase).
- Belum ada Web Worker (file besar bisa freeze UI) — belum jadi masalah nyata untuk `requisition` (tipe paling
  ringan), revisit begitu tipe yang lebih berat (mis. `salesinvoice` dengan pajak multi-baris) diporting.

## Ringkasan Hasil
Pipeline end-to-end Konverter tervalidasi lengkap untuk 1 tipe transaksi (`konverter_requisition`): upload Excel
→ parse+validasi+build XML 100% client-side → ringkasan+error/warning → gerbang kuota trial server (`POST
/me/conversion-logs`, reuse Fase 150) → download `.xml`. Fondasi generik (`ConverterType<TCtx>` interface,
`ConverterTypeView` component, `read-excel.ts`/`template.ts` shared helper) siap dipakai apa adanya untuk 15 tipe
sisanya — Fase 152+ tinggal menambah 1 file `lib/converter/types/{tipe}.ts` + 1 file `page.tsx` tipis per tipe,
tanpa perlu membangun ulang infrastruktur UI. Logic `process`/`build`/`summary` diverifikasi IDENTIK dengan
legacy `tool.html` (termasuk 1 assertion XML exact-string-match). 56 test baru di `lib/converter/`
(`shared.test.ts` + `requisition.test.ts`), semua lolos. Suite penuh 1636 (api, tidak berubah) + 153 (web) pass,
0 fail. Security review:
tidak ada temuan Critical/High, 1 risiko arsitektural dicatat (kategori sama yang sudah diterima ADR-0038).
