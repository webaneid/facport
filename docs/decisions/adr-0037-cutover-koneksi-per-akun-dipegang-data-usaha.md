# ADR-0037: Cutover Langsung ke Koneksi 1-per-Akun yang Dipegang Data Usaha

**Status:** Accepted
**Tanggal:** 2026-09-22
**Menggantikan sebagian:** ADR-0020 (koneksi reusable lintas subscription, endpoint `reuse`, pointer
`subscriptions.accurateConnectionId`). Melaksanakan ADR-0036 #1, #3, #5, #6.

## Context
ADR-0036 menetapkan 1 koneksi per akun Accurate (terbukti Fase 141: otorisasi baru mematikan token lama).
Yang belum ditetapkan: cara pindah dari 59 koneksi lama (9 customer, sebagian sudah mati) dan bentuk data.
Data production (P2c Fase 141): 20 dari 29 subscription aktif koneksinya sudah tertimpa; identitas akun
Accurate baris lama TIDAK tersimpan (`accurate_user_id` NULL), jadi koneksi lama tak bisa dikelompokkan per akun
tanpa memanggil Accurate dengan token customer.

## Decision
1. **Cutover langsung** (keputusan user 2026-09-22, dipilih di atas dual-read): semua jalur runtime (worker,
   cek scope, gerbang, status) hanya memakai model baru. Koneksi lama (`accurate_user_id IS NULL`) tidak dibaca
   lagi; customer "hubungkan ulang" sekali. Baris lama TIDAK dihapus (dibersihkan Fase 145).
2. **Data Usaha memegang koneksi:** `data_usaha.accurate_connection_id` = pointer ke koneksi akun (UNIQUE dilepas,
   banyak Data Usaha boleh berbagi). `data_usaha.accurate_db_id/accurate_db_alias` = database Accurate yang dipakai.
   `subscriptions.accurate_connection_id` dibekukan.
3. **Invarian di DB:** indeks unik parsial `accurate_connections(accurate_user_id)` (1 akun = 1 baris = 1 pemilik
   Facport) dan `data_usaha(accurate_connection_id, accurate_db_id)` (1 database ↔ 1 Data Usaha).
4. **Callback OAuth = upsert** berkunci `token.user.id`. Akun milik owner lain → ditolak (`accurate_account_in_use`).
5. **Database tidak bisa diganti** setelah dipilih (pertahankan `DATABASE_ALREADY_SELECTED`): riwayat import Data
   Usaha itu terikat ke database tersebut.
6. **Transfer kepemilikan** mengosongkan pointer koneksi Data Usaha (database terakhir diketahui dipertahankan);
   owner baru menghubungkan ulang dengan akunnya. Berlaku di jalur user (`lib/ownership-transfer.ts`) dan admin.
7. **Backfill migrasi** hanya menyalin "database terakhir diketahui" dari koneksi lama ke `data_usaha.accurate_db_*`
   (deterministik, tanpa panggilan Accurate); pointer koneksi TIDAK di-backfill. UI wajib meminta konfirmasi
   database saat customer menghubungkan ulang (Fase 144) karena pemetaan lama bisa keliru untuk customer multi-Data-Usaha.
8. **Refresh aman-rotasi** (ADR-0036 #5): kunci baris per koneksi, hanya `invalid_grant` yang menandai `expired`,
   job melewati koneksi yang sedang dipakai batch import/cancel.

9. **Pakai koneksi akun yang ada tanpa OAuth ulang** (`GET /accurate/accounts`, `POST /accurate/attach`, ditambahkan saat E2E):
   OAuth ulang untuk akun yang sama mematikan token lama seketika (Fase 141 E2), sehingga import Data Usaha LAIN yang sedang
   berjalan bisa 401 di tengah batch. Data Usaha kedua dari akun yang sama karena itu cukup MENUNJUK koneksi yang ada (owner-only,
   koneksi harus milik user, aktif, berakun) lalu memilih database sendiri. `reuse` lama tetap dihapus.
10. **Callback OAuth terikat ke sesi login pemulai flow** (audit keamanan, HIGH — login CSRF/account-linking): tanpa ini penyerang
    bisa menyodorkan `authorizeUrl`-nya ke korban dan menyambungkan akun Accurate korban ke Data Usaha penyerang. Diperiksa
    SEBELUM tukar kode. Worker menandai koneksi `expired` HANYA untuk HTTP 401 (bukan jaringan/5xx/penolakan logis).

## Consequences
- Customer yang koneksinya masih hidup ikut terputus saat rilis → 143 dirilis BERSAMA UI 144 dan setelah customer
  diberi tahu; sebelum itu tetap di `develop`.
- Endpoint `POST /accurate/reuse` dihapus (berbagi otomatis per akun). `connect` menerima `dataUsahaId`
  (adaptor kompat menerima `subscriptionId` sampai 144).
- Butuh backup DB sebelum deploy (skema + backfill) dan runbook deploy Full.

## Alternatives Considered
- **Dual-read bertahap** (rekomendasi awal): customer lama tetap jalan sampai hubungkan ulang, tapi menyimpan dua
  jalur baca dan menunda pembersihan; ditolak user demi model tunggal yang bersih.
- **Carry-over otomatis koneksi hidup:** butuh memanggil Accurate dengan token customer untuk mengenali akun; ditunda
  sebagai opsi Fase 145 (health check) — bukan syarat rilis 143.
