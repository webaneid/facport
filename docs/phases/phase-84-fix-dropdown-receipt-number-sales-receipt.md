# Fase 84 — Fix Dropdown "No. Sales Receipt" Hilang & Komentar Basi (Sales Receipt)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
User minta review kolom fitur Sales Receipt + cek kesesuaian dokumentasi
arsitektur. Dokumentasi (`architecture-sales-receipt.md`) TERBUKTI
akurat & lengkap terhadap backend, TAPI ditemukan 2 gap di frontend yang
TIDAK disebut di dokumentasi manapun:

1. Dropdown mapping kolom manual (`import/page.tsx`) TIDAK PUNYA opsi
   "No. Sales Receipt" (`receiptNumber`) sama sekali — field ini SUDAH
   ADA di backend sejak Fase 49 (kunci grouping multi-faktur), tapi
   TIDAK PERNAH ditambahkan ke dropdown `ACCURATE_FIELDS`. Field ini
   cuma bisa ke-mapping OTOMATIS kalau nama kolom Excel PERSIS "No.
   Sales Receipt"/"Nomor Penerimaan"/"No Penerimaan" — kalau client
   pakai nama kolom lain, TIDAK BISA di-mapping manual sama sekali,
   fitur grouping jadi unreachable.
2. Komentar di atas file yang sama masih bilang "1 baris Excel = 1
   penerimaan = 1 faktur" — deskripsi LAMA (sebelum Fase 49), sudah
   tidak akurat.

## Scope
- [x] `apps/web/app/app/(protected)/sales-receipt/import/page.tsx` —
      tambah opsi `{ value: "receiptNumber", label: "No. Sales Receipt
      (opsional — isi sama untuk gabung jadi 1 penerimaan multi-faktur)" }`
      ke `ACCURATE_FIELDS`. Komentar di atasnya diperbarui, sebut
      eksplisit kapabilitas grouping Fase 49.
- [x] Backend TIDAK perlu diubah — dicek `sales-receipt-import.route.ts`
      § `VALID_FIELDS`, sudah otomatis derive dari
      `salesReceiptMapping.fieldToAccuratePath` (sudah include
      `receiptNumber` sejak Fase 49) — backend SUDAH menerima field ini,
      cuma UI-nya yang tidak pernah menawarkannya.
- [x] Typecheck 0 error, `bun test` apps/web 44 pass/0 fail (tidak ada
      test yang perlu diupdate).

## Referensi
- `docs/architecture/architecture-sales-receipt.md` § "Grouping
  Multi-Faktur (§ Fase 49, Revisi)" — desain backend yang sudah benar
  sejak awal, cuma belum ke-reflect penuh di frontend.
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.ts` — sumber
  kebenaran field yang sudah ada.

## Keputusan Kecil Selama Eksekusi
- **`components/sales-receipt/edit-row-dialog.tsx` TIDAK diubah** —
  dicek, komponen ini generic (render input dinamis dari
  `columnMapping` batch, bukan daftar field hardcode) jadi otomatis
  sudah bisa handle `receiptNumber` kalau field itu ada di mapping
  batch — cuma tidak dapat placeholder hint khusus (`FIELD_HINTS`),
  bukan bug, cuma UX kosmetik minor yang tidak masuk scope perbaikan
  ini.
- **Halaman "Detail per Baris" (`[batchId]/page.tsx`) TIDAK menampilkan
  kolom identifikasi grup** — dicatat sebagai gap terpisah (sama dengan
  Purchase Payment/Journal Voucher, ditemukan di audit sebelumnya),
  BUKAN bagian scope fase ini (user cuma minta perbaiki 2 gap yang
  disebutkan).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan, cuma nambah 1 opsi dropdown +
      perbaikan komentar, tidak ada logic/data flow baru.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- Halaman batch-detail Sales Receipt (dan Purchase Payment, Journal
  Voucher) masih belum punya kolom identifikasi grup di UI — gap UX
  yang sudah dicatat sebelumnya, belum masuk scope perbaikan manapun.

## Ringkasan Hasil
Field `receiptNumber` ("No. Sales Receipt") sekarang bisa di-mapping
manual lewat dropdown saat upload — sebelumnya cuma bisa lewat
auto-detect nama kolom yang PERSIS cocok. Komentar basi di kode
diperbarui supaya sesuai perilaku Fase 49. Backend tidak perlu diubah
(sudah benar sejak awal). `bun run typecheck` 0 error, `bun test`
apps/web 44 pass/0 fail.
