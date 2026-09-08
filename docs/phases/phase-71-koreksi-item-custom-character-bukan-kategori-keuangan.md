# Fase 71 — Koreksi Sinonim Salah "ITEM:CUSTOM CHARACTER N" (Terbukti Tidak Ada Field-nya)

**Status:** Done (kode selesai, SENGAJA belum di-push per instruksi user — akan digabung ke fase berikutnya)
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Fase 69 menyimpulkan "ITEM:CUSTOM CHARACTER N" (nama kolom lama kita)
adalah SINONIM dari "Kategori Keuangan N" (`dataClassificationNName`) —
KELIRU. Client tunjukkan file Excel mereka sendiri (kolom "ITEM: CUSTOM
CHARACTER 1-10" di-highlight KUNING sebagai yang mereka BUTUHKAN,
terpisah dari "Kategori Keuangan 1-10" di kolom lain file yang sama)
DAN screenshot menu Accurate "Rancangan Formulir → Atribut Tambahan →
Tipe Karakter/Tipe Angka" — sempat diduga ini field API KETIGA yang
belum teridentifikasi (pola sama seperti `charField` dulu, Fase 64).

**Investigasi lanjutan** (kirim pertanyaan resmi ke Accurate Support,
sama seperti tiket #357901) memberi jawaban DEFINITIF: field "Atribut
Tambahan" yang TERSEDIA di Accurate CUMA 2 kelompok —
`charField1-10`/`numericField1-10`/`dateField1-2` (level FAKTUR) dan
`dataClassification1-10Name` (Kategori Keuangan, level ITEM/EXPENSE).
**TIDAK ADA field ketiga.** "ITEM: CUSTOM CHARACTER N" di Excel client
TERBUKTI cuma istilah mereka sendiri untuk salah satu dari 2 field yang
SUDAH kita implementasi (Fase 64 kalau nilainya sama untuk seluruh
faktur, Fase 68 kalau nilainya perlu beda per baris barang) — bukan
field baru, murni beda persepsi/istilah dengan client.

## Scope
- [x] `defaultColumnMap` (`sales-invoice.mapping.ts`) — HAPUS sinonim
      SALAH `"ITEM:CUSTOM CHARACTER N": attributN` yang ditambahkan
      keliru di Fase 69. "Kategori Keuangan N" jadi SATU-SATUNYA nama
      kolom untuk `attribut1-10`.
- [x] `template-guide.ts` — sempat ditambah placeholder "ITEM: CUSTOM
      CHARACTER N" (belum di-mapping) saat investigasi masih
      berlangsung, DIHAPUS LAGI setelah Accurate Support konfirmasi
      field itu tidak ada — komentar penjelasan ditinggalkan di kode
      supaya histori investigasi ini tidak hilang/terulang.
- [x] Test diperbarui (`sales-invoice.mapping.test.ts`) — pastikan
      "ITEM:CUSTOM CHARACTER N" (dengan/tanpa spasi) TIDAK ter-mapping
      ke `attributN` mana pun.
- [x] Typecheck 0 error, full test suite pass (460).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`.
- Fase terkait: Fase 64 (Atribut Tambahan level FAKTUR, `charField`),
  Fase 68 (Kategori Keuangan level ITEM, `dataClassificationNName`),
  Fase 69 (sinonim salah yang dikoreksi di sini).

## Keputusan Kecil Selama Eksekusi
- TIDAK menambahkan field/kolom baru sama sekali di akhir investigasi —
  kesimpulan akhirnya "tidak ada yang perlu ditambah", kedua field yang
  relevan SUDAH ADA dan SUDAH JALAN (Fase 64 & 68).
- Komentar penjelasan (bukan cuma revert diam-diam) SENGAJA ditinggal
  di `template-guide.ts` dan `sales-invoice.mapping.ts` — supaya kalau
  ada yang menemukan istilah "ITEM: CUSTOM CHARACTER" lagi di masa
  depan (dari client ini atau client lain), tidak perlu mengulang
  seluruh investigasi dari nol.
- Sinonim SALAH Fase 69 dianggap CUKUP SERIUS untuk dihapus segera
  (bukan cuma dicatat known limitation) karena kalau dibiarkan, data
  user bisa SALAH KIRIM ke Kategori Keuangan tanpa error — silent data
  mismatch, bukan cuma UI membingungkan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (murni koreksi mapping/label,
      tidak ada data flow/logic baru, tidak ada endpoint baru).
- [x] `docs/PROGRESS.md` diupdate.
- [x] `docs/lessons-learned.md` diupdate.

## Known Limitations
- **SENGAJA BELUM di-push/deploy** — instruksi eksplisit user
  ("jgn push dulu.. sementara sampe situ dulu") setelah investigasi
  selesai. Akan digabung dengan fase berikutnya (Expense) sebelum
  commit+push+release.

## Ringkasan Hasil
Investigasi menyeluruh (Excel client, screenshot Rancangan Formulir,
konfirmasi resmi Accurate Support) membuktikan TIDAK ADA field API
ketiga bernama "ITEM: CUSTOM CHARACTER" — istilah itu cuma persepsi
client untuk salah satu dari 2 field yang SUDAH diimplementasi (Fase 64
`charField` level faktur, Fase 68 `dataClassificationNName` level
item). Sinonim SALAH Fase 69 dihapus, template dikembalikan ke state
Fase 70 (bersih, tanpa kolom placeholder yang membingungkan).
`bun run typecheck` 0 error, `bun test` 460 pass/0 fail.
