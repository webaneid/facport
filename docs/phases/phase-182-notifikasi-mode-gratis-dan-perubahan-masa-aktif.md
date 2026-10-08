# Fase 182 — Notifikasi untuk mode Gratis & perubahan masa aktif oleh admin
**Status:** Done (menunggu verifikasi manual pemilik sebelum rilis) · **Mulai/Selesai:** 2026-10-08

## Tujuan
Tidak ada perubahan masa aktif yang diam-diam: pemberian paket tanpa invoice (mode Gratis) dan perubahan masa aktif oleh admin selalu memberi tahu pelanggan.

## Keputusan
- **Selalu diberi tahu**, juga saat masa aktif dipersingkat (judul/isi berbeda: "diperpanjang" / "diubah" / "dipersingkat" / "Paket diberikan").
- Penerima = pemilik Data Usaha SAAT INI (bukan pembeli awal); in-app (tipe `subscription_changed_by_admin` → `/subscribe`) + email; isi: paket, Data Usaha, tanggal lama → baru.
- Best-effort pasca-commit (`lib/subscription-change-notice.ts`): galat dicatat, tidak menggagalkan aksi admin; permintaan yang ditolak tidak memberi notifikasi.

## Scope (selesai)
`POST /admin/subscriptions` (grant/perpanjang), `POST /bulk` mode `free`, `PATCH /:id` (tanggal manual), `POST /:id/extend`. Mode `invoice`/`paid_invoice` tidak memakai notifikasi ini (sudah ada invoice).

## Ringkasan Hasil
Helper baru + tipe notifikasi + 4 titik panggil + rute web. Tes: API 2108 lulus (+4 tes baru), web 397 lulus; typecheck & lint nol. Security review inline (≤3 file, tanpa endpoint baru): penerima dari DB bukan input, email di-escape, tanpa kebocoran data.

## Known Limitations
- "Tambah User" mode Gratis (akun baru) tidak mengirim notifikasi ini — pemilik akun baru menerima email undangan/akun sendiri.
- Notifikasi per paket pada bulk (bukan satu ringkasan).
