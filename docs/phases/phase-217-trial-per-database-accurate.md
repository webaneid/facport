# Fase 217 — Trial satu kali per database Accurate + modul

**Status:** Done sisi API (UI admin menyusul; belum dirilis)

**Mulai:** 2026-11-10
**Selesai:** 2026-11-10

## Tujuan
Tutup celah trial berulang (Data Usaha/akun baru di database Accurate yang sama) dan kebocoran kuota akibat purge `import_batch_rows`, dengan buku besar permanen `trial_claims` per `(accurate_db_id, modul)`. Klaim terjadi saat import pertama. Keputusan: ADR-0054. Rancangan: `docs/architecture/architecture-trial-database-ledger.md`.

## Scope
- [x] Migrasi Drizzle `trial_claims` (+ indeks unik parsial) dan skema
- [x] `lib/trial-claims.ts` (klaim atomik, pelepasan, tambah `rows_used`) + tes unit/balapan
- [x] Integrasi di `checkTrialRowBudget` (confirm + retry) tanpa mengubah kontrak galat lama; galat baru `TRIAL_DATABASE_ALREADY_USED`, `TRIAL_SUBSCRIPTION_BOUND`, `TRIAL_DATABASE_NOT_SELECTED`
- [x] Worker: `rows_used` naik saat baris sukses (bukan dari `import_batch_rows`)
- [x] Guard awal di `POST /subscriptions/trial` (UX)
- [x] API: pengaturan `trial.exemptDbIds` (tervalidasi), `GET /admin/trial-claims`, `POST /admin/trial-claims/:id/release` (Super Admin, audit)
- [ ] UI admin untuk daftar klaim, lepas klaim, dan isi daftar pengecualian (belum; sementara lewat API)
- [x] Pesan galat UI di halaman import
- [x] Seeding dari langganan trial yang ada (±7 pasangan)
- [ ] Update `architecture-subscription.md` § Trial, lessons-learned (kebocoran kuota ditutup)
- [x] Typecheck, tes penuh + bersihkan DB dev, security review (tinjauan sendiri atas diff; bukan subagent)

## Di Luar Scope
Produk Konverter; kunci per perusahaan Accurate; deteksi pembuatan database baru di Accurate; perubahan alur "coba-coba dulu".

## Keputusan Kecil Selama Eksekusi
- Counter `rows_used` diselaraskan (`settleTrialUsage`, naik saja) di tiga titik: saat cek kuota, saat batch selesai (worker), dan sebelum purge retensi. Tidak perlu menyentuh ±100 titik penulisan baris sukses. Pemakaian = yang terbesar antara counter dan hitungan langsung `import_batch_rows` (tahan bila nama modul batch beda dari paket).
- Tanpa `accurate_db_id` pada Data Usaha, akun internal, atau database dikecualikan: aturan lama per-langganan (tanpa klaim).
- `checkTrialRowBudget` mengembalikan `status`+`body` siap kirim; 50 rute import dipasang ulang dengan satu pola (kuota habis tetap 400 `TRIAL_ROW_LIMIT_EXCEEDED`, bentrok database 409).

## Keputusan yang Menunggu User
1. ~~Isi daftar pengecualian awal~~ — SELESAI: daftar awal kosong (id 2672480 ternyata satu perusahaan dengan 49 akun cabang berbayar; lima id lain akun internal FAC). Akun internal dilewati buku besar (verifikasi penanda internal saat eksekusi).
2. Rilis bersama Fase 216 (v2.50.0) atau terpisah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review dijalankan (tinjauan sendiri: galat tanpa identitas akun lain, lepas klaim `users.manage` + alasan + audit, SQL berparameter, klaim butuh akses nyata ke database lewat OAuth)
- [x] Temuan Critical/High diperbaiki (tidak ada)
- [x] Temuan Medium/Low dicatat di lessons-learned bila ditunda (lessons-learned 2026-11-10)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
Lihat `architecture-trial-database-ledger.md` § 9.

## Ringkasan Hasil
Buku besar `trial_claims` aktif: trial 1x per (database Accurate, modul) lintas akun/Data Usaha, klaim saat import pertama, kuota dari counter permanen yang disinkronkan sebelum baris hilang. API admin daftar klaim + lepas klaim, pengaturan pengecualian (awal kosong), pesan UI baru. Tes baru: 10 (buku besar) + 2 (rute admin) + 1 (web); suite penuh API 2777 lolos, web 610 lolos, typecheck nol. Belum: UI admin (daftar klaim, lepas klaim, isi pengecualian), uji manual browser, rilis (bersama Fase 216 sebagai v2.50.0, ada MIGRASI 0053 yang menyeed klaim dari langganan trial yang ada).

## Known Limitations (tambahan)
- Pelanggan yang membuat database baru di Accurate mendapat trial baru (disengaja).
- Penyalahgunaan lewat akses ke database orang lain: klaim dilepas admin bila salah.
