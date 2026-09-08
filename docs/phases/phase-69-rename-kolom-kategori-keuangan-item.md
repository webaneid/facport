# Fase 69 — Rename Kolom Excel "ITEM:CUSTOM CHARACTER N" -> "Kategori Keuangan N"

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Setelah Fase 68 (auto-create Kategori Keuangan) diverifikasi berhasil
end-to-end (client kirim screenshot Accurate: field label "TES 1" =
value "HWGRIO" persis seperti dikirim), client menunjukkan bahwa nama
kolom Excel kita ("ITEM:CUSTOM CHARACTER N") membingungkan — di UI
Accurate sendiri field ini TAMPIL dengan label default **"Kategori
Keuangan N"** (istilah resmi Accurate untuk `/api/data-classification`,
sudah dikonfirmasi di Fase 68), BUKAN "ITEM:CUSTOM CHARACTER N" (istilah
yang kita pakai sejak Fase 61, ambil dari header Excel asli client, tapi
TIDAK PERNAH muncul di Accurate itu sendiri). Ini sumber kebingungan
berulang sepanjang sesi debugging Fase 67-69.

## Scope
- [x] `template-guide.ts` — `column` untuk 10 entri diganti dari
      "ITEM:CUSTOM CHARACTER N" ke "Kategori Keuangan N" (ini yang jadi
      HEADER SUNGGUHAN di file template Excel yang di-download user,
      `generateTemplateBuffer`).
- [x] `defaultColumnMap` (`sales-invoice.mapping.ts`) — tambah sinonim
      BARU "Kategori Keuangan N" -> `attributN`, sinonim LAMA
      "ITEM:CUSTOM CHARACTER N" TETAP dipertahankan (tidak regresi
      client existing yang sudah pakai nama lama).
- [x] Dropdown `ACCURATE_FIELDS` (`import/page.tsx`) — label attribut1-10
      diganti dari "Atribut Tambahan Karakter N (per barang)" ke
      "Kategori Keuangan N (per barang)".
- [x] Test baru (`sales-invoice.mapping.test.ts`) — sinonim baru DAN
      lama sama-sama termapping ke `attributN`.
- [x] Typecheck 0 error, full test suite pass (460, +1 baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`
  § "Atribut Tambahan".
- Fase terkait: Fase 55/61 (implementasi & koreksi awal, sumber nama
  "ITEM:CUSTOM CHARACTER N"), Fase 68 (auto-create, konfirmasi field API
  = "Kategori Keuangan" resmi Accurate).

## Keputusan Kecil Selama Eksekusi
- TIDAK menghapus/mengganti sinonim lama — cuma menambah yang baru
  sebagai default UTAMA di template baru. Field mapping (`attribut1-10`
  -> `dataClassificationNName`) TIDAK berubah sama sekali, murni
  perubahan LABEL/nama kolom tampilan.
- Label dropdown header-level (`attributHeaderKarakter1-10`, charField)
  TIDAK diubah — client cuma minta perbaikan untuk level ITEM, dan
  level header itu field yang BERBEDA (bukan "Kategori Keuangan" sama
  sekali, § Fase 64).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (murni perubahan teks label/nama
      kolom, tidak ada logic/data flow yang berubah, tidak ada endpoint
      baru).
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- Client yang SUDAH terlanjur download template LAMA (header
  "ITEM:CUSTOM CHARACTER N") tetap bisa import tanpa masalah (sinonim
  lama dipertahankan) — TAPI kalau mereka download template BARU
  sekarang, judul kolomnya sudah berubah jadi "Kategori Keuangan N".

## Ringkasan Hasil
Kolom Excel level ITEM untuk Atribut Tambahan diganti namanya dari
"ITEM:CUSTOM CHARACTER N" menjadi "Kategori Keuangan N" (istilah resmi
Accurate, dikonfirmasi via screenshot client) di template download,
default column map (sinonim baru ditambah, lama dipertahankan), dan
dropdown konfirmasi mapping. `bun run typecheck` 0 error, `bun test` 460
pass/0 fail (1 baru).
