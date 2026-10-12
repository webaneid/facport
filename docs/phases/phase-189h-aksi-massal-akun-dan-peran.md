# Fase 189H — Aksi Massal Akun (Nonaktifkan/Aktifkan, Hapus Permanen Aman, Anonimisasi) & Aksi Peran Dua Arah

**Status:** In Progress
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Memberi Super Admin (`users.manage`) kendali bersih-bersih akun yang aman: (1) nonaktifkan/aktifkan massal, (2) hapus permanen HANYA akun tanpa jejak bisnis, (3) anonimisasi akun berjejak bisnis (permintaan hapus data pribadi), serta (4) aksi peran dua arah: "Aktifkan akses pengguna" (admin/staf → juga customer) dan "Jadikan admin/staf" / "Cabut role admin/staf" (customer ↔ admin/staf). Keputusan: ADR-0045 (Accepted), D17 (arah disetujui user 2026-10-12: "akun user bisa diangkat jadi admin"; "hapus total dari database juga boleh" → dijawab ADR-0045 tiga tingkat). Rancangan: `architecture-admin-insight.md` § 4.4, 4.5, 5.4. Induk: `phase-189-insight-pelanggan-admin.md`.

## Mode kerja
Fase paling berisiko di seri 189 (penghapusan data, kenaikan hak akses) → eksekusi langsung di sesi utama, TDD, dibagi 3 bagian dengan komit terpisah, **audit penuh subagent `security-auditor` di akhir** (wajib per ADR-0045). Tidak ada penghapusan di DB dev di luar fixture tes.

## Rancangan

### Bagian 1 — Aksi peran (D17)
`POST /admin/users/:id/roles/preview` dan `POST /admin/users/:id/roles` (`users.manage`), body `{ action: "grant_customer" | "grant_admin" | "grant_staff" | "revoke_admin" | "revoke_staff" | "revoke_customer", confirm: string }`.
- `grant_customer`: memberi role `customer` (akun admin/staf bisa membuka `app.`). `grant_admin`/`grant_staff`: memberi `admin` (Super Admin) / `staff` (Admin). `revoke_*`: mencabut role itu.
- Pengaman (server): tidak boleh mengubah role DIRI SENDIRI; tidak boleh mencabut Super Admin AKTIF terakhir (kunci baris, pola `disable`); akun harus punya ≥ 1 role sesudah aksi (mencabut role terakhir ditolak); konfirmasi ketik = email akun target (case-insensitive, dicek server); akun nonaktif/terhapus ditolak 404/409; idempoten (sudah punya/tidak punya role → `changed:false`, bukan galat).
- Pratinjau dampak (customer → admin/staf): jumlah langganan berbayar aktif, Data Usaha dimiliki, uang terbayar yang keluar dari laporan (internal otomatis, D16), tagihan perpanjangan terjadwal yang akan berhenti (reuse `internalChangeImpact`); cabut role admin dari akun yang masih punya Data Usaha → dampak sebaliknya (masuk laporan lagi).
- Setelah `grant_admin/staff`: sesi akun target DICABUT (hak berubah → login ulang) dan email pemberitahuan lewat job queue (generik; tanpa kata sandi). Audit `entity_type='user'`, `action='role_change'`, `changes {role, from, to, by}`.

### Bagian 2 — Nonaktifkan/Aktifkan massal
`POST /admin/users/status/preview` dan `/admin/users/status` (`users.manage`), body `{ userIds[1..100], disabled }`. Memakai aturan yang SAMA dengan endpoint tunggal (tidak boleh diri sendiri, tidak boleh Super Admin aktif terakhir, cabut sesi, email status, audit per akun) — logika diekstrak ke `lib/account-status.ts` dan dipakai endpoint tunggal & massal (tidak disalin). Satu transaksi + kunci baris urut id.

### Bagian 3 — Hapus permanen & anonimisasi (ADR-0045)
`POST /admin/users/delete/preview|apply` dan `/admin/users/anonymize/preview|apply` (`users.manage`), 1–100 akun, `confirm` = kata `HAPUS` untuk hapus / `ANONIMKAN` untuk anonimisasi + alasan wajib (3–500) tercatat di audit.
- **Penolakan umum (per akun, daftar alasan):** diri sendiri; akun ber-role admin/staf (lewat Tim Internal); akun yang memegang kepemilikan Data Usaha dengan import berjalan/antre; akun tidak ditemukan.
- **Hapus permanen — kelayakan "tanpa jejak bisnis" (fail-closed):** dihitung dari katalog Postgres (`pg_constraint`): SEMUA kolom yang mereferensikan `user.id`, kecuali yang CASCADE (`session`, `account`, `user_roles`, `notifications`) dan yang di-NULL-kan aman (`audit_logs.actor_id`, `settings.updated_by`, `media.uploaded_by`, `member_seats.revoked_by`, `*_by` konfirmasi). Baris di tabel lain mana pun (invoice, order, langganan, import batch, seat/undangan, transfer, koneksi Accurate, formula/produksi, konversi, klik CS, Data Usaha berisi) → ditolak dengan nama tabel. FK baru di masa depan otomatis memblokir (tidak perlu daftar manual). Data Usaha MILIK akun hanya boleh dihapus bila kosong (tanpa langganan/seat/import/koneksi).
- **Anonimisasi:** nama → `Akun Anonim <id8>`, email → `anon-<id>@anonymized.invalid`, telepon/WhatsApp/perusahaan/gambar dikosongkan, `disabled=true`, `emailVerified=false`, sesi & akun login (kredensial/OAuth) dihapus, notifikasi dihapus; `audit_logs` yang memuat email/telepon lama akun itu (kolom `changes`, `entity_type='user'` maupun peristiwa Data Usaha: undangan seat, akun Accurate) di-scrub; `member_seats.invited_email` yang sama di-anonimkan. Baris invoice/order/langganan TETAP (angka keuangan utuh). Idempoten.
- **Pengaman umum:** preview dulu (tanpa mengubah), konfirmasi ketik server-side, audit per akun SEBELUM data dibuang (snapshot email + alasan + admin), satu transaksi, peringatan backup, rate limit `/admin/users/delete|anonymize` (10/menit), tidak memuat PII ke log.

## Scope
**Bagian 1 — Peran**
- [ ] R1 `lib/role-actions.ts` (murni: validasi aksi, hasil perubahan) + tes
- [ ] R2 Endpoint preview/apply + pengaman + sesi dicabut + email + audit + tes (izin 401/403, diri sendiri, Super Admin terakhir, role terakhir, konfirmasi salah, idempoten, dampak)
- [ ] R3 UI detail user: tombol/dialog "Aktifkan akses pengguna", "Jadikan Admin/Super Admin", "Cabut role …" (dampak + ketik email) + tes
**Bagian 2 — Status massal**
- [ ] S1 `lib/account-status.ts` (ekstrak) + endpoint tunggal memakainya (perilaku HTTP sama, tes lama hijau)
- [ ] S2 Endpoint massal preview/apply + tes
- [ ] S3 UI bilah aksi massal: Nonaktifkan/Aktifkan + dialog + tes
**Bagian 3 — Hapus & anonimisasi**
- [ ] H1 `lib/account-erasure.ts`: kelayakan (katalog FK), hapus aman, anonimisasi + scrub audit/seat + tes per FK
- [ ] H2 Endpoint delete/anonymize preview/apply + rate limit + audit + tes
- [ ] H3 UI: aksi massal "Hapus permanen" & "Anonimkan" (dampak, alasan, ketik HAPUS/ANONIMKAN, peringatan backup) + tes
**Penutup**
- [ ] D1 Dokumen: `architecture-account-lifecycle.md`, `architecture-admin-insight.md` § 4.4/4.5 status, glosarium, CLAUDE.md peta, PROGRESS/phase 189, lessons-learned
- [ ] A1 Audit penuh `security-auditor`; perbaiki Critical/High; suite penuh API+web; `db:cleanup-test-data`; komit+push

## Di luar scope
Penghapusan objek MinIO milik akun (avatar/media) — dicatat bila ada; penghapusan invoice/order (ditolak ADR-0045); "pilih semua hasil filter" (batas 100 baris/halaman); hibah akses internal (Fase 191); pemulihan akun terhapus (tidak ada — backup).

## Keamanan (untuk audit penutup)
Eskalasi hak (self-promote, bypass konfirmasi, Super Admin terakhir, TOCTOU dua Super Admin), penghapusan tidak sengaja akun berjejak bisnis (fail-closed katalog FK), kebocoran PII sisa (audit_logs, seat, notifikasi, sesi), IDOR lintas akun, konfirmasi hanya di UI, injeksi lewat alasan/email di audit & email, enumerasi lewat pesan penolakan, rate limit, atomisitas (transaksi), idempotensi dan balapan dengan pembuatan invoice (kunci baris `FOR UPDATE`).

## Referensi
- ADR-0044, ADR-0045; `architecture-admin-insight.md` § 4.4, 4.5, 5.4, 9 (D16–D18); `architecture-internal-accounts.md`; lessons-learned 2026-09-17 (hapus akun manual berantai); `admin/users.route.ts` (`disable`, aksi massal internal), `admin/staff.route.ts`

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [ ] Security review (subagent `security-auditor`, audit penuh)
- [ ] Temuan Critical/High diperbaiki; Medium/Low diperbaiki atau dicatat
- [ ] Dokumen; PROGRESS/phase 189 diupdate
- [ ] Catat: UI belum dilihat di browser

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
