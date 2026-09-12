# Fase 106 — Batas Device/Sesi Login per User

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Fase pertama dari rencana besar `docs/architecture/architecture-user-tambahan.md`
(§ Fase A) — dikerjakan di branch lokal `feature/data-usaha-restructure`,
**TIDAK di-push** sampai user review sepulang meeting. Admin bisa atur
batas jumlah sesi login bersamaan per user (default 1), login di device
baru melebihi batas = otomatis logout device paling lama. Sekalian
perbaiki gap keamanan nyata yang ditemukan saat riset: guard akun
`disabled` cuma jalan untuk login password, tidak untuk Google.

## Scope
- [x] `apps/api/src/lib/user-status.ts` (BARU) — ekstrak `isDisabled()`
      dari `permission.ts` ke file bersama (hindari circular import
      `auth.ts` ↔ `permission.ts`).
- [x] `apps/api/src/lib/session-limit.ts` (BARU) — baca setting, evict
      sesi paling lama.
- [x] `apps/api/src/lib/auth.ts` — `databaseHooks.session.create.before`:
      cek `disabled` + evict sesi berlebih.
- [x] `apps/api/src/app.ts` — **KEPUTUSAN BERUBAH saat eksekusi**: guard
      manual TIDAK dipensiunkan (rencana awal), TETAP dipertahankan apa
      adanya. Alasan: hook Better Auth kalau `before` return `false`
      cuma menghasilkan 401 generik (`FAILED_TO_CREATE_SESSION`), BEDA
      dari 403+`ACCOUNT_DISABLED` yang sudah diuji `app.test.ts` —
      mengganti akan mengubah kontrak API yang sudah teruji tanpa
      manfaat nyata. Hook baru jadi TAMBAHAN, bukan pengganti, khusus
      menutup celah Google OAuth (app.ts tidak pernah cover jalur itu).
- [x] `apps/api/src/routes/settings.route.ts` — key
      `security.maxDevicesPerUser` + validasi range 1-10.
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` — kartu
      "Keamanan" baru.
- [x] Test: `user-status.test.ts` (3 test), `session-limit.test.ts`
      (8 test — default fallback, di bawah/tepat/di atas batas, nilai
      setting cacat, isolasi antar-user), `settings.route.test.ts`
      (2 test tambahan). Verifikasi Google-login-disabled-account CUKUP
      lewat pembacaan kode + unit test hook-nya (`isDisabled` dicek
      duluan, urutan kondisional eksplisit) — mensimulasikan OAuth Google
      asli di test butuh mock provider eksternal yang tidak sepadan
      manfaatnya vs risiko false-confidence dari mock yang tidak akurat.
- [x] Typecheck + test + security review.

## Referensi
- `docs/architecture/architecture-user-tambahan.md` § Fase A.

## Keputusan Kecil Selama Eksekusi
- **Guard `app.ts` TIDAK dipensiunkan** (rencana awal architecture doc
  bilang "gantikan") — ditemukan saat eksekusi: hook Better Auth kalau
  `before` return `false` cuma hasilkan 401 generik, beda kontrak dari
  403+`ACCOUNT_DISABLED` yang sudah diuji. Keduanya dipertahankan
  berdampingan (lihat detail di § Scope app.ts di atas).
- `isDisabled()` diekstrak ke `lib/user-status.ts` (bukan diimpor
  langsung dari `permission.ts`) untuk hindari circular import
  (`permission.ts` import `auth`, `auth.ts` sekarang butuh `isDisabled`).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (api+web)
- [x] Security review dijalankan — nol temuan Critical/High
- [x] Temuan Critical/High diperbaiki — tidak ada temuan
- [x] `docs/PROGRESS.md` diupdate
- [x] **TIDAK push** — commit lokal saja di branch `feature/data-usaha-restructure`

## Known Limitations
- Race condition kecil pada login BERSAMAAN dari 2 device dalam waktu
  sangat berdekatan bisa sesaat overshoot 1 sesi dari batas (self-correct
  di login berikutnya) — soft-limit best-effort, bukan celah keamanan
  (dicatat eksplisit di security review, tidak diperbaiki dengan locking
  tambahan karena kompleksitas tidak sepadan).
- Tidak ada halaman "device saya" self-service (lihat cookieCache 5
  menit sebagai known limitation lain) — sesuai rencana architecture doc,
  scope-cut yang sama seperti Fase 22.

## Ringkasan Hasil
Setting `security.maxDevicesPerUser` (default 1, range 1-10) ditambahkan
ke Admin Settings — kartu "Keamanan" baru. Login baru yang melebihi
batas otomatis meng-evict sesi paling lama (`databaseHooks.session.create.before`
di `lib/auth.ts`), berlaku untuk SEMUA jalur login (password DAN Google
OAuth). Bonus: celah keamanan nyata ditemukan & diperbaiki — akun
`disabled` sebelumnya masih bisa dapat sesi lewat Google OAuth (guard
lama di `app.ts` cuma cover password) — sekarang tertutup lewat hook
yang sama. Typecheck 0 error (api+web), lint 0 error, test suite penuh
666 API + 57 web pass/0 fail (termasuk 13 test baru), security review
nol temuan Critical/High (1 catatan minor: race condition kecil pada
login bersamaan, bukan celah keamanan). Commit lokal di branch
`feature/data-usaha-restructure`, **BELUM push** sesuai instruksi user.
