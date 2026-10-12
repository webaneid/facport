# Arsitektur — Siklus Hidup Akun (Fase 189H)

Aksi Super Admin (`users.manage`) atas akun: nonaktifkan/aktifkan, aksi peran dua arah, hapus permanen aman, anonimisasi. Keputusan: ADR-0027 (nonaktifkan), ADR-0045 (hapus/anonimisasi), D17 di `architecture-admin-insight.md`. Rencana & status: `docs/phases/phase-189h-aksi-massal-akun-dan-peran.md`.

## Peta endpoint
| Endpoint | Fungsi | Berkas |
|---|---|---|
| `PATCH /admin/users/:id/disable|enable` | nonaktifkan/aktifkan 1 akun | `routes/admin/users.route.ts` → `lib/account-status.ts` |
| `POST /admin/users/status/preview`, `/status` | nonaktifkan/aktifkan massal (1–100) | idem |
| `POST /admin/users/:id/roles/preview`, `/roles` | aksi peran: `grant_customer|grant_admin|grant_staff|revoke_customer|revoke_admin|revoke_staff` | `routes/admin/user-roles.route.ts`, `lib/role-actions.ts` |
| `POST /admin/users/erase/preview`, `/erase` | hapus permanen (`kind=delete`) / anonimisasi (`kind=anonymize`) massal | `routes/admin/user-erasure.route.ts`, `lib/account-erasure.ts` (murni), `lib/account-erasure-db.ts` |

## Aturan inti
- **Nonaktifkan:** tidak boleh diri sendiri; tidak boleh Super Admin aktif terakhir (kunci baris, batch-aware); sesi dicabut seketika; email status; audit `update {disabled}`.
- **Peran:** tidak boleh mengubah role sendiri; akun harus punya ≥ 1 role; Super Admin aktif terakhir tidak boleh dicabut; akun nonaktif tidak boleh diangkat admin/staf; konfirmasi ketik = email target (server); sesi dicabut; email generik; audit `role_change {action, from, to}`; status internal otomatis (D16) → pratinjau menampilkan dampak uang.
- **Hapus permanen:** kelayakan FAIL-CLOSED dari katalog Postgres: semua FK ke `"user"` selain `ON DELETE CASCADE` (session, account, user_roles, notifications) dan `audit_logs.actor_id` (di-NULL-kan) memblokir bila ada baris. Data Usaha milik akun hanya boleh dihapus bila kosong (tidak ada baris yang merujuknya, tanpa koneksi Accurate/hitungan import). FK baru di masa depan otomatis memblokir tanpa daftar manual.
- **Anonimisasi:** nama `Akun Anonim <id8>`, email `anon-<id>@anonymized.invalid`, telepon/WhatsApp/perusahaan/gambar dikosongkan, `disabled=true`, sesi+login+notifikasi dibuang. Invoice/order/langganan TETAP.
- **Pembersihan PII sisa (keduanya):** `audit_logs.changes` (entri tentang akun: kunci kontak dibuang; entri lain yang menyebut email/telepon: nilai diganti), `member_seats.invited_email`, `ownership_transfers.to_email`, `accurate_connections.accurate_user_email`, `verification` (token). Audit baru TIDAK memuat email — hanya `emailDigest` (SHA-256).
- **Pengaman umum:** pratinjau lalu terapkan; kata konfirmasi `HAPUS`/`ANONIMKAN` + alasan wajib (dicek server); akun admin/staf, diri sendiri, import berjalan ditolak; semua dalam satu transaksi dengan kunci baris urut id dan kelayakan dihitung ulang; rate limit 10/menit; log tanpa PII.

## Keputusan kecil / deviasi dari ADR-0045
- ADR menyebut audit menyimpan "snapshot email". Diganti **digest SHA-256** agar anonimisasi benar-benar menghilangkan email; jejak "akun mana" tetap dapat dibuktikan bila email asli diketahui.
- Penghapusan objek MinIO milik akun tidak dikerjakan (pelanggan tidak mengunggah media; `media.uploaded_by` bila terisi MEMBLOKIR hapus permanen).

## Known Limitations
- Anonimisasi tidak menyentuh nama Data Usaha, nama pada invoice (`bill_to_name`), atau catatan bisnis lain — itu catatan akuntansi (ADR-0045). Bila perlu dihapus juga, keputusan terpisah.
- Pemindaian `audit_logs` untuk scrub PII satu kali per aksi (regex di seluruh tabel) — cukup untuk skala sekarang; indeks/penyaringan bila tabel membesar.
- Tidak ada pemulihan setelah hapus/anonimisasi selain backup.
