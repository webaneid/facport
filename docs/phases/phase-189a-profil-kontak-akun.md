# Fase 189A — Profil Kontak Akun (Nama Perusahaan, Telepon, WhatsApp)

**Status:** Done
**Mulai:** 2026-10-12
**Selesai:** 2026-10-12

## Tujuan
Setiap AKUN (bukan Data Usaha) punya `Nama Perusahaan`, `Telepon`, `WhatsApp`, diisi saat daftar email atau lewat modal Lengkapi Profil yang tidak bisa ditutup bagi akun yang masih kosong. Admin bisa melihat dan mengklik nomor WhatsApp untuk menghubungi pelanggan. Fondasi butir 8 kebutuhan client; dikerjakan paling awal karena data baru terkumpul SETELAH fase ini live. Keputusan: ADR-0044 (Accepted). Induk: `phase-189-insight-pelanggan-admin.md`, `architecture-admin-insight.md` § 4.1.

## Mode kerja
Menyentuh jalur auth (sign-up) + migrasi + UI customer → eksekusi langsung di sesi utama (bukan subagent), rencana ini jadi gerbang SOP; langkah pertama T0 memverifikasi asumsi sebelum desain dikunci.

## Scope
**T0 — Verifikasi teknis (sebelum kode fitur)**
- [x] T0a Better Auth 1.7.1 menerima body sign-up dengan field tak dikenal tanpa error (uji nyata di dev, bukan asumsi).
- [x] T0b Baca `pilih-usaha/page.tsx` + `safeSignUpEmail` + `GET /admin/users/:id` untuk titik pasang gerbang dan bentuk respons.
- [x] T0c Komponen `Dialog` facport: bisa dibuat tidak bisa ditutup (tanpa tombol X, ESC, klik luar)?

**Backend (`apps/api`)**
- [x] B1 Skema `user`: `company_name varchar(200)`, `phone varchar(20)`, `whatsapp varchar(20)` (nullable; `auth.schema.ts`, pola field custom seperti `disabled`); migrasi Drizzle via `db:generate` (cek `when` jurnal > migrasi terakhir, lihat SOP); verifikasi kolom ada setelah migrate.
- [x] B2 `lib/phone.ts`: `normalizePhone`, `isValidE164` (+ tanda wajib, 8–15 digit, tanpa spasi), `contactInputSchema` (companyName trim 1–200; phone & whatsapp E.164). Salinan standar Jalajogja (`docs/arsitektur-kontak.md`); tes paritas.
- [x] B3 Intercept `POST /api/auth/sign-up/email` (`app.ts`): baca `companyName/phone/whatsapp` dari body; bila ada tapi tidak valid → 422 `INVALID_CONTACT` SEBELUM Better Auth; bila sukses → simpan ke baris user yang benar-benar ada. Body tanpa field kontak tetap diterima (klien lama/cache; modal yang menangkap).
- [x] B4 `GET /me`: tambah `companyName`, `phone`, `whatsapp`, `profileComplete` (satu definisi di server: ketiganya terisi).
- [x] B5 `PATCH /me/contact` (auth, `t.Object`, normalisasi, simpan; hanya diri sendiri).
- [x] B6 Admin: respons `GET /admin/users` dan detail user memuat kontak; `PATCH /admin/users/:id/contact` (`users.manage`) + audit log (nilai lama→baru, tanpa log PII ke Pino).
- [x] B7 Tes API (bun): validasi nomor, sign-up dengan/tanpa kontak/kontak salah, duplikat email tetap 409, `/me`, `PATCH /me/contact`, izin admin, audit, IDOR. Bersihkan baris test di DB dev.

**Web (`apps/web`)**
- [x] W1 Port `PhoneInput` (pemilih kode negara, default +62, keluaran E.164) + `lib/phone.ts` (`normalizePhone`, `displayPhone`, `toWaDigits`), disesuaikan token UI facport (`Input`, bukan kelas Jalajogja); label opsional.
- [x] W2 `ContactFields` bersama: Nama Perusahaan, Telepon, WhatsApp + kotak centang "Sama dengan nomor telepon"; skema zod bersama.
- [x] W3 `register-form.tsx`: tambah `ContactFields`, kirim ke sign-up, tampilkan galat `INVALID_CONTACT`.
- [x] W4 `ProfileCompletionGate`: modal tidak bisa ditutup (ESC/klik luar/tombol X dinonaktifkan) bila `!profileComplete`; hanya aksi Simpan dan Keluar; dipasang di `app/app/(protected)/layout.tsx` dan `app/app/pilih-usaha/page.tsx`. Tanpa pemblokiran API. Admin/staf yang tidak membuka `app.` tidak terpengaruh.
- [x] W5 Admin: detail user menampilkan Perusahaan/Telepon/WhatsApp (WhatsApp = tautan `wa.me/<toWaDigits(E.164 asli)>`, tab baru), dialog "Ubah kontak" (hanya `users.manage`); daftar Pengguna menambah kolom ringkas Perusahaan + ikon WhatsApp (tabel tidak melebar).
- [x] W6 Tes (Testing Library): PhoneInput, ContactFields (centang sinkron), register form, gate tidak bisa ditutup, tautan WhatsApp admin.

**Dokumen**
- [x] D1 `docs/architecture/architecture-contact.md` (standar nomor, kolom, alur, gerbang) + baris peta di `CLAUDE.md`; `docs/glossary.md` (Nama Perusahaan vs Data Usaha); update `architecture-admin-insight.md` § 4.1 status.
- [x] D2 `docs/PROGRESS.md`/phase 189 tabel sub-fase, `docs/lessons-learned.md` bila ada temuan.

## Keputusan desain (turunan ADR-0044)
- Nomor milik akun manusia; berlaku semua akun customer termasuk User Tambahan. Admin/staf yang hanya memakai `admin.` tidak ditanya.
- Kolom nullable di DB karena data lama kosong; WAJIB dijaga di antarmuka (form daftar + modal), bukan dengan menolak sign-up di API (kompatibel klien lama, jalur Google/undangan tidak berubah).
- Jalur undangan User Tambahan dan Google TIDAK diubah; mereka ditangkap modal pada kunjungan pertama ke `app.`.
- Satu nomor boleh dipakai banyak akun (tanpa unique). Admin boleh mengoreksi (tercatat audit).
- Tautan `wa.me` HANYA dibangun dari E.164 tervalidasi (`^\+\d{8,15}$`), dari nilai asli, tidak dari hasil `displayPhone`.

## Di luar scope
- Flag `is_internal`, kontrol keuangan (189G); halaman/API Insight (189C–E); aksi massal & hapus akun (189H); verifikasi OTP nomor; subkategori internal.

## Keamanan (untuk security review penutup)
Validasi server-side semua input; tidak ada PII di log; IDOR (`/me/contact` hanya diri sendiri; admin butuh `users.manage`); tautan `wa.me` tidak bisa disuntik; rate limit jalur auth tetap berlaku; audit log perubahan oleh admin; uji bahwa user biasa tidak bisa mengubah akun lain.

## Referensi
- ADR: `docs/decisions/adr-0044-data-kontak-akun-dan-penanda-internal.md`
- Standar nomor (sumber): `/Users/webane/sites/jalajogja/docs/arsitektur-kontak.md`, `apps/web/components/ui/phone-input.tsx`, `apps/web/lib/phone.ts`
- Rancangan induk: `docs/architecture/architecture-admin-insight.md` § 2, 4.1

## Keputusan Kecil Selama Eksekusi
- T0a terbukti lewat tes: Better Auth 1.7.1 menerima kunci body tak dikenal tanpa error (tanpa `additionalFields`), jadi kontak divalidasi di intercept `app.ts` dan disimpan sesudah sign-up, pola yang sama dengan penetapan role customer.
- Dialog facport sudah punya `hideClose` dan meneruskan prop Radix, jadi modal tak bisa ditutup cukup dengan mencegah ESC/klik luar/interaksi luar.
- Daftar admin TIDAK mendapat kolom baru: Nama Perusahaan = baris kecil di sel Nama, WhatsApp = ikon di kolom Aksi (tabel tidak melebar).
- `PhoneInput` diturunkan dari prop `value` (tanpa state salinan) karena aturan lint React Compiler melarang setState di effect.
- Popup gerbang Accurate ditunda selama profil belum lengkap (dua modal berebut fokus).
- Gerbang memakai `profileComplete === false` (bukan `!`) agar jeda deploy (web baru, API lama) tidak memunculkan modal untuk semua pelanggan.
- Perbaikan dari audit: log VALIDATION tanpa nilai; `tel:` hanya dari E.164 sah; nama perusahaan menolak karakter kontrol/bidi; kegagalan simpan kontak setelah sign-up tidak jadi 500.
- Skrip `db:cleanup-test-data` ditambal (dua tabel AutoProduksi belum dicakup) karena gagal FK 23503 saat membersihkan run tes — celah lama, di luar scope fitur tetapi diperlukan untuk menutup fase.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Lint bersih
- [x] Tes API + web hijau; data test dibersihkan dari DB dev
- [x] Security review (skill `security-review`; ≥4 file besar → subagent `security-auditor`)
- [x] Temuan Critical/High diperbaiki; Medium/Low dicatat di `docs/lessons-learned.md`
- [x] Dokumen D1–D2 selesai; `docs/PROGRESS.md` diupdate
- [x] Catat: UI belum dilihat di browser (tidak ada kredensial) — verifikasi visual oleh user belum dilakukan

## Known Limitations
- Tampilan modal, form daftar, kartu kontak, dan ikon WhatsApp BELUM dilihat di browser; hanya diuji lewat Testing Library/happy-dom. Alur daftar → verifikasi email → login tidak diuji end-to-end di lokal (cookie `.localhost`, lihat komentar `register-form.tsx`).
- Kontak lama dengan format non-E.164 (bila ada dari SQL manual) dianggap tidak lengkap dan tidak punya tautan WhatsApp/telepon.
- `audit_logs` menyimpan kontak lama dan baru dari koreksi admin (PII): kebijakan hapus/anonimisasi akun (ADR-0045, Fase 189H) HARUS mencakup `audit_logs`.
- Staf (`users.view`) melihat kontak pelanggan di panel admin — konsisten dengan keputusan user (semua admin boleh melihat); izin `insights.view` untuk Insight menyusul di 189C.
- Ketidaklengkapan sign-up (kontak tersimpan gagal setelah akun dibuat) hanya dicatat; modal menangkapnya.

## Ringkasan Hasil
Setiap akun kini punya Nama Perusahaan, Telepon, dan WhatsApp (E.164 dengan `+`), milik AKUN bukan Data Usaha. Form daftar email mewajibkannya; akun yang kosong (Google, lama, akun tambahan) melihat modal Lengkapi Profil yang tidak bisa ditutup di layout pelanggan dan `/pilih-usaha`, tanpa memblokir API. Admin melihat kontak di detail user (tautan WhatsApp `wa.me`, `tel:`), Perusahaan + ikon WhatsApp di daftar, dan Super Admin bisa mengoreksi (audit log). Migrasi aditif `0048_user_contact`.

**Verifikasi:** typecheck API+web bersih; lint web bersih; tes API 2.165 lulus (setelah perbaikan audit) (+ tes baru: `lib/phone`, sign-up kontak, `/me/contact`, admin contact, log tanpa PII); tes web 453 lulus (+ PhoneInput, ContactFields, gerbang modal, kartu kontak admin, form daftar). Data uji dibersihkan dari DB dev.
**Security review:** subagent `security-auditor` — 0 Critical, 0 High, 0 Medium; 3 Low (log validasi memuat nilai [terbukti nyata → diperbaiki + tes regresi], `tel:` tanpa validasi [diperbaiki], karakter kontrol di nama [diperbaiki]); 3 Info (kegagalan simpan setelah sign-up → non-fatal; PII di audit_logs → dicatat untuk 189H; staf melihat PII → sesuai keputusan).
**Commit:** `d982b1d` (API), `92868de` (web), lalu perbaikan audit + dokumen.
