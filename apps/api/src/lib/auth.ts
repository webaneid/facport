import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import { env, webOriginsProd } from "./env";
import { boss, JOBS, startQueue } from "./queue";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  // § architecture-subscription.md § "Dua Jalur Registrasi" — self-service
  // WAJIB verifikasi email dulu (§ Medium finding security review Fase 01:
  // sebelumnya session langsung aktif tanpa verifikasi apa pun). Admin-
  // provisioned user (routes/admin/users.route.ts) di-set emailVerified=true
  // manual setelah dibuat — admin yang vouch, tidak perlu verifikasi ulang.
  emailAndPassword: { enabled: true, requireEmailVerification: true },
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
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  // socialProviders: {} — aktifkan kalau project butuh Google/dst login,
  // JANGAN aktifkan default kalau tidak diminta.

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
