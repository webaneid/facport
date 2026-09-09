# Fase 74 — Kategori Keuangan Level EXPENSE (Baris Beban) Sales Invoice

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Melengkapi implementasi "Kategori Keuangan" (`dataClassificationNName`)
untuk level **EXPENSE** (baris Beban) — field API SAMA PERSIS dengan
level Item (Fase 55/68), cuma nempel di array `detailExpense[]`
(sibling dari `detailItem[]` di payload `sales-invoice/save.do`), bukan
`detailItem[]`. Ini melengkapi 3 mekanisme Atribut Tambahan yang sudah
teridentifikasi (Fase 64 header, Fase 73 item, sekarang expense) — lihat
`docs/architecture/architecture-sales-invoice.md` § "Atribut Tambahan"
untuk peta lengkapnya.

## Scope
- [x] `sales-invoice.mapping.ts` — field baru `expenseAccountNo`,
      `expenseName`, `expenseAmount`, `expenseNotes`,
      `expenseDepartmentName`, `expenseKategoriKeuangan1-10` →
      `detailExpense.accountNo`/`expenseName`/`expenseAmount`/
      `expenseNotes`/`departmentName`/`dataClassification1-10Name`.
- [x] `buildDetailExpenseFromRow` (baru) — mirror `buildDetailItemFromRow`,
      balikin `null` kalau `accountNo`/`expenseAmount` TIDAK dua-duanya
      terisi (syarat minimal 1 baris punya data Beban yang valid).
- [x] `buildSalesInvoicePayload` — panggil `buildDetailExpenseFromRow`
      untuk SEMUA baris grup, filter yang `null`, `payload.detailExpense`
      cuma disertakan kalau ADA minimal 1 hasil non-null. Loop header
      diperbaiki supaya JUGA skip field ber-prefix `detailExpense.`
      (sebelumnya cuma skip `detailItem.` — field expense akan salah
      masuk root kalau tidak diperbaiki).
- [x] `extractExpenseDataClassificationValues` (baru) — mirror
      `extractDataClassificationValues` untuk slot
      `expenseKategoriKeuangan1-10`.
- [x] `defaultColumnMap` — 15 kolom Excel baru ("Akun Beban", "Nama
      Beban", "Jumlah Beban", "Catatan Beban", "Beban - Department",
      "Kategori Keuangan Beban 1-10").
- [x] `template-guide.ts` — 15 kolom baru ditambahkan PALING AKHIR
      (setelah "Kategori Keuangan 10") sesuai permintaan.
- [x] `import/page.tsx` (`ACCURATE_FIELDS`) — 15 opsi dropdown baru.
- [x] `workers/index.ts` — `ensureDataClassifications` diperluas
      memproses nilai Kategori Keuangan level EXPENSE juga (dedupe
      BARENG dengan level item, reuse `findOrCreateDataClassification`
      yang SAMA — tidak ada fungsi auto-create baru).
- [x] Logging debug sementara Fase 73 (`accurate-sales-invoice.ts`)
      DIHAPUS — investigasinya sudah tuntas (root cause: worker
      production belum di-restart ke versi terbaru, § lessons-learned).
- [x] Test baru (`sales-invoice.mapping.test.ts`) — `buildDetailExpenseFromRow`
      (lengkap, syarat minimal, kosong), `buildSalesInvoicePayload`
      dengan/tanpa data Beban serta multi-baris campuran,
      `extractExpenseDataClassificationValues`, `defaultColumnMap`.
- [x] Typecheck 0 error, full test suite pass (473, +13 baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`.
- Fase terkait: Fase 55/61/68 (Kategori Keuangan level Item, pola yang
  di-mirror), Fase 73 (Atribut Tambahan level Item charField, saga
  investigasi yang baru tuntas sebelum fase ini dimulai).

## Keputusan Kecil Selama Eksekusi
- **1 baris Excel BISA menyumbang 1 baris Barang DAN/ATAU 1 baris
  Beban sekaligus** — TIDAK ada kolom "Tipe Baris" terpisah. Kalau
  kolom Beban (`Akun Beban` + `Jumlah Beban`) terisi di suatu baris,
  baris itu OTOMATIS ikut jadi 1 entri `detailExpense`, TERLEPAS dari
  data Barang di baris yang sama. Ini desain paling sederhana yang
  konsisten dengan pola "header field dibaca dari baris manapun yang
  mengisinya" yang sudah ada — TIDAK butuh perubahan skema/UI baru
  untuk menandai tipe baris.
- **`accountNo` + `expenseAmount` WAJIB dua-duanya terisi** supaya
  baris dianggap punya data Beban — tanpa akun perkiraan & nominal,
  entri Beban tidak ada artinya buat Accurate. Kalau cuma salah satu
  terisi, baris itu dianggap TIDAK punya data Beban SAMA SEKALI
  (bukan dikirim setengah-setengah yang berpotensi ditolak Accurate).
- **Dedupe Kategori Keuangan digabung** antara level Item dan Expense
  dalam SATU proses `ensureDataClassifications` — field API-nya SAMA
  (`dataClassificationNName`), master data-nya SATU set per index
  terlepas nempel di `detailItem` atau `detailExpense`, jadi kalau nama
  yang sama kebetulan dipakai di keduanya dalam 1 batch, cukup 1x
  panggilan create.
- **TIDAK diterapkan ke jalur `appendToExistingSalesInvoice`** (Fase 67
  retry-cerdas) — jalur itu cuma track `accurateDetailItemId` per baris
  (skema DB tidak punya kolom untuk track detail expense per baris),
  jadi baris Beban pada skenario append/retry TIDAK diproses. Dicatat
  di Known Limitations, bukan blocker untuk kasus penggunaan utama
  (upload baru/CREATE).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — tidak ada endpoint/data flow baru, reuse
      fungsi auto-create yang sudah direview (Fase 68). Tidak ada
      temuan.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `docs/architecture/architecture-sales-invoice.md` diupdate.

## Known Limitations
- Baris Beban pada skenario `appendToExistingSalesInvoice` (retry
  lintas-batch, Fase 67) TIDAK diproses — cuma berlaku untuk CREATE
  faktur baru. Kalau dibutuhkan nanti, perlu tambah kolom tracking
  `accurateDetailExpenseId` di skema `import_batch_rows` dulu.
  UI konfirmasi mapping juga BELUM ada validasi "kalau Akun Beban
  diisi, Jumlah Beban wajib ikut diisi" (atau sebaliknya) — kalau user
  isi cuma salah satu, baris itu diam-diam dianggap TIDAK punya data
  Beban (bukan error) — konsisten dengan desain, tapi bisa membingungkan
  kalau user tidak sadar keduanya wajib berpasangan.
- BELUM diverifikasi end-to-end ke Accurate SUNGGUHAN (field
  `detailExpense` belum pernah ditest kirim nyata) — field API-nya
  dikonfirmasi dari spec resmi (bukan tebakan), tapi mengingat riwayat
  Fase 61-73 (spec sering tidak lengkap/field API yang "kelihatan
  benar" ternyata perlu penyesuaian), tetap perlu retest nyata oleh
  client sebelum dianggap 100% pasti.

## Ringkasan Hasil
Kategori Keuangan level Expense (`detailExpense.dataClassificationNName`)
diimplementasikan mirror pola level Item (Fase 68), plus field dasar
Expense (`accountNo`, `expenseName`, `expenseAmount`, `expenseNotes`,
`departmentName`). 15 kolom Excel baru ditambahkan di posisi paling
akhir template. 1 baris Excel bisa berkontribusi ke `detailItem` DAN/ATAU
`detailExpense` sekaligus tergantung kolom mana yang terisi. `bun run
typecheck` 0 error, `bun test` 473 pass/0 fail (13 baru).
