import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import { env, webOriginsProd } from "./env";
import { boss, JOBS, startQueue } from "./queue";
import { assignCustomerRole } from "./assign-customer-role";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  // § architecture-subscription.md § "Dua Jalur Registrasi" — self-service
  // WAJIB verifikasi email dulu (§ Medium finding security review Fase 01:
  // sebelumnya session langsung aktif tanpa verifikasi apa pun). Admin-
  // provisioned user (routes/admin/users.route.ts) di-set emailVerified=true
  // manual setelah dibuat — admin yang vouch, tidak perlu verifikasi ulang.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // § diminta user 2026-09-05 — sebelumnya TIDAK ADA jalur pemulihan
    // password mandiri sama sekali (gap ditemukan saat audit fondasi).
    // Endpoint `/request-password-reset`/`/reset-password/:token`/
    // `/reset-password` SUDAH BAWAAN Better Auth (bukan plugin — core,
    // sudah otomatis ter-mount via `.mount(auth.handler)` di app.ts),
    // TINGGAL kasih `sendResetPassword` di sini supaya beneran ngirim
    // email (tanpa ini, Better Auth balas "RESET_PASSWORD_DISABLED").
    sendResetPassword: async ({ user, url }) => {
      await startQueue();
      await boss.send(JOBS.SEND_EMAIL, {
        to: user.email,
        subject: "Reset password Facport",
        html: `<p>Ada permintaan reset password untuk akun Facport kamu.</p><p>Klik link berikut untuk atur password baru:</p><p><a href="${url}">${url}</a></p><p>Kalau kamu tidak meminta ini, abaikan email ini — password kamu tetap aman.</p>`,
      });
    },
  },
  // § CLAUDE.md root "Rules Non-Negotiable" — tugas kirim email WAJIB
  // lewat job queue, JANGAN sinkron di request handler (signup tidak
  // boleh ikut lambat/gagal kalau Resend lagi lambat/down). Enqueue
  // SEKALI, worker (workers/index.ts) yang beneran panggil sendEmail().
  // `startQueue()` idempotent (§ lib/queue.ts) — dipanggil di sini juga
  // (bukan cuma index.ts/workers/index.ts) supaya test (`app.handle()`
  // langsung, TANPA boot index.ts) tetap bisa enqueue tanpa "Database not
  // opened".
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await startQueue();
      await boss.send(JOBS.SEND_EMAIL, {
        to: user.email,
        subject: "Verifikasi email Facport",
        html: `<p>Klik link berikut untuk verifikasi email kamu:</p><p><a href="${url}">${url}</a></p>`,
      });
    },
    // § Fase 48 — diminta user: setelah pilih paket di landing → daftar,
    // sebelumnya user harus BALIK login manual lagi setelah klik link
    // verifikasi (pilihan paket ikut hilang di tengah jalan). Dengan ini,
    // klik link verifikasi = LANGSUNG login (Better Auth `createSession`+
    // `setSessionCookie` built-in, § `email-verification.mjs`), lalu
    // redirect ke `callbackURL` yang dikirim `register-form.tsx` saat
    // signUp (`/subscribe?plans=...`) — user mendarat sudah login DENGAN
    // paket ke-preselect, tinggal checkout.
    autoSignInAfterVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  // § Fase 62, ADR-0030 — Login/Register Google (surface `app` SAJA,
  // admin/staff selalu provisioning manual, § architecture-subscription.md
  // § "Dua Jalur Registrasi"). Kondisional (bukan selalu di-set) — dev/CI
  // tanpa `GOOGLE_CLIENT_ID`/`SECRET` (§ lib/env.ts, keduanya Optional)
  // tetap boot normal, fitur otomatis "mati" tanpa error, BUKAN required
  // env var (pola sama ACCURATE_CLIENT_ID/SECRET).
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } }
    : {}),
  // `accountLinking` SENGAJA TIDAK di-override — default Better Auth
  // (`enabled: true`, `requireLocalEmailVerified: true`) sudah pas:
  // akun password yang emailnya SUDAH terverifikasi otomatis di-link ke
  // sign-in Google dengan email sama (bukan bikin akun duplikat), akun
  // password yang BELUM terverifikasi TIDAK di-link (proteksi bawaan
  // cegah account takeover) — konsisten `requireEmailVerification: true`
  // di atas. § ADR-0030.
  //
  // § databaseHooks.user.create.after FIRES untuk SEMUA metode pembuatan
  // user, TERMASUK `auth.api.signUpEmail()` yang dipanggil LANGSUNG dari
  // `admin/users.route.ts`/`admin/staff.route.ts` (server-side, admin
  // provisioning akun admin/staff) — BUKAN cuma jalur self-service
  // seperti dugaan awal. Bug ditemukan test Fase 59 sendiri (2026-09-08):
  // versi awal hook ini assign "customer" ke SEMUA user tanpa filter,
  // ikut menandai akun admin/staff sebagai "customer" juga (merusak
  // invariant `userCount` yang baru diperbaiki Fase 59).
  //
  // FIX: `context.path` (dari `better-call`, § riset ADR-0030) SAMA
  // PERSIS baik dipanggil via HTTP asli maupun `auth.api.X()` server-side
  // untuk endpoint EMAIL (keduanya `/sign-up/email`) — TIDAK BISA
  // dipakai bedakan self-service vs admin-provisioned untuk email/
  // password. Makanya jalur email/password TETAP SEPENUHNYA diserahkan
  // ke intercept HTTP-level `app.ts` (`.post("/api/auth/sign-up/email", ...)`
  // — HANYA jalan untuk request HTTP ASLI ke Elysia, TIDAK PERNAH jalan
  // untuk `auth.api.signUpEmail()` yang dipanggil langsung dalam proses
  // yang sama, jadi otomatis benar). Hook DI SINI di-filter HANYA untuk
  // path OAuth callback (`/callback/:id` — dipakai SEMUA social provider,
  // `params.id` = nama provider, mis. "google") — jalur ini TIDAK PERNAH
  // dipakai admin provisioning (tidak ada "OAuth admin-provisioned" di
  // codebase ini), jadi aman filter dengan cara ini.
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          if (context?.path !== "/callback/:id") return;
          await assignCustomerRole(user.id);
        },
      },
    },
  },

  // § architecture-domain-routing.md, Fase 01 M5 — session cookie di-set
  // dengan Domain=.facport.com (prod) / .localhost (dev) supaya otomatis
  // kebaca browser di subdomain admin./app. juga, TANPA perlu instance
  // Better Auth kedua di apps/web (terverifikasi ke docs resmi Better Auth).
  advanced: {
    // § lessons-learned.md 2026-08-19 — `Domain=.localhost` (broadening
    // attribute, BUKAN host-only) DITOLAK DIAM-DIAM oleh Chrome — dites
    // lewat Playwright: TANPA atribut Domain, cookie tersimpan & login
    // sukses; DENGAN `Domain=.localhost`, cookie tidak pernah tersimpan
    // (tanpa warning apa pun di console, beda dari kasus SameSite yang
    // Firefox eksplisit kasih pesan). Browser memperlakukan `localhost`
    // mirip "public suffix" (sama alasannya kenapa `Domain=.com` juga
    // ditolak) — jadi cross-subdomain cookie sharing (`crossSubDomainCookies`)
    // TIDAK BISA jalan sama sekali di dev `.localhost`, terlepas dari
    // atribut cookie lain apa pun. Production TIDAK kena masalah ini
    // (`facport.com` domain terdaftar asli, `Domain=.facport.com` valid).
    // Makanya di-nonaktifkan KHUSUS non-production di sini — kalau nanti
    // butuh test cross-subdomain SSO di dev, satu-satunya cara adalah pakai
    // domain asli (bukan `.localhost`) via `/etc/hosts` atau layanan
    // wildcard-DNS yang eTLD+1-nya benar (mis. `*.facport.nip.io`).
    // BUKAN process.env.NODE_ENV === "production" (versi lama) — bundler
    // Bun const-fold `process.env.NODE_ENV` SAAT BUILD (builder stage
    // Dockerfile build TANPA NODE_ENV=production, cuma production stage
    // yang punya itu, kepakainya cuma di runtime, kelewat) — hasilnya
    // `enabled` selalu literal `false` ter-bake permanen ke bundle,
    // terlepas dari env container yang jalan. Ketemu 2026-08-27: sign-in
    // browser sukses (200 + cookie) tapi TIDAK ke-share ke subdomain lain
    // (Set-Cookie tanpa atribut Domain sama sekali). Cek `env.COOKIE_DOMAIN`
    // langsung (dibaca live via process.env biasa di lib/env.ts, TIDAK
    // kena const-fold — cuma NODE_ENV yang di-special-case bundler) —
    // sesuai maksud asli: nonaktifkan KHUSUS dev `.localhost` (lihat
    // komentar di atas), bukan soal "production" per se.
    crossSubDomainCookies: { enabled: env.COOKIE_DOMAIN !== ".localhost", domain: env.COOKIE_DOMAIN },
    // `sameSite:"none"`/`secure`/`partitioned` SEMPAT dicoba untuk "atasi"
    // cookie lintas-situs (apps/web manggil apps/api di host beda) —
    // TERBUKTI SALAH ARAH (Partitioned tersimpan tapi tidak pernah
    // terkirim di navigasi top-level). Fix SEBENARNYA:
    // `apps/web/app/api-proxy/[...path]/route.ts` proxy semua panggilan
    // ke apps/api lewat origin `apps/web` sendiri saat dev — browser jadi
    // TIDAK PERNAH lihat request lintas-situs, default Better Auth
    // (`sameSite:"lax"`, TIDAK di-override) sudah cukup.
  },
  trustedOrigins: [
    "http://localhost:6209",
    "http://admin.localhost:6209",
    "http://app.localhost:6209",
    ...webOriginsProd,
  ],
});
