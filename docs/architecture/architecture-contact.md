# Architecture — Kontak Akun (Nama Perusahaan, Telepon, WhatsApp)

> Fase 189A, ADR-0044 (Accepted). Sumber kebenaran tunggal untuk data kontak PENGGUNA di Facport dan standar format nomornya.
> Latar kebutuhan client: `architecture-admin-insight.md` § 3 butir 8. Standar nomor DISALIN dari project Jalajogja
> (`/Users/webane/sites/jalajogja/docs/arsitektur-kontak.md`) — kalau standar di sana berubah, bandingkan, jangan diam-diam menyimpang.

## Prinsip
1. **Data milik AKUN manusia, BUKAN Data Usaha.** `user.company_name`, `user.phone`, `user.whatsapp`. `data_usaha` (workspace Accurate) punya `name` sendiri dan TIDAK menyimpan kontak pelanggan. Nama Perusahaan tidak diturunkan dari nama Data Usaha (keputusan user 2026-10-12, prinsipil). Berlaku untuk SEMUA akun customer — pemilik maupun User Tambahan.
2. **Satu format: E.164 dengan tanda `+`** (`+6281234567890`). Salah: `08123…`, `6281…` tanpa `+`, spasi/tanda baca. Total 8–15 digit setelah `+`, kode negara tidak diawali 0 (`E164_PATTERN = /^\+[1-9]\d{7,14}$/`).
3. **Wajib di antarmuka, nullable di DB.** Akun lama/Google/undangan belum punya; kewajiban dijaga form daftar + modal, TIDAK dengan menolak sign-up di API (klien lama tetap diterima).
4. **Server tidak percaya klien**: semua jalur tulis memvalidasi + menormalisasi lewat `parseContact` (`apps/api/src/lib/phone.ts`).

## Kolom (migrasi `0048_user_contact`)
| Kolom | Tipe | Catatan |
|---|---|---|
| `company_name` | `varchar(200)` null | dirapikan: trim + spasi ganda jadi satu |
| `phone` | `varchar(20)` null | E.164 |
| `whatsapp` | `varchar(20)` null | E.164; UI default "sama dengan nomor telepon" |
Kolom custom di `auth.schema.ts` (pola sama `disabled`); TIDAK ikut objek sesi Better Auth → dibaca langsung dari tabel (`GET /me`).

## Helper (dua salinan, kasus tes paritas)
| Fungsi | API `apps/api/src/lib/phone.ts` | Web `apps/web/lib/phone.ts` |
|---|---|---|
| `normalizePhone` | ya (WAJIB saat simpan) | ya |
| `isValidE164` / `E164_PATTERN` | ya | ya |
| `parseContact`, `hasContactKeys`, `isContactComplete` | ya | — |
| `displayPhone` (+62… → 08…), `toWaDigits`, `waLink` | — | ya |
Aturan baku: input → `PhoneInput`; simpan → `normalizePhone` di server; tampil → `displayPhone`; tautan WhatsApp → `waLink`/`toWaDigits` dari nilai E.164 ASLI, **jangan** dari hasil `displayPhone` (kehilangan kode negara — bug yang pernah terjadi di Jalajogja; ada tes regresi). Nomor tak sah → tidak ada tautan.

## Alur
- **Daftar email** (`register-form.tsx`): `ContactFields` (Nama Perusahaan, Telepon, WhatsApp + centang "sama dengan telepon"). Dikirim di body `POST /api/auth/sign-up/email`. Intercept `app.ts`: ada kunci kontak → ketiganya wajib sah (422 `INVALID_CONTACT` + `field`, SEBELUM Better Auth); sukses → disimpan ke baris user yang benar-benar ada. Tanpa kunci kontak → diterima (kolom null). Email duplikat tetap 409 dan kontak akun lama tidak tertimpa.
- **Akun yang belum lengkap** (Google, lama, akun tambahan hasil undangan): `GET /me` mengembalikan `profileComplete=false` (definisi tunggal `isContactComplete`: ketiganya terisi + E.164 sah) → layout pelanggan (`app/app/(protected)/layout.tsx`) dan `app/app/pilih-usaha/page.tsx` merender `ProfileCompletionGate`: dialog TIDAK bisa ditutup (tanpa X/ESC/klik luar), aksi hanya Simpan dan Keluar. Selama profil belum lengkap, popup gerbang koneksi Accurate tidak dirender (menghindari dua modal berebut fokus).
- **Simpan sendiri**: `PATCH /me/contact` (auth; id dari sesi → tanpa IDOR). Dua pintu: modal Lengkapi Profil (pelanggan, wajib) dan kartu **Data Diri** di `/profile` (pelanggan & admin, Fase 189I: Nama, Email baca-saja, Perusahaan, Telepon, WhatsApp; kontak dikirim hanya bila berubah, kontak kosong tak disentuh tidak divalidasi supaya admin/staf bisa mengganti nama saja).
- **Koreksi admin**: `PATCH /admin/users/:id/contact` (`users.manage` = Super Admin), audit log nilai lama→baru. Tampilan admin: detail user (kartu kontak + tautan WhatsApp `wa.me` tab baru + dialog "Ubah kontak"), daftar Pengguna (Perusahaan sebagai baris kecil di sel Nama, ikon WhatsApp di kolom Aksi — tanpa kolom baru agar tabel tidak melebar).
- **Bukan pemblokiran akses**: hanya lapisan tampilan web; API dan import berjalan tetap berjalan. Admin/staf yang hanya memakai surface `admin.` tidak ditanya.

## Yang SENGAJA tidak dibuat
Unik per nomor (satu nomor boleh dipakai banyak akun); verifikasi OTP nomor; subkategori; pengumuman/masa tenggang sebelum modal; kolom penanda "sudah dialihkan".

## Keamanan
Validasi/normalisasi server-side di tiga jalur tulis; kontak tidak ditulis ke log Pino; hanya admin berizin (`users.view` melihat, `users.manage` mengubah) yang melihat kontak orang lain; tautan WhatsApp/telepon hanya dari nilai tervalidasi; perubahan oleh admin tercatat di `audit_logs`.

## Referensi
- ADR: `docs/decisions/adr-0044-data-kontak-akun-dan-penanda-internal.md`
- Phase doc: `docs/phases/phase-189a-profil-kontak-akun.md`
- Kebutuhan & rencana induk: `architecture-admin-insight.md`
