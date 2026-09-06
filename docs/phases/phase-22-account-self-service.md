# Fase 22 — Account Self-Service (Profile Settings + Ganti Password)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase TERAKHIR dari inisiatif 4-fase (19-22) Design System Admin. User
dropdown di topbar sebelumnya cuma "Logout" — user eksplisit pilih fitur
ini di-include (lewat `AskUserQuestion` saat perencanaan Fase 19) karena
walau ini FITUR baru (bukan cuma polish visual), backend-nya (Better
Auth `change-password`/`update-user`) sudah siap pakai sejak awal,
tinggal disambungkan ke UI.

Referensi: ADR-0023, `docs/architecture/architecture-auth.md`.

## Scope
- [x] `apps/web/components/app-shell/topbar.tsx` — tambah menu item
      "Profil & Ganti Password" di `DropdownMenu` (sebelum "Logout")
- [x] `apps/web/components/account/profile-settings.tsx` (baru) —
      komponen shared: form ganti nama + form ganti password
      (`zod`+`react-hook-form`, pola sama `components/auth/register-form.tsx`)
- [x] `apps/web/app/admin/(protected)/profile/page.tsx` (baru) — wrapper
      tipis surface admin
- [x] `apps/web/app/app/(protected)/profile/page.tsx` (baru) — wrapper
      tipis surface app (§ `proxy.ts` rewrite `/${surface}${pathname}` —
      1 URL path yang sama butuh 1 file page.tsx PER surface, tidak bisa
      1 file lintas route group Next.js, makanya komponen di-share tapi
      page wrapper-nya 2)
- [x] TIDAK ada endpoint baru di `apps/api` — reuse
      `POST /api/auth/change-password` dan `POST /api/auth/update-user`
      (Better Auth bawaan, sudah aktif sejak `emailAndPassword: {enabled:
      true}` di `lib/auth.ts`)

## Referensi
- Architecture doc: `docs/architecture/architecture-auth.md`
- ADR: tidak ada ADR baru (reuse Better Auth existing, bukan keputusan
  arsitektur baru)

## Keputusan Kecil Selama Eksekusi
- **`revokeOtherSessions: true` saat ganti password** — password baru
  otomatis mengeluarkan sesi login di PERANGKAT LAIN (bukan cuma yang
  sedang dipakai). Konsisten dengan tujuan ganti password itu sendiri
  (skenario umum: curiga password bocor) — dikomunikasikan eksplisit di
  UI ("Mengubah password akan mengeluarkan sesi login di perangkat
  lain.") supaya tidak mengejutkan user.
- **Email TIDAK bisa diubah sendiri dari halaman ini** — sengaja
  ditampilkan read-only dengan keterangan "hubungi admin". Better Auth
  punya endpoint `change-email` terpisah (butuh alur verifikasi ulang),
  di luar scope minimal fase ini (user cuma minta "Profile Settings +
  Ganti Password", bukan ganti email) — bisa ditambah nanti kalau ada
  kebutuhan nyata.
- **Validasi password minimal 8 karakter di frontend (`zod`) COCOK
  dengan default Better Auth** (`minPasswordLength` bawaan = 8, TIDAK
  di-override di `lib/auth.ts`) — dicatat sebagai coupling implisit:
  kalau default library ini berubah di update Better Auth berikutnya,
  validasi frontend perlu disamakan manual (tidak ada 1 sumber kebenaran
  bersama untuk angka ini di kode).
- **1 komponen `ProfileSettings` di-share, 2 page.tsx wrapper** (bukan 1
  halaman yang entah bagaimana diakses dari 2 subdomain) — konsekuensi
  langsung dari mekanisme `proxy.ts` (rewrite path berdasar host ke
  `/${surface}${pathname}`), didokumentasikan sebagai pola referensi
  pertama untuk halaman lintas-surface di project ini (belum pernah ada
  sebelumnya).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — self-review (4 file, murni frontend,
      TIDAK ada endpoint backend baru — reuse endpoint Better Auth yang
      sudah lama aktif & teraudit sebagai bagian library, bukan kode
      custom baru)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate
- [x] **Verifikasi FUNGSIONAL nyata via `curl` langsung ke
      `POST /api/auth/change-password` dan `/update-user`** (server dev
      lokal sungguhan, bukan mock): password salah → ditolak
      `INVALID_PASSWORD`; password benar → berhasil, password LAMA
      berhenti bisa login, password BARU bisa login; ganti nama →
      berhasil; rate limiting terkonfirmasi aktif (`TOO_MANY_REQUESTS`
      muncul saat request beruntun cepat, sesuai `architecture-security.md`
      untuk endpoint sensitif). Kredensial akun test dikembalikan ke
      nilai semula setelah verifikasi.

## Known Limitations
- **Verifikasi visual browser sungguhan BELUM dilakukan** (ekstensi
  Chrome tidak terhubung sesi ini, sama seperti Fase 21) — form sudah
  diverifikasi FUNGSIONAL lewat `curl` langsung ke endpoint yang sama
  persis dipanggil `authClient`, tapi tampilan form/validasi
  client-side/toast belum pernah dilihat di browser sungguhan.
- **Ganti email tidak didukung dari halaman ini** — sengaja, lihat
  Keputusan Kecil.
- **Tidak ada halaman "riwayat sesi aktif"** (device mana saja yang
  login) — Better Auth punya endpoint untuk ini juga, tapi di luar scope
  minimal yang diminta user.

## Ringkasan Hasil
Fase TERAKHIR dari inisiatif 4-fase (19-22) Design System Admin. User
dropdown topbar sekarang punya "Profil & Ganti Password" (sebelumnya
cuma "Logout") — mengarah ke halaman baru berisi 2 form: ganti nama, dan
ganti password (current+new+confirm, validasi `zod`, pola konsisten
dengan `register-form.tsx` yang sudah ada). TIDAK ada endpoint backend
baru — keduanya reuse endpoint bawaan Better Auth
(`change-password`/`update-user`) yang sudah aktif sejak konfigurasi
`emailAndPassword` awal project, cuma belum pernah disambungkan ke UI.

Karena mekanisme routing 3-surface project ini (`proxy.ts` rewrite host
→ path prefix), halaman baru ini jadi PRESEDEN PERTAMA untuk komponen
yang dipakai lintas 2 surface (admin & app) — 1 komponen
`ProfileSettings` di-share, dibungkus 2 `page.tsx` tipis per surface,
polanya didokumentasikan untuk dipakai lagi kalau ada halaman serupa
nanti.

Verifikasi FUNGSIONAL nyata dilakukan via `curl` langsung ke server dev
(bukan cuma percaya typecheck): password salah ditolak
`INVALID_PASSWORD`, password benar berhasil ganti (password lama
langsung tidak bisa dipakai, password baru bisa), ganti nama berhasil,
DAN rate limiting endpoint sensitif terkonfirmasi aktif
(`TOO_MANY_REQUESTS` muncul natural saat verifikasi, bukan false
confidence dari kode yang "terlihat benar"). Kredensial akun test
dikembalikan ke nilai semula setelah verifikasi selesai.

Typecheck 0 error (apps/api & apps/web — termasuk konfirmasi
`authClient.changePassword`/`updateUser`/`api.me.get()` bertipe benar),
lint 0 error, security review self-review 0 temuan (murni frontend,
tidak ada endpoint baru).

**Verifikasi visual browser sungguhan masih belum dilakukan** (sama
seperti Fase 21) — satu-satunya item yang konsisten tertunda di seluruh
inisiatif 19-22 karena ekstensi Chrome tidak terhubung sepanjang sesi
ini.

**INISIATIF 4-FASE (19-22) DESIGN SYSTEM ADMIN — SELESAI SEMUA.**
