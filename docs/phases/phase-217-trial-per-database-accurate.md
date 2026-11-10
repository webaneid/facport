# Fase 217 — Trial satu kali per database Accurate + modul

**Status:** Planned (menunggu persetujuan rencana)
**Mulai:** —
**Selesai:** —

## Tujuan
Tutup celah trial berulang (Data Usaha/akun baru di database Accurate yang sama) dan kebocoran kuota akibat purge `import_batch_rows`, dengan buku besar permanen `trial_claims` per `(accurate_db_id, modul)`. Klaim terjadi saat import pertama. Keputusan: ADR-0054. Rancangan: `docs/architecture/architecture-trial-database-ledger.md`.

## Scope
- [ ] Migrasi Drizzle `trial_claims` (+ indeks unik parsial) dan skema
- [ ] `lib/trial-claims.ts` (klaim atomik, pelepasan, tambah `rows_used`) + tes unit/balapan
- [ ] Integrasi di `checkTrialRowBudget` (confirm + retry) tanpa mengubah kontrak galat lama; galat baru `TRIAL_DATABASE_ALREADY_USED`, `TRIAL_SUBSCRIPTION_BOUND`, `TRIAL_DATABASE_NOT_SELECTED`
- [ ] Worker: `rows_used` naik saat baris sukses (bukan dari `import_batch_rows`)
- [ ] Guard awal di `POST /subscriptions/trial` (UX)
- [ ] Pengaturan admin `trial.exemptDbIds` + daftar klaim + aksi "Lepas klaim trial" (Super Admin, audit)
- [ ] Pesan galat UI di halaman import
- [ ] Seeding dari langganan trial yang ada (±7 pasangan)
- [ ] Update `architecture-subscription.md` § Trial, lessons-learned (kebocoran kuota ditutup)
- [ ] Typecheck, tes penuh + bersihkan DB dev, security review

## Di Luar Scope
Produk Konverter; kunci per perusahaan Accurate; deteksi pembuatan database baru di Accurate; perubahan alur "coba-coba dulu".

## Keputusan yang Menunggu User
1. Isi daftar pengecualian awal (dugaan: database contoh "A1 CV AMANDA" id 2672480 dipakai 49 akun; id kelas pelatihan 30665xx–30682xx) — perlu konfirmasi sebelum rilis.
2. Rilis bersama Fase 216 (v2.50.0) atau terpisah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error
- [ ] Security review dijalankan
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat di lessons-learned bila ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
Lihat `architecture-trial-database-ledger.md` § 9.

## Ringkasan Hasil (isi pas fase Done)
