# ADR-0053: Tim Internal — ubah role atomik dan reset kata sandi, tanpa hapus permanen

**Status:** Accepted (2026-11-10, user menyetujui rencana Fase 216)
**Tanggal:** 2026-11-10
**Terkait:** ADR-0027 (role staff + nonaktifkan user), ADR-0045 (hapus/anonimisasi akun pelanggan; mengecualikan admin/staf), `docs/architecture/architecture-staff-management.md`, Fase 216

## Context
Halaman `/staff` ("Tim Internal", surface admin) baru memiliki daftar, pencarian, tambah staf, dan nonaktifkan/aktifkan. Permintaan user (2026-11-10): Super Admin bisa mengubah akun staf (mis. Admin → Super Admin) dan menghapus akun.

Fakta kode (diperiksa 2026-11-10):
- Aksi peran dua arah sudah ada dan matang (`routes/admin/user-roles.route.ts`, `lib/role-actions.ts`, Fase 189H), tetapi dirancang per-peran (`grant_*`/`revoke_*`) untuk halaman Pengguna. Mengubah tingkat staf (Admin ↔ Super Admin) lewat dua panggilan terpisah (grant lalu revoke) tidak atomik: bila panggilan kedua gagal akun berhenti di keadaan campuran (dua peran sekaligus).
- ADR-0045 mengecualikan akun admin/staf dari hapus permanen dan menyerahkannya ke halaman Tim Internal.
- Sekitar 10 tabel mengacu ke `user.id` dari tindakan staf tanpa cascade (`audit_logs.actor_id`, `orders.confirmed_by/rejected_by/cancelled_by`, `announcements.created_by`, `promos.created_by`, `settings.updated_by`, `media.uploaded_by`, `member_seats.revoked_by`, `subscription_renewals.actor_id`, dst.). Menghapus staf yang pernah bertindak merusak jejak audit.
- Tidak ada mekanisme "wajib ganti sandi" di login; akun staf baru dibuat dengan sandi sementara yang dikirim lewat email dan ditampilkan sekali.

## Decision
1. **Tidak ada hapus permanen untuk akun staf internal.** Satu-satunya cara menarik akses staf adalah **nonaktifkan** (sudah ada, reversibel, sesi diputus seketika). Ini mengubah klausul ADR-0045 "dilakukan lewat halaman Tim Internal": akun staf tidak dihapus dan tidak dianonimkan lewat fitur ini. Disetujui user 2026-11-10.
2. **Ubah tingkat staf** (Admin ↔ Super Admin) adalah **satu operasi atomik** dengan endpoint baru di `routes/admin/staff.route.ts`, bukan dua panggilan grant/revoke. Satu transaksi, kunci baris target dan semua Super Admin aktif, satu entri audit `role_change`. Aturan keselamatan yang sama dengan aksi peran Fase 189H dipakai ulang (bukan ditulis ulang): tidak boleh mengubah diri sendiri, Super Admin aktif terakhir tidak boleh diturunkan, konfirmasi ketik email dicek di server, akun anonim/nonaktif tidak boleh dinaikkan, sesi target dicabut, email pemberitahuan generik.
3. **Reset kata sandi** adalah aksi Super Admin baru: sandi sementara acak dibuat di server, disimpan lewat mekanisme hash Better Auth, semua sesi target dicabut, sandi dikirim ke email staf (job email `sensitive`, tidak masuk log) dan ditampilkan sekali ke Super Admin, mengikuti pola pembuatan staf yang sudah ada. Audit mencatat bahwa reset terjadi, tidak pernah memuat sandi. Tidak boleh untuk akun sendiri (pakai alur ganti sandi biasa).
4. **Tidak ada ubah nama/email** pada akun staf di fase ini (tidak dipilih user). Email adalah identitas login; mengubahnya butuh keputusan terpisah.
5. Semua aksi ubah hanya untuk Super Admin (`users.manage`). Melihat daftar tetap untuk Admin dan Super Admin (`users.view`).

## Alternatif yang Dipertimbangkan
- **Hapus bila tanpa jejak, selain itu nonaktifkan** — ditolak user; menambah kerumitan (pemeriksaan jejak lintas 10 tabel) demi kasus salah-input akun baru.
- **Hapus dengan anonimisasi staf** — ditolak: jejak audit atas nama "staf terhapus" mengaburkan akuntabilitas.
- **Ubah tingkat lewat dua panggilan `grant`/`revoke` dari UI** — ditolak: tidak atomik, dua sesi dicabut, dua email, dua entri audit untuk satu niat.
- **Reset lewat tautan Better Auth (`sendResetPassword`)** — lebih aman (tidak ada sandi di email) tetapi tidak dipilih user; dicatat sebagai pengerasan kemudian bila perlu.

## Konsekuensi
- Daftar Tim Internal hanya bertambah; akun yang tidak dibutuhkan hanya bisa dinonaktifkan dan tetap terlihat (bertanda Nonaktif).
- Sandi sementara lewat email memiliki risiko yang sama dengan pembuatan staf yang sudah ada (diterima), dimitigasi: sesi lama dicabut, tampil sekali, tidak di log/audit, laju dibatasi.
- Perlu uji untuk setiap aturan keselamatan dan audit keamanan (`security-auditor`) karena menyangkut eskalasi hak akses dan kredensial.
- Diterima setelah audit (2026-11-10): Super Admin dapat mereset kata sandi Super Admin lain dan menerima sandinya (ada email ke target dan audit); cache cookie sesi 5 menit membuat sesi yang dicabut masih lolos `getSession` sebentar (hak akses tetap dibaca dari DB tiap permintaan). Pengerasan kemudian bila perlu: step-up kata sandi pemanggil, tautan reset sekali pakai.

