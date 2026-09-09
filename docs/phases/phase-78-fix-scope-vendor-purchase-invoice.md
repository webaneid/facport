# Fase 78 — Fix Scope `vendor_view`/`vendor_save` Hilang dari Purchase Invoice

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Client retest Purchase Invoice (koneksi Accurate AKTIF, scope Fase 75
sudah termasuk) — SEMUA baris di grup manapun gagal `Accurate API gagal:
HTTP 403`, persis di baris PERTAMA tiap grup. Investigasi menemukan bug
scope OAuth yang sudah ada sejak ADR-0026 (bukan bug baru dari Fase
74-77) — fase ini memperbaikinya.

## Scope
- [x] `accurate-scopes.ts` — `vendor_view`/`vendor_save` DIKEMBALIKAN ke
      daftar scope `purchase_invoice` (TETAP juga ada di
      `vendor_payable_account`, bukan dipindah lagi).
- [x] Test regresi baru (`accurate-scopes.test.ts`).
- [x] `docs/lessons-learned.md` — entri baru (root cause + pencegahan).
- [x] Typecheck 0 error, full test suite pass (492, +3 baru).
- [x] Dev DB dibersihkan dari data test.

## Referensi
- ADR-0026 (`docs/decisions/adr-0026-modul-akun-hutang-pemasok-terpisah.md`)
  — keputusan yang tidak sengaja memicu bug ini.
- `apps/api/src/lib/accurate-vendor.ts` § `findOrCreateVendor` — fungsi
  yang butuh scope ini, dipanggil dari `processPurchaseInvoiceGroup`
  (`workers/index.ts`).
- `docs/lessons-learned.md` 2026-09-09 (entri fase ini) — kronologi
  lengkap root cause.

## Root Cause
ADR-0026 (commit `1bc9256`, "Import Akun Hutang Pemasok" jadi sub-modul
berbayar terpisah) memindahkan scope `vendor_view`/`vendor_save`
SEPENUHNYA dari `purchase_invoice` ke `vendor_payable_account`, dengan
asumsi 2 scope itu CUMA dipakai fitur "Import Akun Hutang Pemasok"
(`vendor-payable-account-import.route.ts`). Asumsi itu KELIRU:
`findOrCreateVendor` (Fase 05) — fitur auto-create/lookup vendor yang
dipanggil UNCONDITIONAL di SETIAP grup import Purchase Invoice (fitur
INTI, tidak terkait Akun Hutang Pemasok sama sekali) — JUGA butuh scope
yang sama. Sejak commit itu deploy, semua subscriber Purchase Invoice
TANPA subscribe Akun Hutang Pemasok kehilangan scope ini diam-diam.

## Keputusan Kecil Selama Eksekusi
- **Scope TETAP ada di KEDUA modul** (`purchase_invoice` DAN
  `vendor_payable_account`) — bukan dipindah balik sepenuhnya ke
  `purchase_invoice` saja, karena `vendor_payable_account` (fitur Import
  Akun Hutang Pemasok) tetap independen dan perlu scope ini sendiri
  kalau customer subscribe modul itu TANPA Purchase Invoice.
- **Tidak menyentuh `findOrCreateVendor`** — fungsinya sendiri sudah
  benar sejak awal (Fase 05), murni scope OAuth yang salah dikurangi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — perubahan scope OAuth (least privilege
      tetap terjaga, scope ditambah HANYA yang benar-benar dipakai kode
      `purchase_invoice`, bukan scope sembarangan). Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `docs/lessons-learned.md` diupdate.

## Known Limitations
- **Koneksi Purchase Invoice yang SUDAH ADA WAJIB disconnect+reconnect**
  setelah fix ini deploy — token lama tidak otomatis dapat scope baru
  (pola sama seperti Fase 04/68/75).
- Bug ini kemungkinan sudah berdampak ke SEMUA subscriber Purchase
  Invoice produksi sejak ADR-0026 deploy (bukan cuma 1 client) — belum
  ada audit menyeluruh berapa banyak subscriber lain yang mungkin juga
  kena tapi belum lapor/belum sempat retest.

## Ringkasan Hasil
Scope `vendor_view`/`vendor_save` dikembalikan ke daftar scope
`purchase_invoice` (`accurate-scopes.ts`) — root cause dari error 403
yang dialami client saat retest Purchase Invoice. Test regresi
ditambahkan. `bun run typecheck` 0 error, `bun test` 492 pass/0 fail (3
baru). Dev DB dibersihkan. Koneksi Purchase Invoice existing perlu
disconnect+reconnect setelah deploy.
