# Panduan: Setup Login/Register dengan Google (OAuth) — Better Auth

> Panduan portable — ditulis supaya bisa diduplikasi ke project LAIN yang
> pakai Better Auth (bukan cuma Facport). Bagian yang Facport-spesifik
> (path file, nama domain) ditandai jelas, gampang diganti untuk project
> lain. Referensi implementasi asli: `docs/decisions/adr-0030-google-oauth-login.md`
> dan `docs/architecture/architecture-auth.md` § "Login/Register Google".

## Kapan Butuh Panduan Ini
Project sudah pakai Better Auth untuk auth email/password, dan mau
tambah opsi "Login/Register dengan Google" TANPA bikin akun duplikat
untuk user yang emailnya sama, DAN tanpa merusak jalur user-creation
lain yang sudah ada (mis. admin bikin akun manual).

---

## Bagian A — Setup Google Cloud Console (WAJIB dilakukan manual, sekali per project)

### A1. Buat/pilih project
1. Buka https://console.cloud.google.com/
2. Dropdown project (kiri atas) → **New Project** → beri nama → **Create**

### A2. Konfigurasi OAuth consent screen
1. Menu kiri: **APIs & Services → OAuth consent screen**
2. User Type: **External** → Create
3. Isi App name, User support email, Developer contact email
4. Scopes: pastikan `email` dan `profile` ada (biasanya default)
5. Kalau masih mode **Testing**, tambahkan email penguji di "Test users"
   dulu — kalau sudah siap publik, submit consent screen untuk masuk
   mode "In production" (scope dasar email+profile biasanya TIDAK butuh
   verifikasi manual Google, beda dari scope sensitif lain)

### A3. Buat OAuth Client ID
1. Menu kiri: **APIs & Services → Credentials → Create Credentials →
   OAuth client ID**
2. Application type: **Web application**
3. Name: bebas, cuma label
4. **Authorized JavaScript origins** — domain tempat user MELIHAT tombol
   login (opsional tapi disarankan):
   ```
   https://<domain-frontend-anda>
   https://<domain-api-anda>          # kalau API di subdomain terpisah
   ```
5. **Authorized redirect URIs** — WAJIB, harus PERSIS sama dengan yang
   di-generate Better Auth (§ pola di Bagian B4 di bawah):
   ```
   https://<domain-api-anda>/api/auth/callback/google
   ```
   (tambahkan versi `http://localhost:<port>/api/auth/callback/google`
   kalau mau tes dari dev lokal)
6. **Create** → copy **Client ID** dan **Client Secret** dari popup
   (Secret cuma ditampilkan SEKALI — kalau hilang, generate ulang)

### A4. Simpan kredensial
Masukkan ke `.env`/`.env.production` project (JANGAN commit ke git):
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Bagian B — Implementasi Kode (Better Auth)

### B1. Env var — OPSIONAL, bukan required
Supaya dev/CI yang belum setup Google TIDAK ikut gagal boot:
```ts
// lib/env.ts (skema validasi env, contoh pakai TypeBox — sesuaikan
// dengan library validasi env project Anda)
GOOGLE_CLIENT_ID: t.Optional(t.String({ minLength: 1 })),
GOOGLE_CLIENT_SECRET: t.Optional(t.String({ minLength: 1 })),
```

### B2. Aktifkan `socialProviders` — kondisional
```ts
// lib/auth.ts
export const auth = betterAuth({
  // ...config lain...
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } }
    : {}),
});
```
Kalau kedua env var kosong, fitur otomatis "mati" tanpa error — tombol
Google di frontend tetap ada tapi klik-nya akan gagal dengan pesan
error dari Better Auth (provider tidak terdaftar), bukan crash server.

### B3. ⚠️ GOTCHA PALING PENTING — role/permission default untuk user baru
**Kalau project Anda assign role/permission default ke user baru (mis.
"customer"/"member") lewat cara APA PUN selain
`databaseHooks.user.create.after`, BACA INI DULU sebelum lanjut:**

`databaseHooks.user.create.after` (Better Auth) fires untuk **SEMUA**
metode pembuatan user — email/password, OAuth, DAN panggilan
server-side `auth.api.signUpEmail()`/`auth.api.X()` LANGSUNG dalam
proses yang sama (bukan cuma request HTTP asli). Kalau project Anda
punya jalur "admin bikin user manual" yang memanggil `auth.api.X()`
secara langsung (BUKAN lewat HTTP publik), hook `databaseHooks` yang
tidak difilter akan IKUT menjalankan logic yang sama untuk jalur itu
juga — kemungkinan besar BUKAN yang Anda inginkan (mis. admin yang
dibuat lewat panggilan ini ikut ditandai role "customer").

**Solusi**: `context.path` yang diterima hook SAMA PERSIS baik dipanggil
via HTTP asli maupun panggilan server-side langsung untuk endpoint YANG
SAMA (mis. keduanya `/sign-up/email`) — jadi TIDAK BISA dipakai
membedakan "self-service" vs "admin-provisioned" untuk metode
email/password. **Kalau perlu logic KHUSUS OAuth saja** (paling umum:
assign role default HANYA untuk user OAuth, biarkan jalur email/password
pakai mekanisme lama yang sudah benar), filter path ke
`/callback/:id` — path generik yang dipakai SEMUA social provider
Better Auth (Google, GitHub, dst), dan struktural TIDAK PERNAH dipakai
untuk provisioning server-side manual:

```ts
// lib/auth.ts
databaseHooks: {
  user: {
    create: {
      after: async (user, context) => {
        if (context?.path !== "/callback/:id") return; // HANYA OAuth
        await assignDefaultRole(user.id); // logic Anda sendiri
      },
    },
  },
},
```

Kalau project Anda BELUM punya jalur "admin bikin user manual" sama
sekali (SEMUA user selalu lewat self-service), filter ini tidak wajib
— tapi tetap disarankan sebagai kebiasaan aman, siapa tahu jalur admin
ditambah belakangan dan lupa disesuaikan.

### B4. Redirect URI yang di-generate Better Auth
Pola BAKU (tidak bisa dikustomisasi tanpa plugin tambahan):
```
{BETTER_AUTH_URL atau baseURL}/api/auth/callback/{providerId}
```
Untuk Google: `.../api/auth/callback/google`. HARUS didaftarkan PERSIS
sama di Google Cloud Console (§ A3) — kalau beda satu karakter pun
(trailing slash, http vs https), Google akan tolak dengan error
`redirect_uri_mismatch`.

### B5. `accountLinking` — biasanya CUKUP pakai default
Default Better Auth: `enabled: true`, `requireLocalEmailVerified: true`.
Artinya: kalau user SUDAH punya akun password dengan email X yang SUDAH
terverifikasi, sign-in Google dengan email X yang sama akan OTOMATIS
di-link ke akun yang sama (bukan bikin akun duplikat). Akun password
yang emailnya BELUM terverifikasi TIDAK di-link (mencegah attacker
pre-register email korban lalu klaim lewat OAuth). **Jangan
turunkan `requireLocalEmailVerified` ke `false` kecuali benar-benar
paham risiko account-takeover-nya** — cukup pakai default kalau project
Anda sudah mewajibkan verifikasi email untuk signup password.

### B6. Tombol di Frontend
```tsx
// Client SDK Better Auth (React)
import { authClient } from "./auth-client";

async function handleGoogleSignIn() {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: "https://app.domain-anda.com/dashboard", // ke mana setelah sukses
    errorCallbackURL: "https://app.domain-anda.com/login?error=google",
  });
}
```
`signIn.social()` melakukan REDIRECT PENUH browser ke halaman consent
Google — tidak ada response JSON untuk ditunggu di jalur sukses (beda
dari `signIn.email()`), jadi tidak perlu `router.push()` manual setelah
memanggilnya.

Logo "G" resmi Google — pakai inline SVG (4 warna), TIDAK perlu
tambah dependency icon library baru cuma untuk 1 logo brand:
```tsx
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.84Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.11C3.25 21.3 7.31 24 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.61H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}
```

---

## Bagian C — Keterbatasan yang Perlu Diketahui

### C1. Multi-subdomain (kalau app Anda pisah domain frontend/API per subdomain)
Kalau project pakai pola "1 API di subdomain sendiri (`api.domain.com`),
frontend di subdomain lain (`app.domain.com`)" DAN cookie session
lintas-subdomain (`crossSubDomainCookies`) dimatikan khusus di
DEVELOPMENT (pola umum: `Domain=.localhost` ditolak diam-diam oleh
Chrome) — OAuth callback (yang selalu diproses di sisi API) TIDAK BISA
di-test end-to-end di dev lokal `.localhost`, cookie sesi hasil OAuth
tidak akan kebaca subdomain frontend. **Verifikasi WAJIB di
staging/production** (domain asli terdaftar, cookie cross-subdomain
jalan normal), bukan cuma dev lokal.

### C2. Testing otomatis
Tidak praktis membuat test end-to-end yang benar-benar hit OAuth flow
Google sungguhan (butuh browser + akun Google + consent screen
sungguhan). Strategi yang dipakai di sini:
- Fungsi assign-role diekstrak jadi fungsi murni terpisah dari hook →
  dites LANGSUNG (panggil fungsi dengan user id nyata), tanpa perlu
  simulasi OAuth.
- Tombol frontend dites dengan MOCK `authClient.signIn.social` (assert
  dipanggil dengan `provider: "google"` yang benar), bukan trigger
  redirect sungguhan.
- Flow OAuth sungguhan (redirect ke Google, consent, callback, cookie
  ke-set benar) diverifikasi MANUAL sekali di staging/production setelah
  kredensial Google siap.

---

## Checklist Ringkas (untuk project baru)
- [ ] Google Cloud Console: project, OAuth consent screen, OAuth Client ID
- [ ] Redirect URI terdaftar PERSIS: `{baseURL}/api/auth/callback/google`
- [ ] `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` di `.env` (Optional di skema validasi env)
- [ ] `socialProviders.google` diaktifkan KONDISIONAL di config Better Auth
- [ ] Kalau ada jalur "admin bikin user manual" via `auth.api.X()` — CEK
      apakah ada `databaseHooks.user.create.after` yang perlu difilter
      `context.path === "/callback/:id"` supaya tidak ikut ke jalur itu
- [ ] `accountLinking` — biarkan default kecuali ada alasan kuat mengubah
- [ ] Tombol "Lanjutkan dengan Google" di halaman login DAN register
- [ ] Verifikasi manual end-to-end di staging/production
