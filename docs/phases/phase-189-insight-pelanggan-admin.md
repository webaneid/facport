# Fase 189 — Insight Pelanggan Admin (Kebutuhan Data FAC)

**Status:** In Progress (189A selesai 2026-10-12; sub-fase lain belum dimulai)
**Mulai:** 2026-10-12
**Selesai:** —

## Tujuan
Memenuhi 9 butir kebutuhan data client (`docs/referencehtml/facport/masukan-client-12-oct.xlsx`, FAC 10/10/2026) di portal admin: komersil vs internal,
pengguna per fitur dan fitur per pengguna, akses per pelanggan, pelanggan baru dan yang akan berakhir, kohort/retensi, kontak pelanggan,
riwayat pemutusan koneksi. Dikerjakan SEBELUM redesign UI (Fase 190) — urutan disepakati user 2026-10-12: kebutuhan client dulu, UI kemudian.
Rancangan lengkap: `docs/architecture/architecture-admin-insight.md`.

## Scope perencanaan (fase ini)
- [x] Baca & petakan 9 butir kebutuhan ke data/kode yang ada (`architecture-admin-insight.md` § 3)
- [x] Audit kode dashboard admin & skema (user, subscriptions, member_seats, data_usaha, audit_logs)
- [x] Paket SQL baseline production (`phase-189-sql-pack-baseline.md`) — **belum dijalankan user**
- [x] Dokumen arsitektur + daftar keputusan (D1–D8)
- [x] Tutup Fase 145 (bagian cutover) sebagai prasyarat kebersihan PROGRESS
- [ ] User menjalankan SQL baseline, hasil dicatat di phase-189-sql-pack-baseline.md
- [ ] Keputusan D1, D2, D3, D5, D6 (lihat arsitektur § 9) — D2/D3 perlu client
- [x] ADR-0044 (data kontak akun, internal, kontrol keuangan) dan ADR-0045 (hapus/anonimisasi akun) — ditulis, status Proposed
- [ ] Persetujuan user atas ADR-0044/0045 (gerbang SOP sebelum kode)

## Sub-fase eksekusi (masing-masing punya phase doc sendiri saat dimulai)
| Sub-fase | Isi | Status |
|---|---|---|
| 189A | Profil akun: `phone`, `whatsapp`, `company_name`; `PhoneInput` (E.164); form daftar; modal Lengkapi Profil tak bisa ditutup; tampil + WhatsApp klik di admin — rencana detail: `phase-189a-profil-kontak-akun.md` | Done (2026-10-12) |
| 189G | Akun internal & kontrol keuangan (Lapis 1: guard invoice terpusat, tagihan terjadwal, laporan uang) + aksi massal tandai internal di `/admin/users` — rencana detail: `phase-189g-akun-internal-kontrol-keuangan.md` | Done (2026-10-12) |
| 189B | Riwayat koneksi Accurate (sambung/pilih database/reset + alasan putus) dan aksi admin cabut/pindahkan akses seat dengan alasan wajib — rencana detail: `phase-189b-riwayat-koneksi-dan-akses-seat.md` | In Progress |
| 189C | API Insight read-only, fungsi murni `lib/admin-insights.ts`, tes, index | Not Started |
| 189D | Halaman Insight fungsional + ekspor CSV | Not Started |
| 189E | KPI komersil/internal & nilai rupiah di `/admin` | Not Started |
| 189H | Aksi massal pengguna (nonaktifkan/aktifkan, hapus permanen aman, anonimisasi; ADR-0045) + aksi role dua arah (akses pengguna untuk admin; jadikan admin untuk customer) | Not Started |
| 189F | (Opsional) Log aktivitas user | Ditunda |

## Di luar scope
- Redesign visual / design system (→ Fase 190).
- Bulk delete Accurate (→ Fase 188, tetap menunggu keputusan client).
- Dashboard pelanggan (`/app`) — disesuaikan setelah design system admin selesai.
- Penyesuaian `maxRows` trial, concurrency antrean import (Fase 167), dan evaluasi client 2026-10-03 — dikerjakan terpisah.

## Referensi
- Architecture doc: `docs/architecture/architecture-admin-insight.md`
- SQL baseline: `docs/phases/phase-189-sql-pack-baseline.md`
- Dashboard admin yang ada: `docs/architecture/architecture-admin-dashboard.md`, `docs/phases/phase-59-redesign-dashboard-admin.md`

## Keputusan Kecil Selama Eksekusi
- 2026-10-12 — Penanda internal = flag di akun user (`is_internal`), dipilih user (bukan role khusus).
- 2026-10-12 — Redesign UI: arah "Kompak & tajam", cakupan admin dulu lalu pelanggan; dikerjakan SETELAH fungsi data (Fase 190).
- 2026-10-12 — Jawaban user atas pertanyaan client: nomor telepon/WA mengikuti standar E.164 Jalajogja; isian saat daftar (email) atau pengalihan sekali pada login (Google/user lama); nilai rupiah = total terbayar; internal = flag akun oleh admin (Trainer/Karyawan/Mitra, tanpa subkategori); komersil = default; tidak ada toleransi di batas habis langganan; alasan pencabutan akses wajib & tercatat. Detail: `architecture-admin-insight.md` § 4.1, 5.1, 9.
- 2026-10-12 — Keputusan P1–P14 (satuan pengguna = semua akun manusia; D9 dibagi Lapis 1/2; dua baris uang; awal berlangganan = berbayar pertama; tren tahunan + filter tahun; tabel mengikuti gaya `DataTable` + tombol Lihat + tombol WhatsApp; aksi massal di /users; CSV unduh langsung; `insights.view` untuk Super Admin & Admin). Detail: `architecture-admin-insight.md` § 5.2-5.4, § 9.
- 2026-10-12 — Urutan eksekusi diserahkan ke keputusan teknis: 189A → 189G → 189B → 189C/D/E → 189H → 190 → 191. Satu email boleh dua role (admin + customer) lewat aksi Super Admin; aksi massal pengguna termasuk hapus permanen yang AMAN (hanya akun tanpa jejak bisnis) + anonimisasi; hapus total jejak keuangan TIDAK dilakukan (ADR-0045).
- 2026-10-12 — Fase 145 ditutup (bagian cutover). T11 kontrak (hapus kolom/endpoint koneksi lama) tetap terbuka, rilis terpisah.

## Checklist Sebelum Ditutup (sesuai SOP) — berlaku per sub-fase eksekusi
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review (skill `security-review`; 189C → subagent `security-auditor`)
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` bila ditunda
- [ ] `docs/PROGRESS.md` diupdate
- [ ] Data test dibersihkan dari DB dev

## Known Limitations
- Data historis koneksi sebelum 189B hanya punya sisi "putus"; sisi "benar" diturunkan dari keadaan sekarang.
- Kohort tahun ke-2 baru terisi 2027.
- Riwayat tanggal berakhir mengikuti nilai terkini bila admin pernah mengubah tanggal manual.

## Ringkasan Hasil (isi pas fase Done)
