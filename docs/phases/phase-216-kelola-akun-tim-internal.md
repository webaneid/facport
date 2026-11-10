# Fase 216 — Kelola Akun Tim Internal (ubah role, reset kata sandi)

**Status:** Planned
**Mulai:** -
**Selesai:** -

## Tujuan
Halaman `/staff` (Tim Internal) saat ini hanya bisa melihat, menambah, dan menonaktifkan staf. Super Admin perlu bisa **mengubah tingkat akun staf** (Admin ↔ Super Admin) dan **mereset kata sandi staf**, tanpa SQL manual. Hapus permanen sengaja tidak dibuat (hanya nonaktifkan) agar jejak audit utuh. Dikerjakan sebagai fase sendiri karena menyangkut eskalasi hak akses dan kredensial (butuh audit keamanan), terpisah dari Fase 214/215 yang sedang menunggu verifikasi.

## Scope
- [ ] Spike: cara menyimpan sandi baru lewat Better Auth (hasher resmi) + uji login dengan sandi baru; tangani akun tanpa kredensial sandi (`NO_PASSWORD_LOGIN`)
- [ ] `lib/role-actions.ts`: `planTierSwitch(current, target)` murni + tes unit
- [ ] `POST /admin/staff/:id/role/preview` dan `POST /admin/staff/:id/role` (atomik, kunci baris, sesi dicabut, email, audit `role_change`)
- [ ] `POST /admin/staff/:id/reset-password` (sandi sementara, hash Better Auth, sesi dicabut, email `sensitive`, audit tanpa sandi, laju 5/menit)
- [ ] Tes rute untuk setiap aturan di `architecture-staff-management.md` § 3, termasuk uji balapan dua Super Admin
- [ ] UI: menu aksi per baris (Ubah role, Reset kata sandi, Nonaktifkan/Aktifkan), `StaffRoleDialog`, `ResetPasswordDialog`, aksi akun sendiri dinonaktifkan
- [ ] Tes web untuk dialog dan keadaan akun sendiri
- [ ] Update `architecture-user-roles.md` dan ADR-0045 (catatan: staf tidak dihapus, rujuk ADR-0053)
- [ ] Typecheck, `security-review`, `security-auditor`, uji manual di dev (kedua role)

## Di Luar Scope (disengaja)
Hapus/anonimisasi staf; ubah nama/email staf; aksi massal; role kustom; "wajib ganti sandi saat login pertama"; reset lewat tautan sekali pakai.

## Referensi
- Architecture doc: `docs/architecture/architecture-staff-management.md`
- ADR: `docs/decisions/adr-0053-tim-internal-ubah-role-reset-sandi-tanpa-hapus.md`; terkait ADR-0027, ADR-0045
- Kode yang dipakai ulang: `routes/admin/user-roles.route.ts`, `lib/role-actions.ts`, `lib/account-status.ts`, `components/admin/role-action-dialog.tsx`

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review` atau subagent `security-auditor`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
