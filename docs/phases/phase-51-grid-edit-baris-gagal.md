# Fase 51 — Grid Edit ala Excel untuk Baris Gagal Import (Bulk Edit)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Tambah opsi KEDUA untuk perbaiki baris gagal import: grid/tabel editable ala Excel yang di-render langsung di halaman web (bukan file eksternal), untuk kasus banyak baris gagal sekaligus. Dialog per-baris yang sudah ada (2026-08-28) TETAP ADA, tidak digantikan — user pilih sesuai kebutuhan.

Rencana lengkap: `/Users/webane/.claude/plans/sorted-inventing-volcano.md`.

## Scope
- [x] Endpoint bulk baru `PUT /{module}/import/:batchId/rows` di 6 route (purchase-invoice, sales-invoice, purchase-payment, sales-receipt, journal-voucher, vendor-payable-account)
- [x] Komponen baru `apps/web/components/import/editable-grid.tsx` (generic, dipakai 6 halaman)
- [x] Wiring toggle "Edit Semua (Tabel)" di 6 halaman hasil import
- [x] Test route baru (extend 4 file `.route.test.ts` yang sudah punya test edit-row; purchase-invoice/sales-invoice belum punya test edit-row sama sekali sejak awal — gap pre-existing, di luar scope)
- [x] Responsif — scroll horizontal saat layar sempit (ditekankan user, reuse pola `w-full overflow-x-auto`)

## Referensi
- Plan mode file (analisis lengkap): `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- Fitur dasar yang di-reuse: Edit Baris Gagal per-baris, `docs/PROGRESS.md` 2026-08-28

## Keputusan Kecil Selama Eksekusi
- Bulk save TIDAK auto-trigger retry — user tetap klik "Retry baris gagal" terpisah (konsisten UX dengan edit per-baris).
- Grid pakai `<table>` HTML + `<input>` per sel (bukan library grid baru) — cukup untuk kebutuhan, hindari dependency baru.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — api+web)
- [x] Security review dijalankan (inline — lihat ringkasan di bawah)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan
- [x] Temuan Medium/Low dicatat — 1 temuan Low (body.rows tanpa limit eksplisit, diterima, endpoint tetap di balik auth+subscription-gate)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Dialog per-baris `journal-voucher/edit-row-dialog.tsx` BELUM di-update untuk format panjang (Opsi B, Fase 50) — gap PRE-EXISTING (dialog dibuat sebelum Fase 50), di luar scope Fase 51. Grid ala Excel SUDAH benar untuk kedua format (deteksi sendiri di `page.tsx`), jadi user tetap punya jalur yang benar (grid) untuk edit jurnal format panjang — dialog per-baris cukup dipakai untuk format lebar saja untuk sementara.
- Purchase Invoice & Sales Invoice tidak punya test rute untuk edit-row (baik versi lama per-baris maupun bulk baru) — gap pre-existing sejak endpoint per-baris dibuat, TIDAK diperbaiki di fase ini (di luar scope, cukup dicatat).
- `body.rows` di endpoint bulk tidak dibatasi jumlah maksimal eksplisit (lihat security review).

## Ringkasan Hasil
Ditambah opsi kedua untuk perbaiki baris gagal import: grid/tabel
editable ala Excel (`components/import/editable-grid.tsx`, 1 komponen
generic dipakai 6 halaman hasil import), sebagai TAMBAHAN dari dialog
per-baris yang sudah ada (tidak digantikan). Backend dapat endpoint
bulk baru `PUT /{module}/import/:batchId/rows` di 6 modul — baris yang
lolos validasi tersimpan (`pending`), baris yang masih bermasalah
dicatat di `errors[]` per-baris tanpa menggagalkan baris lain dalam
request yang sama. Grid responsif (scroll horizontal, reuse pola
`overflow-x-auto` yang sudah standar di `components/ui/table.tsx`),
highlight sel merah untuk kolom wajib kosong, tombol "Simpan Semua
Perubahan" satu kali untuk semua baris. TIDAK auto-trigger retry —
user tetap klik "Retry baris gagal" terpisah, konsisten dengan UX edit
per-baris yang sudah ada.

Full test suite `apps/api`: 412 pass, 0 fail (naik dari 399, 13 test
baru). Typecheck 0 error (api+web), lint 0 error. Security review
inline: 1 temuan Low (diterima).
