# Fase 07 — Tampilkan Nomor Faktur di Detail Hasil Import

**Status:** Done
**Mulai:** 2026-08-28
**Selesai:** 2026-08-28

## Tujuan
Feedback client pasca-presentasi (2026-08-27): "log berdasarkan nomor
invoice/nomor transaksi" — awalnya disangka minta fitur PENCARIAN lintas
semua batch (draf awal fase ini), setelah klarifikasi ke user (2026-08-28)
ternyata maksudnya lebih sederhana: di halaman **detail hasil import per
batch** yang SUDAH ADA (`app/(protected)/purchase-invoice/import/[batchId]/page.tsx`),
tabel "Detail per Baris" cuma nunjukin nomor baris Excel (1, 2, 3, ...) dan
ID transaksi Accurate (angka internal, mis. `102350`) — **TIDAK ADA nomor
faktur/Bill No yang sebenarnya user isi di Excel**, jadi susah dicocokkan
manual "baris mana ini di dunia nyata".

Data yang dibutuhkan **SUDAH tersedia** di response API (`rows[].rawData`,
lihat § Scope) — ini murni gap tampilan, bukan gap data. Jauh lebih kecil
dari draf awal fase ini (yang sempat mengasumsikan perlu endpoint
pencarian baru lintas batch — TIDAK jadi dikerjakan, lihat § Keputusan
Kecil).

## Scope
- [ ] `app/(protected)/purchase-invoice/import/[batchId]/page.tsx` —
      tambah kolom **"Nomor Faktur"** di tabel "Detail per Baris", diambil
      dari `row.rawData[kolomExcelYangMapToBillNumber]`. Kolom Excel yang
      dimaksud ditentukan dari `batch.columnMapping` (invert mapping:
      cari `excelColumn` yang value-nya `"billNumber"`).
  - Kalau kolom Bill No tidak di-mapping user (opsional, boleh kosong) →
    tampilkan fallback yang masuk akal (mis. "-" atau nomor baris seperti
    sekarang), JANGAN error.
- [ ] **Urutan tabel** (permintaan user 2026-08-28): baris diurutkan
      berdasarkan **nomor faktur** (bukan nomor baris Excel seperti
      sekarang) — pakai natural sort (angka di dalam string diurutkan
      numerik, bukan leksikal — "PI2" < "PI10") supaya gampang di-scan.
      Baris tanpa nomor faktur (kolom Bill No kosong) taruh di akhir,
      urutkan pakai nomor baris sebagai fallback. Baris dengan nomor
      faktur SAMA (grup multi-item setelah Fase 06) otomatis nempel
      berurutan lewat sort ini juga — efek samping yang diinginkan.
- [ ] Setelah Fase 06 (multi-item) selesai: pastikan kolom ini tetap benar
      untuk baris yang di-GROUP (semua baris 1 grup akan nunjukin Bill No
      yang sama — itu memang benar/diharapkan, bukan bug).
- [ ] (Opsional, cek relevansi setelah lihat hasil di atas) — kolom sama
      juga ditambahkan di halaman Riwayat Import Terakhir (dashboard,
      `app/(protected)/page.tsx`) kalau di situ juga cuma nunjukin nama
      file tanpa nomor faktur.

## Referensi
- Endpoint yang sudah punya data (tidak perlu diubah):
  `GET /purchase-invoice/import/:batchId` (`apps/api/src/routes/purchase-invoice-import.route.ts`)
  — `return { batch, summary, rows }`, `rows` sudah full row termasuk
  `rawData` dan `batch` sudah termasuk `columnMapping`.
- Fase terkait: `docs/phases/phase-06-purchase-invoice-multi-item.md`
  (dikerjakan duluan — lihat kenapa di § Tujuan)

## Keputusan Kecil Selama Eksekusi
- **2026-08-28**: draf awal fase ini (endpoint pencarian baru lintas
  SEMUA batch berdasarkan nomor faktur) DIBATALKAN setelah klarifikasi
  langsung ke user — yang dimaksud cukup nampilin nomor faktur di halaman
  detail batch yang sudah ada. Kalau nanti user benar-benar butuh
  pencarian lintas-batch juga, itu scope terpisah (fase baru sendiri,
  bukan reopen fase ini).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Kalau kolom Bill No tidak di-mapping user (opsional), kolom "Nomor
  Faktur" tampil "-" untuk semua baris, dan urutan otomatis jatuh ke
  fallback nomor baris Excel (sama seperti behavior sebelum fase ini).
- Ditemukan (bukan bug fase ini, technical debt existing): ESLint rule
  `react-hooks/set-state-in-effect` gagal di file ini DAN minimal 2 file
  lain dengan pola sama (`app/accurate/page.tsx`,
  `vendor/payable-account/import/[batchId]/page.tsx`) — pola
  `useEffect(() => { load(); ... }, [])` (fetch data awal + polling
  interval) sudah ada SEBELUM fase ini (dikonfirmasi: 8 error lint yang
  sama persis muncul di `git stash` / kondisi bersih sebelum perubahan
  fase ini). Di luar scope Fase 07 buat diperbaiki (butuh pola berbeda,
  mis. state library atau refactor jadi custom hook, lintas banyak file)
  — dicatat di sini + `docs/lessons-learned.md`.

## Ringkasan Hasil (isi pas fase Done)
Tabel "Detail per Baris" di halaman hasil import Purchase Invoice sekarang
punya kolom **Nomor Faktur** (diambil dari kolom Excel yang di-mapping ke
`billNumber`, lewat invert `columnMapping`) dan diurutkan berdasarkan
nomor faktur itu (natural sort — angka di dalam string diurutkan numerik,
bukan leksikal), bukan lagi nomor baris Excel mentah. Baris tanpa nomor
faktur tetap tampil, ditaruh di akhir dengan fallback urut nomor baris.

Perubahan murni frontend, 1 file — data (`rawData`, `columnMapping`) sudah
tersedia di response API sejak Fase 02, cuma belum pernah dipakai. Tidak
ada perubahan backend/skema DB. Typecheck 0 error, build lokal sukses
(`bun run build`), security review 0 temuan.

**Klarifikasi penting**: draf awal fase ini (endpoint pencarian nomor
faktur lintas SEMUA batch) DIBATALKAN setelah klarifikasi langsung ke user
2026-08-28 — kebutuhan sebenarnya jauh lebih sempit (tampilan 1 halaman
detail batch yang sudah ada). Kalau pencarian lintas-batch benar-benar
dibutuhkan nanti, itu scope fase terpisah, bukan bagian dari fase ini.
