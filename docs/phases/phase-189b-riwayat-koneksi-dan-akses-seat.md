# Fase 189B — Riwayat Koneksi Accurate, Alasan Putus, dan Aksi Admin atas Akses (Seat)

**Status:** In Progress
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Memenuhi butir 9 (riwayat salah koneksi → diputus admin → benar) dan butir 4 (admin dapat mengeliminasi/memutasi akses User Tambahan dengan jejak) dari kebutuhan client FAC. Fase ini hanya MENCATAT dan memberi aksi: laporan lintas pelanggan ada di 189C–D. Keputusan: D7 (alasan cabut akses wajib), D10 (alasan putus koneksi bebas + saran), D15 (notifikasi ke pemilik saja). Induk: `phase-189-insight-pelanggan-admin.md`; rancangan: `architecture-admin-insight.md` § 4.2, 4.3.

## Mode kerja
Menyentuh jalur koneksi Accurate (OAuth, token) dan akses data pelanggan lain → eksekusi langsung di sesi utama, TDD, ekstraksi logika bersama (bukan salinan), security review subagent di akhir.

## Rancangan
**Satu aliran riwayat per Data Usaha** di `audit_logs` (`entity_type='data_usaha'`, `entity_id`=id Data Usaha). `action` ≤ 20 karakter:

| Aksi | Pelaku | `changes` |
|---|---|---|
| `connect_accurate` | pemilik | `via` (`oauth`/`attach`), `accurateConnectionId`, `accountEmail` |
| `select_database` | pemilik | `accurateDbId`, `alias` |
| `confirm_database` | pemilik | `accurateDbId`, `alias` |
| `reset_database` ("Pilih yang Lain") | pemilik | `previousDbId`, `previousAlias` — koreksi mandiri pelanggan |
| `disconnect_accurate` (SUDAH ADA) | admin | tambahan `reason: {code?, note?}` |
| `invite_seat` | pemilik / admin | `seatId`, `email`, `by` |
| `revoke_seat` | pemilik / admin | `seatId`, `previousStatus`, `email`, `by`, `reason` (WAJIB bila admin), `newInviteEmail?` |
Pencatatan GAGAL tidak boleh menggagalkan alur pengguna (try/catch, log tanpa PII). Riwayat sebelum fase ini hanya punya `disconnect_accurate`; sisi "benar" untuk data lama diturunkan dari keadaan sekarang (dinyatakan sebagai pendekatan).

**Catatan deviasi dari draf**: D7 menyebut `entity_type='member_seat'`; dipakai `data_usaha` (+ `seatId` di `changes`) karena kebutuhan utamanya "riwayat akses PER DATA USAHA" dan satu baris `member_seats` dipakai ulang berkali-kali.

**Aksi admin atas seat** (`subscriptions.manage`, selaras `disconnect-accurate`): `POST /admin/data-usaha/:id/seats/:seatId/revoke {reason (3–500, wajib), newEmail?}` — cabut (sesi member dicabut), opsional langsung mengundang email baru di slot yang sama ("pindahkan akses"; undangan menyebut dikirim tim Facport atas permintaan pemilik, bukan atas nama pemilik). Notifikasi HANYA ke pemilik (D15), isinya generik — alasan admin tidak ditampilkan ke pelanggan (catatan internal). Logika cabut/undang DIEKSTRAK dari `routes/team.route.ts` ke `lib/seat-actions.ts` dan dipakai kedua sisi.
**Baca** (`users.view`): `GET /admin/data-usaha/:id/access` (seat + riwayat gabungan, 50 terbaru, nama pelaku).

## Scope
**Backend (`apps/api`)**
- [ ] B1 `lib/data-usaha-events.ts`: konstanta aksi, `recordDataUsahaEvent` (non-fatal), `listDataUsahaEvents`.
- [ ] B2 Catat event koneksi di `routes/accurate.route.ts` (callback OAuth, attach, select, confirm, reset) dan `reason` pada `disconnect_accurate` (`admin/data-usaha.route.ts`, body opsional).
- [ ] B3 `lib/seat-actions.ts` (revoke/invite/email undangan) + refaktor `routes/team.route.ts` (perilaku sama) + catat `invite_seat`/`revoke_seat` sisi pemilik.
- [ ] B4 `routes/admin/seats.route.ts`: GET access/riwayat, POST revoke (+ mutasi `newEmail`), notifikasi pemilik (tipe baru `seat_access_changed_by_admin`), audit.
- [ ] B5 Tes API: event tercatat di tiap jalur + tidak menggagalkan alur saat pencatatan gagal; revoke admin (izin 401/403, alasan wajib, seat Data Usaha lain 404, seat available 400, sesi member dicabut, notifikasi pemilik tanpa alasan, mutasi mengundang email baru + job email, audit lengkap); riwayat; refaktor team tetap lulus.

**Web (`apps/web`)**
- [ ] W1 Dialog putus koneksi: saran cepat (salah database / salah akun Accurate / lainnya) + catatan bebas, opsional.
- [ ] W2 Panel "Akses (User Tambahan)" per Data Usaha di detail user admin: tabel seat + tombol Cabut/Pindahkan (dialog alasan wajib + saran cepat + email baru opsional) + riwayat.
- [ ] W3 Tampilan notifikasi tipe baru bila perlu; tes (Testing Library) untuk dialog & panel.

**Dokumen**
- [ ] D1 `architecture-admin-insight.md` § 4.2/4.3 status + kamus aksi riwayat (`architecture-data-usaha-history.md` ringkas), glosarium, peta CLAUDE.md bila baru.
- [ ] D2 PROGRESS/phase 189, lessons-learned bila ada temuan.

## Di luar scope
Laporan/halaman lintas pelanggan "Riwayat Koneksi" (189C–D); hapus/anonimisasi akun & peran dua arah (189H); mencabut sesi hanya untuk Data Usaha tertentu (perilaku lama `revokeAllSessions` mencabut SEMUA sesi member dipertahankan — dicatat sebagai keterbatasan).

## Keamanan (untuk review penutup)
Kebocoran lintas Data Usaha (seat harus milik `:id`), izin terpusat, alasan wajib server-side, tanpa PII di log, undangan tidak menyamar sebagai pemilik, token undangan hanya hash di DB, race dua admin (transaksi + kunci baris seat), pencatatan non-fatal tidak menyembunyikan aksi tanpa jejak yang disengaja.

## Referensi
- `architecture-admin-insight.md` § 4.2, 4.3, 9 (D7, D10, D15); `architecture-user-tambahan.md`; ADR-0036/0037 (koneksi); `architecture-accurate-connect-gate.md`

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error; lint bersih
- [ ] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [ ] Security review (subagent `security-auditor`)
- [ ] Temuan Critical/High diperbaiki; Medium/Low dicatat/diperbaiki
- [ ] Dokumen D1–D2; PROGRESS/phase 189 diupdate
- [ ] Catat: UI belum dilihat di browser

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
