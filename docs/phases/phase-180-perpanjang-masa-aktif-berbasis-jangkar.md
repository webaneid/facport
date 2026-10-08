# Fase 180 — Ubah Masa Aktif: perpanjangan berbasis jangkar

**Status:** Done · **Mulai:** 2026-10-08 · **Selesai:** 2026-10-08 · ADR-0041

## Tujuan
Tombol cepat "+1 bulan / +3 bulan / +1 tahun" di dialog **Ubah Masa Aktif** (detail user) dulu hanya mengisi tanggal di klien, lalu menyimpannya lewat `PATCH` (tanggal persis) yang MENGHAPUS jangkar periode — di kasus akhir bulan tanggal bergeser (31 Jan → 28 Feb → 28 Mar), padahal perpanjangan lewat Kelola Langganan memakai jangkar (31 Jan → 28 Feb → 31 Mar). Sekarang tombol cepat memakai perpanjangan SERVER yang sama (jangkar terjaga).

## Scope
- [x] `computeRenewalEnd(..., periods)` — N periode sekaligus dari jangkar (murni, dipakai server & pratinjau web)
- [x] `renewSubscriptionInPlace` menerima `periods` (audit mencatat jumlah periode)
- [x] `POST /admin/subscriptions/:id/extend` `{ interval, periods }` (`subscriptions.manage`): hanya langganan non-trial, aktif, belum lewat `end_at`; mengembalikan akhir lama & baru
- [x] Dialog Ubah Masa Aktif: tombol cepat memakai jangkar (pratinjau = fungsi yang sama dengan server) dan Simpan memanggil `extend`; mengedit tanggal manual kembali ke `PATCH` (jangkar dikosongkan, sengaja)
- [x] Tes API (jangkar berantai tanpa geser, N periode, tahunan, tidak bisa untuk trial/habis/dibatalkan, riwayat, reminder direset) + tes dialog

## Keputusan
- Tanggal manual (`PATCH`) tetap mengosongkan jangkar — perilaku disengaja (ADR-0041 poin 3); hanya tombol cepat yang memakai jangkar.
- Langganan yang sudah habis tidak bisa diperpanjang di sini (aturan: habis → langganan baru lewat Assign, mulai dari saat itu).

## Ringkasan Hasil
`POST /admin/subscriptions/:id/extend` (izin `subscriptions.manage`), `computeRenewalEnd` menerima `periods`, `renewSubscriptionInPlace` menerima `periods` (audit mencatat). Dialog Ubah Masa Aktif: tombol cepat → pratinjau jangkar + Simpan memanggil `extend`; mengetik tanggal → PATCH. Tes: API 2077 lulus (+ extend ×4, periode ×3), web 386 lulus (+ dialog ×8). Typecheck, lint bersih.

## Known Limitations
- Satu baris riwayat perpanjangan untuk N periode (kolom `interval` = jenis periode; jumlah periode ada di audit log & selisih tanggal). Belum dilihat di browser.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual): endpoint baru digerbangi `subscriptions.manage`; `interval` union literal, `periods` integer 1–36, id uuid; row lock `FOR UPDATE`; menolak trial/habis/dibatalkan; tanpa raw SQL selain `FOR UPDATE` parameterized; audit tercatat
- [x] Temuan Medium/Low dicatat bila ditunda (tidak ada)
- [x] `docs/PROGRESS.md` diupdate
