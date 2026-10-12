# Fase 189B — Riwayat Koneksi Accurate, Alasan Putus, dan Aksi Admin atas Akses (Seat)

**Status:** Done
**Mulai:** 2026-10-12
**Selesai:** 2026-10-12

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
- [x] B1 `lib/data-usaha-events.ts`: konstanta aksi, `recordDataUsahaEvent` (non-fatal), `listDataUsahaEvents`.
- [x] B2 Catat event koneksi di `routes/accurate.route.ts` (callback OAuth, attach, select, confirm, reset) dan `reason` pada `disconnect_accurate` (`admin/data-usaha.route.ts`, body opsional).
- [x] B3 `lib/seat-actions.ts` (revoke/invite/email undangan) + refaktor `routes/team.route.ts` (perilaku sama) + catat `invite_seat`/`revoke_seat` sisi pemilik.
- [x] B4 `routes/admin/seats.route.ts`: GET access/riwayat, POST revoke (+ mutasi `newEmail`), notifikasi pemilik (tipe baru `seat_access_changed_by_admin`), audit.
- [x] B5 Tes API: event tercatat di tiap jalur + tidak menggagalkan alur saat pencatatan gagal; revoke admin (izin 401/403, alasan wajib, seat Data Usaha lain 404, seat available 400, sesi member dicabut, notifikasi pemilik tanpa alasan, mutasi mengundang email baru + job email, audit lengkap); riwayat; refaktor team tetap lulus.

**Web (`apps/web`)**
- [x] W1 Dialog putus koneksi: saran cepat (salah database / salah akun Accurate / lainnya) + catatan bebas, opsional.
- [x] W2 Panel "Akses (User Tambahan)" per Data Usaha di detail user admin: tabel seat + tombol Cabut/Pindahkan (dialog alasan wajib + saran cepat + email baru opsional) + riwayat.
- [x] W3 Tampilan notifikasi tipe baru bila perlu; tes (Testing Library) untuk dialog & panel.

**Dokumen**
- [x] D1 `architecture-admin-insight.md` § 4.2/4.3 status + kamus aksi riwayat (`architecture-data-usaha-history.md` ringkas), glosarium, peta CLAUDE.md bila baru.
- [x] D2 PROGRESS/phase 189, lessons-learned bila ada temuan.

## Di luar scope
Laporan/halaman lintas pelanggan "Riwayat Koneksi" (189C–D); hapus/anonimisasi akun & peran dua arah (189H); mencabut sesi hanya untuk Data Usaha tertentu (perilaku lama `revokeAllSessions` mencabut SEMUA sesi member dipertahankan — dicatat sebagai keterbatasan).

## Keamanan (untuk review penutup)
Kebocoran lintas Data Usaha (seat harus milik `:id`), izin terpusat, alasan wajib server-side, tanpa PII di log, undangan tidak menyamar sebagai pemilik, token undangan hanya hash di DB, race dua admin (transaksi + kunci baris seat), pencatatan non-fatal tidak menyembunyikan aksi tanpa jejak yang disengaja.

## Referensi
- `architecture-admin-insight.md` § 4.2, 4.3, 9 (D7, D10, D15); `architecture-user-tambahan.md`; ADR-0036/0037 (koneksi); `architecture-accurate-connect-gate.md`

## Keputusan Kecil Selama Eksekusi
- Riwayat disimpan di `entity_type='data_usaha'` (bukan `member_seat` seperti draf D7): kebutuhan utama "riwayat akses PER DATA USAHA" dan satu baris seat dipakai ulang berkali-kali.
- Dua mode pencatatan: `insertDataUsahaEvent(tx, …)` melempar (aksi seat/admin: aksi dan jejak selalu bersama) vs `recordDataUsahaEvent(…)` non-fatal (alur pelanggan: callback OAuth/pilih database tidak boleh gagal karena riwayat).
- Pindahkan akses = `revokeSeat` + `newEmail` (satu transaksi), BUKAN endpoint undang-admin terpisah; admin tidak bisa menambah akses ke slot kosong.
- Alasan cabut akses = catatan INTERNAL: tidak masuk notifikasi/email pelanggan; pemilik menerima notifikasi in-app DAN email generik.
- `seatExpired` dihitung di server (lint kemurnian melarang `Date.now()` saat render).
- Dari audit: penautan undangan bersyarat (`linkSeatToMember` di `lib/member-seats.ts`: status `invited` + hash token sama) menutup balapan "menghidupkan slot yang baru dicabut"; `revokeAllSessions` non-fatal; redaksi email undangan pengganti hanya mengklaim hal yang dipenuhi sistem ("pemilik telah diberi tahu", bukan "atas permintaan pemilik"); riwayat tertulis untuk SETIAP Data Usaha terdampak pada "hapus akun Accurate"; email undangan seragam lowercase; rate limit longgar `/admin/data-usaha` (60/menit).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error; lint bersih
- [x] Tes API + web hijau (SUITE PENUH); data uji dibersihkan
- [x] Security review (subagent `security-auditor`)
- [x] Temuan Critical/High diperbaiki; Medium/Low dicatat/diperbaiki
- [x] Dokumen D1–D2; PROGRESS/phase 189 diupdate
- [x] Catat: UI belum dilihat di browser — verifikasi visual oleh user belum dilakukan

## Known Limitations
- **Klaim "atas permintaan pemilik" tidak diverifikasi sistem** (audit Medium, kebijakan): admin/staf dengan `subscriptions.manage` bisa memindahkan slot terisi ke email mana pun; kontrolnya = alasan wajib + riwayat + notifikasi dan email ke pemilik. Pengetatan (izin khusus untuk `newEmail`, kolom referensi tiket/bukti permintaan) menunggu keputusan user — D22 di `architecture-admin-insight.md`.
- Peristiwa yang BELUM tercatat: penerimaan undangan (`accept_seat`) dan kirim ulang undangan (`resend_seat`) — kandidat 189C/D (batas `action` 20 karakter).
- `recordDataUsahaEvent` di alur pelanggan non-fatal → riwayat koneksi bukan jejak forensik yang dijamin; hanya aksi seat dan putus-koneksi admin yang transaksional.
- `revokeAllSessions` mencabut SEMUA sesi akun member (perilaku lama): akun yang juga pemilik/anggota di tempat lain harus login ulang; cookie cache Better Auth 5 menit membuat sesi tampak valid sebentar (akses data tetap terputus seketika lewat tabel seat).
- Email akun Accurate, email member/undangan tersimpan di `audit_logs.changes` (PII): retensi/anonimisasi → 189H (ADR-0045).
- Rute undang pemilik (`/me/team/:id/invite`) tanpa rate limit khusus (perilaku lama).
- UI belum dilihat di browser.

## Ringkasan Hasil
Satu aliran **riwayat per Data Usaha** (`lib/data-usaha-events.ts`) kini mencatat peristiwa koneksi Accurate (sambung via OAuth/akun yang sudah ada, pilih database, konfirmasi, "Pilih yang Lain" sebagai koreksi mandiri pelanggan), putus koneksi oleh admin **dengan alasan opsional** (saran cepat salah database / salah akun / lainnya + catatan internal), serta undang/cabut akses User Tambahan oleh pemilik maupun admin. Logika seat diekstrak ke `lib/seat-actions.ts` (kunci baris + riwayat dalam satu transaksi) dan dipakai rute pemilik (refaktor tanpa perubahan perilaku HTTP) serta rute admin baru: `GET /admin/data-usaha/:id/access` (slot + riwayat) dan `POST …/seats/:seatId/revoke` (alasan WAJIB; opsi pindahkan ke email baru; sesi member dicabut; pemilik diberi notifikasi + email generik tanpa alasan). UI: panel "Akses (User Tambahan) & Riwayat" lazy di detail user admin, dialog cabut/pindahkan, saran alasan di dialog putus koneksi. Tanpa migrasi DB.

**Verifikasi:** typecheck API+web bersih; lint web bersih; tes API 2.230 lulus; tes web 484 lulus (+ events, seat-actions termasuk balapan dua cabut, route admin, accurate events, alasan putus, panel, dialog, kamus kalimat riwayat). Data uji dibersihkan.
**Security review** (subagent `security-auditor`): 0 Critical, 0 High; 2 Medium (balapan penerimaan undangan → **diperbaiki** + tes; klaim "atas permintaan pemilik" tak terverifikasi → redaksi **diperbaiki**, email ke pemilik **ditambah**, pengetatan izin = **keputusan terbuka D22**); 5 Low (sesi non-fatal → diperbaiki; riwayat Data Usaha terdampak removeAccount → diperbaiki; rate limit → ditambah; komentar cookie cache → dikoreksi; lowercase email → disamakan) + Info (dicatat). Celah audit `accept_seat`/`resend_seat` dicatat untuk 189C/D.
**Commit:** `044c63c` (kode), lalu perbaikan audit + dokumen.
