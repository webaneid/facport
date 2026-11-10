# Architecture — Kelola Akun Tim Internal (Fase 216)

> Status: **RENCANA** (2026-11-10). Keputusan: ADR-0053. Rencana & status: `docs/phases/phase-216-kelola-akun-tim-internal.md`.
> Halaman: `admin.<domain>/staff` ("Tim Internal"). Model role: `architecture-user-roles.md`. Aksi peran customer: `architecture-account-lifecycle.md`.

## 1. Kondisi sekarang (diverifikasi ke kode 2026-11-10)
| Kemampuan | Ada? | Di mana |
|---|---|---|
| Daftar + cari tim internal | Ya | `GET /admin/staff` (`users.view`), `app/admin/(protected)/staff/page.tsx` |
| Tambah staf (sandi sementara via email) | Ya | `POST /admin/staff` (`users.manage`) |
| Nonaktifkan / aktifkan | Ya | `PATCH /admin/users/:id/disable|enable` → `lib/account-status.ts` |
| Aksi peran dua arah (grant/revoke) | Ya, tetapi hanya UI di halaman Pengguna | `routes/admin/user-roles.route.ts`, `lib/role-actions.ts`, `components/admin/role-action-dialog.tsx` |
| Ubah tingkat staf (Admin ↔ Super Admin) di halaman Tim Internal | **Belum** | — |
| Reset kata sandi staf | **Belum** | — |
| Hapus akun staf | **Sengaja tidak ada** (ADR-0053) | — |

Penamaan penting: role database `admin` = **Super Admin** (semua izin), `staff` = **Admin** (semua KECUALI `users.manage`). Satu akun staf memegang tepat satu dari keduanya (bisa juga memegang `customer`, tidak diubah fase ini).

## 2. Cakupan fase
Masuk: ubah tingkat staf (atomik), reset kata sandi, pemasangan aksi di halaman Tim Internal (menu aksi per baris), nonaktifkan/aktifkan tetap seperti sekarang.
Tidak masuk (disengaja): hapus permanen/anonimisasi staf, ubah nama/email staf, aksi massal, role kustom, perubahan model izin.

## 3. Aturan keselamatan (sama dengan Fase 189H, dipakai ulang)
| Aturan | Ubah tingkat | Reset sandi |
|---|---|---|
| Hanya Super Admin (`users.manage`), server-side | ya | ya |
| Tidak boleh pada akun sendiri | `CANNOT_CHANGE_OWN_ROLE` | `CANNOT_RESET_OWN_PASSWORD` (pakai ganti sandi biasa) |
| Target harus akun staf (role `admin` atau `staff`) | `NOT_STAFF` | `NOT_STAFF` |
| Akun anonim ditolak | `ACCOUNT_ANONYMIZED` | `ACCOUNT_ANONYMIZED` |
| Super Admin aktif TERAKHIR tidak boleh diturunkan | `CANNOT_REMOVE_LAST_SUPER_ADMIN` (kunci baris semua Super Admin aktif, urut id) | — |
| Menaikkan akun nonaktif ditolak | `ACCOUNT_DISABLED` | `ACCOUNT_DISABLED` |
| Konfirmasi ketik email target, dicek di server | `CONFIRM_MISMATCH` | `CONFIRM_MISMATCH` |
| Tidak ada perubahan bila sudah di tingkat itu | `noop` (tanpa audit/sesi/email) | — |
| Sesi target dicabut seketika | ya | ya |
| Email pemberitahuan | generik, tanpa PII berlebih | berisi sandi sementara, job `sensitive` (tidak masuk log) |
| Audit | `role_change {action:"switch_tier", from, to}` | `update {passwordReset:true}` (TANPA sandi) |
| Pembatasan laju | 10/menit | 5/menit |

## 4. Endpoint (baru, di `routes/admin/staff.route.ts`)
| Endpoint | Fungsi |
|---|---|
| `POST /admin/staff/:id/role/preview` `{role: "admin"\|"staff"}` | Pratinjau: peran sebelum/sesudah, apakah noop, peringatan (mis. "Super Admin aktif tersisa N"). Tidak menulis apa pun. |
| `POST /admin/staff/:id/role` `{role, confirm}` | Terapkan dalam SATU transaksi (kunci baris target + Super Admin aktif). Mengganti role `admin`↔`staff` saja; role lain (mis. `customer`) tidak disentuh. |
| `POST /admin/staff/:id/reset-password` `{confirm}` | Buat sandi sementara (acak 12 byte), hash lewat Better Auth, cabut sesi, kirim email, kembalikan sandi SEKALI. |

Aturan murni (tanpa DB) ditambahkan di `lib/role-actions.ts`: `planTierSwitch(current, target)` → `{ ok, noop, before, after } | { ok:false, code }`, memakai `canRemoveSuperAdmin` dan `confirmMatches` yang sudah ada. Rute hanya mengurus kunci baris, transaksi, sesi, email, dan audit (pola `user-roles.route.ts`).

## 5. UI (`app/admin/(protected)/staff/page.tsx`)
- Kolom Aksi diganti menu aksi per baris, hanya untuk Super Admin (`<Can permission="users.manage">`): **Ubah role**, **Reset kata sandi**, **Nonaktifkan/Aktifkan** (yang sudah ada dipindahkan ke menu).
- Baris akun sendiri: aksi ubah role/reset/nonaktifkan dinonaktifkan dengan keterangan alasan.
- `StaffRoleDialog` (pola `RoleActionDialog`): pratinjau → ketik email → terapkan; galat dipetakan ke pesan Indonesia (pola `roleActionError`).
- `ResetPasswordDialog`: peringatan, ketik email, terapkan, lalu tampilkan sandi sementara SEKALI dengan tombol salin (pola `AddStaffDialog`).
- Admin (role `staff`) tetap hanya melihat daftar tanpa aksi.

## 6. Yang harus dibuktikan di awal eksekusi (spike)
1. **Cara menyimpan sandi baru** di Better Auth tanpa plugin admin (`lib/auth.ts` tidak memakai plugin admin): gunakan hasher resmi (`auth.$context` → `password.hash`) lalu perbarui `account.password` provider `credential`, atau API Better Auth yang setara. Diverifikasi dengan tes yang benar-benar login memakai sandi baru. Jangan menulis hash sendiri.
2. Akun staf tanpa baris `account` credential (mis. login Google saja): reset tidak berlaku → kode galat jelas (`NO_PASSWORD_LOGIN`), bukan membuat kredensial diam-diam.

## 7. Pengujian
- Unit: `planTierSwitch` (semua kombinasi, noop, diri sendiri bukan urusan lib, Super Admin terakhir).
- Rute (pola `user-roles.route.test.ts`): 403 untuk role `staff`; tiap kode galat di § 3; atomik (gagal di tengah tidak mengubah role); sesi dicabut; audit tanpa sandi; dua Super Admin bersamaan menurunkan satu sama lain tidak boleh meninggalkan nol Super Admin aktif.
- Web: dialog (pratinjau, konfirmasi, galat), tombol akun sendiri nonaktif.
- Wajib: `bun run typecheck` nol, skill `security-review`, dan karena menyangkut eskalasi hak + kredensial: subagent `security-auditor`.

## 8. Known Limitations (disengaja)
- Akun staf tidak bisa dihapus; salah-input hanya dinonaktifkan.
- Sandi sementara lewat email (risiko sama dengan pembuatan staf). Pengerasan kemudian: tautan reset sekali pakai.
- Tidak ada "wajib ganti sandi saat login pertama" (belum ada mekanismenya di sistem).
- Nama/email staf tidak bisa diubah.
