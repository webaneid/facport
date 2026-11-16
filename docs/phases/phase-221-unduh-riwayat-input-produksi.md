# Fase 221 — Unduh Riwayat Input Produksi ke Excel

**Status:** Done sisi kode 2026-11-17 (belum commit/rilis); cek visual browser + konfirmasi client menunggu
**Rencana induk:** `docs/phases/evaluasi-client-2026-11-16-rencana.md` (butir 3)

## Keputusan (user, 2026-11-17)
Pilih tanggal sendiri, maksimal 2 hari, berdasarkan tanggal produksi.

## Scope
- [x] `lib/autoproduksi-history-export.ts`: `parseHistoryExportRange`, baris/xlsx, waktu input zona perusahaan; 8 tes
- [x] Rute `GET /autoproduksi/production-entries/export` (422 rentang/skema, 422 `EXPORT_TOO_LARGE`, scope langganan); 3 tes rute (isi+filter, validasi, isolasi+401)
- [x] UI `HistoryExportButton` di Riwayat + `lib/history-export.ts`; 7 tes web
- [x] Typecheck api+web nol; eslint file baru lulus; data uji dev dibersihkan
- [ ] Cek visual di browser (pilih tanggal, unduh, buka xlsx); konfirmasi client "rentang 2 hari" sudah sesuai maksudnya
- [ ] Rilis atas permintaan eksplisit

## Keamanan
Skema `t.Object` + validasi tanggal nyata di server; `permission` + `moduleAccess`; query selalu dibatasi `subscription.id`; sel xlsx string (tanpa eksekusi rumus); batas baris mencegah beban berlebih.

## Di luar scope
Filter tambahan (status/formula), rentang >2 hari, ekspor Riwayat Import (arsip) — tanya client bila dibutuhkan.
