# Fase 216 — Kelola Akun Tim Internal (ubah role, reset kata sandi)

**Status:** Done (sisi kode; uji manual browser menyusul)
**Mulai:** 2026-11-10
**Selesai:** 2026-11-10

## Tujuan
Halaman `/staff` (Tim Internal) saat ini hanya bisa melihat, menambah, dan menonaktifkan staf. Super Admin perlu bisa **mengubah tingkat akun staf** (Admin ↔ Super Admin) dan **mereset kata sandi staf**, tanpa SQL manual. Hapus permanen sengaja tidak dibuat (hanya nonaktifkan) agar jejak audit utuh. Dikerjakan sebagai fase sendiri karena menyangkut eskalasi hak akses dan kredensial (butuh audit keamanan), terpisah dari Fase 214/215 yang sedang menunggu verifikasi.

## Scope
- [x] Spike: cara menyimpan sandi baru lewat Better Auth (hasher resmi) + uji login dengan sandi baru; tangani akun tanpa kredensial sandi (`NO_PASSWORD_LOGIN`)
- [x] `lib/role-actions.ts`: `planTierSwitch(current, target)` murni + tes unit
- [x] `POST /admin/staff/:id/role/preview` dan `POST /admin/staff/:id/role` (atomik, kunci baris, sesi dicabut, email, audit `role_change`)
- [x] `POST /admin/staff/:id/reset-password` (sandi sementara, hash Better Auth, sesi dicabut, email `sensitive`, audit tanpa sandi, laju 5/menit)
- [x] Tes rute untuk setiap aturan di `architecture-staff-management.md` § 3, termasuk uji balapan dua Super Admin
- [x] UI: menu aksi per baris (Ubah role, Reset kata sandi, Nonaktifkan/Aktifkan), `StaffRoleDialog`, `ResetPasswordDialog`, aksi akun sendiri dinonaktifkan
- [x] Tes web untuk dialog dan keadaan akun sendiri
- [x] Update `architecture-user-roles.md` dan ADR-0045 (catatan: staf tidak dihapus, rujuk ADR-0053)
- [x] Typecheck, audit keamanan `security-auditor` (menggantikan `security-review`, lintas >3 berkas)
- [ ] Uji manual di browser dev (login Super Admin dan Admin, ubah role, reset sandi) — BELUM dilakukan, hanya tes otomatis

## Di Luar Scope (disengaja)
Hapus/anonimisasi staf; ubah nama/email staf; aksi massal; role kustom; "wajib ganti sandi saat login pertama"; reset lewat tautan sekali pakai.

## Referensi
- Architecture doc: `docs/architecture/architecture-staff-management.md`
- ADR: `docs/decisions/adr-0053-tim-internal-ubah-role-reset-sandi-tanpa-hapus.md`; terkait ADR-0027, ADR-0045
- Kode yang dipakai ulang: `routes/admin/user-roles.route.ts`, `lib/role-actions.ts`, `lib/account-status.ts`, `components/admin/role-action-dialog.tsx`

## Keputusan Kecil Selama Eksekusi
- Spike 2026-11-10: sandi baru disimpan lewat `auth.$context` (`password.hash`); terbukti login sandi baru berhasil dan sandi lama gagal. Pada versi akhir, tabel `account` diperbarui di transaksi yang sama (audit keamanan LOW-1).
- Pembatas laju: `rateLimitPlugin` diperluas (`match`/`method`, kompatibel mundur) agar aksi dengan id di tengah path punya ember sendiri.
- Penjaga Super Admin terakhir tidak bisa dipicu lewat endpoint (pemanggil harus Super Admin aktif dan tak boleh mengubah dirinya); aturan murninya diuji terpisah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review` atau subagent `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Uji manual di browser belum dilakukan (tes otomatis: rute, aturan murni, dialog web).
- Akun staf tidak bisa dihapus (hanya nonaktif); nama/email tidak bisa diubah; tidak ada "wajib ganti sandi saat login pertama".
- Sandi sementara dikirim via email (tersimpan di data job pg-boss sampai diarsip).
- Deadlock langka antar dua Super Admin yang saling menurunkan bersamaan menghasilkan 500 yang bisa diulang (pola lama Fase 189H).

## Ringkasan Hasil (isi pas fase Done)

Ubah tingkat staf (Admin ↔ Super Admin, atomik, pratinjau + konfirmasi email) dan reset kata sandi (sandi sementara sekali tampil, sesi dicabut, email) sudah ada di halaman Tim Internal lewat menu aksi per baris; hapus sengaja tidak ada. Tes baru: 14 tes rute, 5 tes aturan murni, 2 tes pembatas laju, 9 tes web; suite penuh API 2763 lolos dan web 609 lolos; typecheck nol. Audit keamanan: 0 Critical/High/Medium, 4 Low (2 diperbaiki, 2 dicatat), 4 Info. Belum dirilis.

