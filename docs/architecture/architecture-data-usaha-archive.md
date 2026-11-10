# Architecture — Hapus & Arsip Data Usaha oleh Pemilik (Fase 218)

> Status: **RENCANA** (2026-11-10, menunggu persetujuan). Keputusan: ADR-0055. Fase: `docs/phases/phase-218-arsip-hapus-data-usaha.md`.
> Halaman: `app.<domain>/pilih-usaha`. Terkait: `architecture-user-tambahan.md`, `architecture-account-lifecycle.md`, `architecture-trial-database-ledger.md`.

## 1. Kondisi sekarang (diverifikasi ke kode 2026-11-10)
| Kemampuan | Ada? |
|---|---|
| Buat / ganti nama Data Usaha oleh pemilik | Ya (`POST/PATCH /me/data-usaha`) |
| Hapus Data Usaha oleh pemilik | **Tidak** |
| Hapus Data Usaha kosong | Hanya lewat hapus permanen akun oleh Super Admin (`lib/account-erasure-db.ts`, `emptyDataUsaha`) |
| Putus koneksi Accurate | Hanya admin (`POST /admin/data-usaha/:id/disconnect-accurate`) |
Rujukan ke `data_usaha.id` (tanpa cascade): `subscriptions`, `orders`, `member_seats`, `ownership_transfers`, `conversion_logs`, dan 4 tabel AutoProduksi. `ownsDataUsaha` / `hasAccessToDataUsaha` (`lib/data-usaha.ts`) dipakai terpusat oleh rute modul.

## 2. Model data
Migrasi: `data_usaha.archived_at timestamptz NULL`. Tidak ada tabel baru; pelaku dicatat di `audit_logs`.

## 3. Aturan
| Aturan | Hapus (kosong) | Arsip | Pulihkan |
|---|---|---|---|
| Hanya pemilik SAAT INI (bukan member seat) | ya | ya | ya |
| Konfirmasi ketik nama Data Usaha (dicek server) | ya | ya | tidak perlu |
| Syarat | tidak ada baris yang merujuk di tabel mana pun (FK dari katalog, fail-closed) DAN hitungan import 0 | tidak ada: langganan aktif, pesanan/invoice belum selesai, transfer kepemilikan tertunda, import berjalan, User Tambahan aktif | sedang diarsipkan |
| Kode galat | `NOT_EMPTY` (+ saran arsip) | `HAS_BLOCKERS` + daftar penghalang | `NOT_ARCHIVED` |
| Audit | `delete` | `archive` | `restore` |
| Pembatasan laju | per IP, ember tersendiri | sama | sama |
| Klaim trial (ADR-0054) | tidak dilepas | tidak dilepas | - |

Pelaksanaan dalam SATU transaksi: kunci baris Data Usaha (`FOR UPDATE`), periksa ulang syarat, **putus Accurate** (§ 3a), lalu tulis (arsip: `archived_at`; hapus: buang baris).

### 3a. Putus Accurate (arsip dan hapus, wajib)
Dalam transaksi yang sama: kosongkan `accurate_connection_id`, `accurate_db_id`, `accurate_db_alias`, `accurate_db_confirmed_at`; bila koneksi akun Accurate itu tidak lagi dirujuk Data Usaha mana pun, cabut koneksinya (token dibuang, pola `admin/data-usaha.route.ts`); catat peristiwa riwayat Data Usaha (alasan: diarsipkan/dihapus pemilik). Penghalang "import berjalan" melindungi dari token dicabut di tengah batch.

## 4. Endpoint (`routes/me.route.ts`)
| Endpoint | Fungsi |
|---|---|
| `GET /me/data-usaha/:id/lifecycle` | Pratinjau: `mode: "delete" \| "archive" \| "blocked"` + daftar penghalang. Tidak menulis. |
| `POST /me/data-usaha/:id/delete` `{confirm}` | Hapus permanen (hanya kosong). |
| `POST /me/data-usaha/:id/archive` `{confirm}` | Arsipkan. |
| `POST /me/data-usaha/:id/restore` | Pulihkan. |
| `GET /me/data-usaha?archived=1` | Daftar terarsip milik pemilik (untuk Pulihkan). Daftar biasa mengecualikan yang diarsipkan. |

## 4a. Pulihkan
Menghapus `archived_at` saja. Data Usaha kembali tanpa koneksi Accurate; pelanggan menghubungkan lagi. Ditolak bila masa simpan sudah lewat dan data sudah dibersihkan (`ARCHIVE_EXPIRED`).

## 5. Dampak lintas sistem (WAJIB dicek saat eksekusi)
- `ownsDataUsaha`, `hasAccessToDataUsaha`, `memberAccessibleDataUsahaIds`, `getOrCreateDefaultDataUsaha`: kecualikan `archived_at IS NOT NULL` (yang terakhir: jangan membuat ulang "Data Usaha Utama" bila hanya yang terarsip yang ada, atau pulihkan; diputuskan saat eksekusi).
- Karena arsip memutus Accurate, database yang dilepas bebas dipakai Data Usaha lain; tidak ada bentrok dengan `data_usaha_connection_db_uidx`.
- Admin: daftar Data Usaha/insight tetap melihat yang terarsip dengan penanda "Diarsipkan" (laporan hitungan perlu dicek: arsip tidak dihitung aktif).
- Job terjadwal (kedaluwarsa, pengingat perpanjangan): tidak terpengaruh karena arsip mensyaratkan tidak ada langganan aktif.

## 6. UI (`/pilih-usaha`)
Menu aksi per kartu (pemilik saja): Ubah nama, Hapus atau Arsipkan (label mengikuti `mode` dari pratinjau), dialog: penghalang bila ada, ketik nama untuk konfirmasi. Bagian "Diarsipkan (n)" yang bisa dibuka, dengan tombol Pulihkan.

## 7. Pengujian
Unit aturan klasifikasi; rute: bukan pemilik 404, member seat ditolak, tiap penghalang, `NOT_EMPTY`, konfirmasi salah, atomik/balapan, pulihkan, daftar tidak memuat terarsip, modul menolak Data Usaha terarsip, audit. Web: dialog dan keadaan. Wajib typecheck nol dan audit keamanan (otorisasi, IDOR).

## 8. Known Limitations (disengaja)
Catatan keuangan (invoice, pesanan, langganan) tidak pernah dihapus; aksi admin atas nama pelanggan di luar cakupan.

## 9. Pembersihan setelah 30 hari (usulan, menunggu konfirmasi final user)
Job harian (pg-boss) untuk Data Usaha dengan `archived_at` > 30 hari.

**Dibuang:** data AutoProduksi milik Data Usaha itu (formula/produksi), sisa riwayat import (kuota trial dipindah ke counter permanen dulu lewat `settleTrialUsage`), seat yang sudah dicabut.

**TIDAK PERNAH dihapus:**
- Invoice, pesanan, langganan (catatan keuangan FAC; laporan pendapatan dan Insight bergantung padanya lewat `subscriptions`/`orders`).
- `conversion_logs`: dipakai menghitung kuota trial Konverter (`checkAndRecordConversionRowBudget`) dan hitungan penggunaan; menghapusnya mereset kuota trial.
- Audit log, klaim trial (`trial_claims`), counter permanen `data_usaha.cumulative_successful_row_count`.
- Data akuntansi pelanggan di Accurate (kita hanya memutus koneksi, tidak pernah menulis ke sana saat arsip).

**Baris `data_usaha`:** dihapus bila setelah pembersihan tidak ada yang merujuk; bila masih ada catatan di atas, dipertahankan sebagai cangkang tersembunyi (tanpa koneksi, tanpa data operasional). Pulihkan tidak mungkin setelah dibersihkan. Audit dicatat.
