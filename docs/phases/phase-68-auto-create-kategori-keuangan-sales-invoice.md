# Fase 68 — Auto-Create Kategori Keuangan (Atribut Tambahan Item-Level) Sales Invoice

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Client retest Sales Invoice (setelah Fase 67 di-deploy, pakai Trans No
baru supaya tidak kena bug duplikat lintas-batch) dan dapat error BARU
dari Accurate: `Kategori Keuangan TES 1 tidak ditemukan atau sudah
dihapus`. Investigasi menemukan "Kategori Keuangan" adalah nama resmi
Accurate untuk endpoint `/api/data-classification` — PERSIS fitur
"Atribut Tambahan" item-level (`detailItem.dataClassificationNName`,
Fase 55/61) yang sudah kita implementasi. Field ini TERNYATA BUKAN teks
bebas: Accurate mewajibkan nilainya SUDAH ADA sebagai master data
"Kategori Keuangan" lebih dulu, kalau belum ada langsung ditolak.

Karena aplikasi ini **belum publish** (baru testing internal dengan tim
client), user (pemilik project) memutuskan sekarang saat yang tepat
untuk menambah scope OAuth baru (client akan disconnect & reconnect
Accurate) supaya bisa langsung implementasi **auto-create** Kategori
Keuangan — user tidak perlu bikin manual dulu di Accurate sebelum
import, sama seperti auto-create Customer (Fase 13) & Item (Fase 05).

## Scope
- [x] `apps/api/src/lib/accurate-data-classification.ts` (baru) —
      `findDataClassificationByName`/`findOrCreateDataClassification`,
      mirror pola `accurate-customer.ts`/`accurate-item.ts`.
- [x] `extractDataClassificationValues` (pure function,
      `sales-invoice.mapping.ts`) — daftar `{index, name}` dari kolom
      attribut1-10 yang terisi di 1 baris, + test.
- [x] Wire ke `processSalesInvoiceGroup` DAN `appendToExistingSalesInvoice`
      (`workers/index.ts`) via helper `ensureDataClassifications`,
      dipanggil SEBELUM `saveSalesInvoice` — dedupe per (index,name)
      supaya tidak panggil API berkali-kali untuk nilai yang sama
      diulang di banyak baris/batch.
- [x] Scope baru `data_classification_view`/`data_classification_save`
      ditambah ke `MODULE_ACCURATE_SCOPES.sales_invoice`
      (`accurate-scopes.ts`).
- [x] Typecheck 0 error, full test suite pass (459, +3 baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`
  § "Atribut Tambahan".
- Fase terkait: Fase 05 (auto-create Item, pola yang di-mirror), Fase 13
  (auto-create Customer, pola yang di-mirror), Fase 55/61 (implementasi
  awal Atribut Tambahan item-level), Fase 67 (fix yang membuat error ini
  baru bisa terlihat — sebelumnya silent-skip menyembunyikan masalah
  ini sama sekali).

## Keputusan Kecil Selama Eksekusi
- TIDAK dibuat ADR terpisah — ini murni perluasan pola auto-create yang
  SUDAH ada (Fase 05/13), bukan keputusan arsitektur baru. Konsisten
  dengan Fase 05/13 sendiri yang juga tidak punya ADR khusus.
- Auto-create HANYA diterapkan ke Sales Invoice (satu-satunya modul
  yang punya field Atribut Tambahan item-level saat ini) — Purchase
  Invoice tidak dicek/diubah karena memang tidak punya field ini.
- `findDataClassificationByName` mencocokkan ulang `index` DAN `name`
  (case-insensitive, trim) di sisi kita SETELAH hasil dari
  `filter.keywords` Accurate — spec resmi TIDAK menjamin filter
  `keywords` itu exact-match (cuma didokumentasikan sebagai "pencarian
  umum"), jadi tidak dipercaya mentah-mentah (pelajaran dari Fase 61:
  jangan asumsikan perilaku API dari nama parameter saja).
- Dedupe per `(index, name)` dilakukan di level grup/batch (Set
  in-memory), BUKAN query DB — konsisten dengan pola dedupe
  `seenItemNo` yang sudah ada untuk auto-create Item.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline (5 file diubah, semua low-risk — mirror
      pola auto-create existing yang sudah aman, tidak ada endpoint
      HTTP baru, tidak ada secret baru, tidak ada raw SQL) — tidak
      didelegasikan ke subagent karena perubahan tidak lintas domain,
      cukup direview langsung.
- [x] Tidak ada temuan Critical/High.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- **WAJIB re-authorize/reconnect Accurate** untuk semua koneksi Sales
  Invoice yang sudah connect SEBELUM fase ini (scope baru tidak
  otomatis nempel ke token lama) — user sudah setuju untuk minta client
  disconnect & reconnect karena aplikasi belum publish/masih testing
  internal.
- `findOrCreateDataClassification` HANYA create dengan `name` (dan
  `index`) — tidak ada field opsional lain (`suspended`, dst) yang
  di-set dari Excel, karena tidak ada kebutuhan/kolom Excel untuk itu
  sekarang (bisa ditambah nanti kalau diminta, pola sama seperti
  `itemAutoCreateMapping`/`customerAutoCreateMapping`).
- BELUM diverifikasi end-to-end ke Accurate SUNGGUHAN (butuh client
  reconnect dulu) — perilaku `filter.keywords` untuk pencarian Kategori
  Keuangan existing baru bisa dikonfirmasi presisinya setelah retest
  nyata. Kalau ternyata match balik record index/nama yang salah,
  fallback aman tetap create baru (idempotent by design: create record
  duplikat cuma bikin 2 record Kategori Keuangan mirip di Accurate,
  bukan crash/data salah kirim — tapi tetap perlu dipantau di
  retest pertama).

## Ringkasan Hasil
Ditemukan bahwa field Atribut Tambahan item-level Sales Invoice
(`dataClassificationNName`) mewajibkan referensi ke master data
"Kategori Keuangan" (`/api/data-classification`) yang SUDAH ADA di
Accurate — bukan teks bebas seperti diasumsikan sebelumnya. Karena
aplikasi belum publish, diimplementasikan auto-create (mirror pola
Customer/Item Fase 05/13): `findOrCreateDataClassification` dipanggil
untuk tiap nilai Atribut Tambahan yang terisi, SEBELUM
`saveSalesInvoice`, dengan scope OAuth baru `data_classification_view`/
`_save`. `bun run typecheck` 0 error, `bun test` 459 pass/0 fail (3
baru). Client perlu disconnect & reconnect Accurate untuk dapat scope
baru sebelum retest.
