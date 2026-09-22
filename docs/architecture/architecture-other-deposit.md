# Architecture — Modul Other Deposit (Penerimaan Bank/Kas)

> **Catatan 2026-09-22:** scope `glaccount_view` yang disebut di dokumen ini SUDAH DIBUANG dari registri (`accurate-endpoint-registry.ts`) — tidak ada kode yang memanggil `glaccount/*.do`. Sumber kebenaran scope modul ini = registri, bukan teks historis di bawah.

> **Status: ✅ DIEKSEKUSI (Fase 128, 2026-09-16)** — riset field
> diverifikasi ULANG dari `docs/referencehtml/accurate-openapi.json`
> (bukan diasumsikan dari Other Payment), DAN sheet "Othe Deposit"
> (typo klien, kurang huruf "r") di
> `docs/referencehtml/facport/developmen-15-september-2026.xlsx` (1 dari
> 5 sheet baru yang dikirim client 2026-09-15 — 4 sheet lainnya, Sales
> Order/Item Requisition/Item Transfer/Inventory Adjustment, TERNYATA
> KOSONG TOTAL — tab ada, isi/screenshot 0 — jadi TIDAK dikerjakan fase
> ini, menunggu client isi dulu).

## Apa Itu "Other Deposit" — Kebalikan Other Payment
Other Payment = pengeluaran kas/bank untuk beban langsung. **Other
Deposit = PENERIMAAN kas/bank di luar penjualan** (setoran modal,
pendapatan lain-lain, dll) — TIDAK terkait faktur/customer apa pun,
langsung kredit akun tertentu dan debit akun kas/bank (kebalikan arah
Other Payment). Sudah diprediksi di `architecture-other-payment.md`
("Mirror konsepnya... TIDAK termasuk scope fase itu") — sekarang
digarap.

## Endpoint Accurate
```
POST /accurate/api/other-deposit/save.do   → create/edit
POST /accurate/api/other-deposit/bulk-save.do
GET  /accurate/api/other-deposit/detail.do
GET  /accurate/api/other-deposit/list.do
POST /accurate/api/other-deposit/delete.do
```
Scope: `other_deposit_view`, `other_deposit_save` (dikonfirmasi LANGSUNG
dari security requirement tiap endpoint di `accurate-openapi.json`,
bukan tebak pola nama dari `other_payment_*`).

## Struktur Field `save.do` — IDENTIK Other Payment (Diverifikasi Ulang, Bukan Asumsi)
Dicek properti-per-properti terhadap `accurate-openapi.json`: root
required (`bankNo`, `detailAccount`, `payee`, `transDate`) DAN root
optional (`branchId`/`branchName`/`chequeDate`/`chequeNo`/`description`/
`id`/`number`/`rate`/`typeAutoNumber`) SAMA PERSIS, sampai deskripsi
teksnya (Accurate reuse wording yang sama di kedua endpoint). Beda
CUMA di endpoint URL dan arah akuntansi.

**Field API `detailAccount[].expenseName` (WAJIB) namanya LITERAL
"expenseName" juga di endpoint Other Deposit** — ini BUKAN typo di kode
project ini, itu quirk penamaan Accurate sendiri (deskripsi resminya pun
masih bunyi "Nama beban yang ingin dicatat" walau konteksnya penerimaan).

## Gap — Sama Persis Other Payment (Dicek Ulang, Bukan Diwariskan Buta)
1. **"Expense Name"** — TIDAK ADA di sheet "Othe Deposit" client, TAPI
   `detailAccount[].expenseName` WAJIB di spec resmi (dicek ulang, bukan
   asumsi dari Other Payment). Solusi SAMA: kolom BARU "Expense Name" di
   template Facport (dipertahankan nama field API asli, bukan dikarang
   ulang jadi "Income Name" dll — supaya kalau Accurate balikin error
   yang sebut "expenseName", user masih nyambung ke kolom mana).
2. **`lineProjectNo`** dan **`attributTambahan*`/`attributNumber*`/
   `attributTanggal*`** (charField/numericField/dateField root) — SAMA
   status "belum diverifikasi end-to-end untuk endpoint ini" — dicek
   ulang ke `accurate-openapi.json`, 0 kemunculan di endpoint APA PUN
   yang dicek (sama seperti Other Payment), diasumsikan konsisten lintas
   transaksi berdasar konfirmasi Accurate Support untuk Purchase Invoice.

## Keputusan Desain
Sama semua dengan Other Payment (§ `architecture-other-payment.md`
§ "Keputusan Desain" — `branchName` WAJIB, grouping N-akun by "Trans No"
sejak awal, TIDAK ADA validasi balance) — TIDAK diulang di sini, baca
dokumen itu untuk rasionalnya. Field mapping SEBENARNYA →
`apps/api/src/lib/import-mapping/other-deposit.mapping.ts`.

## Worker Processing
Mirror PERSIS `processOtherPaymentGroup`/`ensureOtherPaymentDataClassifications`
— `processOtherDepositGroup`/`ensureOtherDepositDataClassifications`,
`workers/index.ts`. TIDAK ada "Batal Import" (konsisten Other Payment).

## Gap Registrasi Ditemukan Sekalian (Bukan Bug Modul Ini — Warisan Fase 120-124)
Saat cross-check titik registrasi modul (`grep '"other_payment"'` lintas
`apps/web`/`apps/api/src`), ketemu **5 modul Fase 120-124** (Purchase
Order/Receive Item/Purchase Return/Sales Quotation/Sales Return) TIDAK
PERNAH ditambahkan ke 3 file "daftar semua modul" berikut (checklist
kelewat saat batch itu dikerjakan):
1. `apps/web/lib/module-import-routes.ts` — "Arsip Import" gabungan
   tidak bisa bikin link Detail utk batch modul itu.
2. `apps/web/components/import-archive/import-batch-table.tsx` —
   tombol Delete tidak muncul sama sekali di "Arsip Import" gabungan
   untuk batch modul itu (BEDA dari 12 halaman Riwayat PER-MODUL yang
   sudah benar sejak Fase 126 — Arsip Import itu view TERPISAH).
3. `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx` —
   admin buka detail batch modul itu cuma lihat Ringkasan, TANPA tabel
   per-baris sama sekali (persis pola gap yang SAMA ditemukan 2026-09-06
   untuk Purchase Payment/Sales Receipt/Jurnal Umum).

**Diperbaiki SEKALIAN di fase ini** (bukan ditunda jadi fase terpisah —
gap kecil, ketemu langsung pas nambah entri `other_deposit` ke file yang
sama) untuk keenam modul (5 lama + `other_deposit` baru).

## Footprint Perubahan
File **BARU**:
- `apps/api/src/lib/import-mapping/other-deposit.mapping.ts` + test
- `apps/api/src/lib/accurate-other-deposit.ts`
- `apps/api/src/routes/other-deposit-import.route.ts` + test
- `apps/web/app/app/(protected)/other-deposit/import/page.tsx`
- `apps/web/app/app/(protected)/other-deposit/import/[batchId]/page.tsx`
- `apps/web/app/app/(protected)/other-deposit/import/riwayat/page.tsx`
- `apps/web/components/other-deposit/delete-import-dialog.tsx`
- `apps/web/components/other-deposit/edit-row-dialog.tsx`

File **existing** disentuh:
1. `apps/api/src/lib/accurate-endpoint-registry.ts` — entry `other_deposit` (scope diturunkan otomatis, Fase 142)
2. `apps/api/src/lib/import-mapping/template-guide.ts` — `otherDepositTemplateGuide`
3. `apps/api/src/lib/module-catalog.ts` — entry katalog (kategori "Cash & Bank")
4. `apps/api/src/workers/index.ts` — dispatch case `"other_deposit"`
5. `apps/api/src/routes/admin/plans.route.ts` — `t.Literal("other_deposit")`
6. `apps/api/src/app.ts` — registrasi route
7. `apps/web/lib/landing-content.ts` — icon + tagline marketing
8. `apps/web/components/app-shell/sidebar.tsx` — nav customer (kategori Cash & Bank)
9. `apps/web/lib/module-import-routes.ts` — + backfill 5 modul lama (§ Gap di atas)
10. `apps/web/components/import-archive/import-batch-table.tsx` — + backfill 5 modul lama
11. `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx` — + backfill 5 modul lama

## Referensi
- Sheet client: `docs/referencehtml/facport/developmen-15-september-2026.xlsx`, sheet "Othe Deposit"
- Spec resmi: `docs/referencehtml/accurate-openapi.json`
- Precedent lengkap (gap, keputusan desain, worker pattern): `architecture-other-payment.md`
- Rencana/eksekusi fase ini: `docs/phases/phase-128-modul-other-deposit.md`

## Scope OAuth (final, sesuai kode & registri Fase 142)
`other_deposit_save` + `other_deposit_view` (warisan katalog; kode hanya memanggil `POST other-deposit/save.do`), `data_classification_view` +
`data_classification_save` (auto-create Kategori Keuangan lewat `findOrCreateDataClassification`, dipakai kolom atribut), dan `glaccount_view`
(warisan katalog, tidak ada panggilan `glaccount/*.do`). Sumber kebenaran: `apps/api/src/lib/accurate-endpoint-registry.ts` entry `other_deposit`.
