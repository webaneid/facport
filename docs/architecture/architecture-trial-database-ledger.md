# Architecture — Buku Besar Trial per Database Accurate + Modul (Fase 217)

> Status: **DIIMPLEMENTASI di sisi API** (2026-11-10); UI admin menyusul. Keputusan: ADR-0054. Fase: `docs/phases/phase-217-trial-per-database-accurate.md`.
> Aturan trial yang berlaku sekarang: `architecture-subscription.md` § "Trial (Batas Baris)".

## 1. Kondisi sekarang (diverifikasi ke kode & produksi 2026-11-10)
| Aspek | Sekarang |
|---|---|
| Guard "sudah pernah trial" | `subscriptions.route.ts` (~baris 279): `userId + dataUsahaId + modul` → `TRIAL_ALREADY_USED` |
| Trial tanpa koneksi Accurate | Boleh (sengaja, Fase 109) |
| Kuota 100 baris (`trial.maxRows`) | `checkTrialRowBudget` (`lib/trial.ts`) menghitung `import_batch_rows` status success per langganan, dipanggil ±86 titik rute import (confirm + retry) |
| Kebocoran kuota | Baris dipurge ±2 hari → pemakaian lama hilang → kuota bisa dipakai ulang |
| Produk Konverter | `checkAndRecordConversionRowBudget` (tanpa database Accurate) — di luar cakupan |

Data produksi: 32 trial seumur hidup (25 expired, 6 cancelled, 1 active), 13 akun; `accurate_db_id` konsisten (0 id dengan alias berbeda); 20 id dipakai >1 Data Usaha. Diperiksa: satu id = 49 akun cabang satu perusahaan pelanggan berbayar (0 trial); lima id = tiga akun yang tampak internal FAC. Tidak ada database contoh bersama yang perlu dikecualikan.

## 2. Model data (migrasi baru)
`trial_claims`:
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid pk | |
| accurate_db_id | varchar(100) not null | kunci |
| module | varchar(50) not null | satu baris per modul dalam paket |
| subscription_id | uuid | langganan trial pemegang klaim; tanpa cascade hapus (jejak permanen) |
| user_id, data_usaha_id | text / uuid | informasi saja (jejak), tanpa cascade |
| rows_used | integer not null default 0 | counter permanen baris sukses |
| claimed_at | timestamptz default now | |
| released_at, released_by, release_reason | nullable | pelepasan oleh admin (klaim tidak dihapus, hanya ditandai) |
Indeks unik parsial `(accurate_db_id, module) WHERE released_at IS NULL`. Indeks `subscription_id`.

> Catatan: kolom rujukan sengaja tanpa FK cascade; hapus permanen akun/Data Usaha tidak boleh menghapus jejak trial.

## 3. Alur klaim (di `checkTrialRowBudget`, titik confirm dan retry)
1. Langganan bukan trial → lolos, tanpa buku besar.
2. Ambil `accurate_db_id` dari Data Usaha langganan. Belum ada → tolak `TRIAL_DATABASE_NOT_SELECTED` (import memang butuh database).
3. Database ada di `trial.exemptDbIds` → hitung kuota seperti sekarang (per langganan), tanpa klaim.
4. Untuk tiap modul dalam paket: `INSERT ... ON CONFLICT (accurate_db_id, module) WHERE released_at IS NULL DO NOTHING`, lalu baca pemilik klaim.
   - Pemilik = langganan ini → lanjut.
   - Pemilik = langganan lain → `409 TRIAL_DATABASE_ALREADY_USED`.
5. Langganan ini sudah memegang klaim di database LAIN untuk modul yang sama → `409 TRIAL_SUBSCRIPTION_BOUND` (satu langganan, satu database).
6. Kuota: `rows_used + additionalRows ≤ trial.maxRows`, selain itu `TRIAL_ROW_LIMIT_EXCEEDED` (kontrak galat lama tetap).
7. `rows_used` dinaikkan atomik (`UPDATE ... SET rows_used = rows_used + n`) saat worker menandai baris sukses, bukan saat confirm.

## 4. Pembuatan trial (`POST /subscriptions/trial`)
Guard lama dipertahankan. Tambahan: bila Data Usaha sudah punya database terpilih dan `(db, modul)` sudah diklaim langganan lain, tolak lebih awal dengan pesan yang sama (UX, bukan satu-satunya lapis).

## 5. Admin
- Pengaturan `trial.exemptDbIds` (daftar id database, kartu "Pengaturan Trial").
- Aksi "Lepas klaim trial" di detail Data Usaha/langganan: Super Admin, konfirmasi, alasan wajib, audit, tidak menghapus baris.
- Daftar klaim (database, modul, pemilik, baris terpakai) untuk melihat kasus pelanggan.

## 6. Pesan UI
`TRIAL_DATABASE_ALREADY_USED`: "Database Accurate ini sudah pernah dicoba untuk modul ini. Silakan berlangganan untuk melanjutkan." (tanpa membuka identitas akun lain).

## 7. Data lama (seeding sekali, di migrasi/skrip)
Dari langganan `is_trial = true` yang Data Usaha-nya punya `accurate_db_id`: satu klaim per modul paket, `rows_used = 0` (tidak diketahui). Pasangan ganda (>1 langganan, db+modul sama) → klaim ke langganan tertua. Diperkirakan ±7 baris.

## 8. Pengujian
- Klaim pertama berhasil; langganan lain, akun lain, Data Usaha lain di database sama ditolak.
- Balapan dua langganan mengklaim bersamaan: tepat satu menang.
- Pengecualian: tidak mengklaim, kuota per langganan.
- Langganan terikat satu database; pelepasan klaim membuka kembali; berbayar tidak terpengaruh.
- `rows_used` tidak bergantung pada purge `import_batch_rows`.
- Retry: pemilik klaim yang sama tetap lolos.
- Wajib: `bun run typecheck` nol, tes API penuh + pembersihan DB dev, audit keamanan (skill `security-review`).

## 9. Known Limitations (disengaja)
- Database baru di Accurate = trial baru.
- Perubahan alias database tidak berpengaruh (kunci = id).
- Trial yang dibuat lalu tidak pernah mengimpor tidak memegang klaim (sengaja: klaim saat import pertama).

## 10. Implementasi (catatan)
- `lib/trial-claims.ts`: `ensureTrialClaims`, `settleTrialUsage`, `releaseTrialClaim`, `findForeignTrialClaim`, `getExemptDbIds`. `checkTrialRowBudget` (`lib/trial.ts`) memanggil `ensureTrialClaims` lalu menghitung kuota dari yang terbesar antara counter permanen dan baris live.
- `settleTrialUsage` dipanggil di cek kuota, akhir batch (worker), dan sebelum purge retensi; naik saja (GREATEST), idempoten.
- Admin: `GET /admin/trial-claims` (`users.view`), `POST /admin/trial-claims/:id/release` (`users.manage`). Pengaturan `trial.exemptDbIds` divalidasi di `PUT /settings`.
- Migrasi `0053_trial_claims.sql` membuat tabel dan mengisi klaim awal dari langganan trial yang ada.
