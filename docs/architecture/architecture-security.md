# Architecture — Security

> Prinsip: defense in depth. Jangan andalkan satu lapis proteksi saja
> (misal cuma validasi di frontend). Tiap layer di bawah harus aman
> secara independen, seolah layer lain bisa gagal/dilewati.

## 1. Secrets & Environment
- Semua secret (DB password, JWT secret, MinIO keys) di `.env`, **tidak pernah** di kode/commit.
- `.env` masuk `.gitignore` sejak commit pertama repo. Sediakan `.env.example` tanpa nilai asli.
- Production: gunakan secret manager (mis. Doppler, Infisical, atau env inject dari platform
  hosting) — jangan `.env` file manual di server production kalau bisa dihindari.
- Rotate secret secara berkala, terutama JWT signing secret dan MinIO access key.
- **Hook `.claude/hooks/secret-scan.sh` otomatis block commit** kalau terdeteksi pola
  secret (API key, private key, connection string) — lihat `.claude/hooks/README.md`.

## 2. Input Validation (API layer)
- Semua endpoint WAJIB pakai schema Elysia (`t.Object`, `t.String`, dst.) — ini
  bukan cuma type-safety, tapi juga validasi runtime otomatis (reject request
  yang tidak sesuai schema sebelum masuk handler).
- Validasi bukan cuma "ada tidaknya field", tapi juga constraint: panjang string,
  format email, range angka, dsb — pakai `t.String({ format: 'email' })`,
  `t.Number({ minimum: 0 })`, dan sejenisnya.
- Sanitize input yang akan ditampilkan sebagai HTML (kalau ada rich text/markdown
  dari user) — pakai library sanitizer (mis. `isomorphic-dompurify`) sebelum render,
  baik di server maupun sebelum simpan ke DB.

## 3. Database
- Drizzle query builder = parameterized query otomatis → aman dari SQL injection
  selama tidak pakai raw SQL dengan string concatenation.
- Kalau terpaksa raw SQL (`sql\`...\``), WAJIB pakai parameter binding Drizzle
  (`sql\`... WHERE id = ${id}\`` — Drizzle handle escaping), **jangan pernah**
  `sql\`... WHERE id = '${id}'\`` manual string interpolation.
- DB user yang dipakai aplikasi punya privilege minimal (CRUD ke tabel yang relevan
  saja) — jangan pakai superuser/owner role untuk koneksi aplikasi sehari-hari.
- Backup terenkripsi, akses backup dibatasi.

## 4. Authentication & Authorization
- Password: hash dengan **Argon2id** (atau bcrypt cost ≥12 kalau Argon2 tidak
  tersedia). **Deviasi yang diterima**: project ini pakai Better Auth
  (`emailAndPassword` provider bawaan), yang hash password dengan **scrypt**
  (via `node:crypto`, bukan Argon2id/bcrypt) — ini ditemukan & didokumentasikan
  eksplisit saat security review Fase 00 (2026-08-19). scrypt tetap memory-hard
  KDF yang aman (bukan MD5/SHA polos), jadi diterima sebagai standar project
  ini SELAMA tetap pakai Better Auth default provider — kalau nanti pindah ke
  auth custom/provider lain, evaluasi ulang hashing-nya eksplisit, jangan
  asumsikan otomatis Argon2id. Jangan pernah log password, meski di error log.
- JWT: expiry pendek untuk access token (mis. 15 menit), refresh token terpisah
  dengan rotation (refresh token lama di-invalidate begitu dipakai sekali).
  (Project ini pakai session cookie Better Auth, BUKAN JWT manual — baris ini
  relevan kalau/pas ada kebutuhan JWT terpisah, mis. service-to-service token.)
- Simpan refresh token di **httpOnly cookie**, bukan localStorage (mitigasi XSS
  mencuri token).
- Endpoint protected dicek via Elysia middleware/guard terpusat (`.macro()` +
  `.resolve()`, lihat `lib/permission.ts` — bukan `.derive()`, itu jalan
  sebelum validasi schema, lihat rasional di `architecture-auth.md`), bukan
  manual per-handler — supaya tidak ada endpoint yang "kelupaan" dikasih
  proteksi. **Ini tetap opt-in per route** (WAJIB pasang `auth: true` atau
  `permission: "..."` di tiap route baru) — security review Fase 00 nemuin
  1 route (`GET /settings`) yang kelupaan sama sekali, sudah diperbaiki.
  Pertimbangkan enforcement lebih ketat (route enumeration test/lint rule
  yang gagal kalau ada route tanpa guard eksplisit) di fase mendatang —
  dicatat sebagai technical debt di `docs/lessons-learned.md`.
- Rate limiting endpoint auth (`/api/auth/*`) pakai in-memory sliding window
  custom (`lib/rate-limit.ts`), BUKAN package `elysia-rate-limit` — versi
  yang ada di npm mensyaratkan `elysia >= 2.0.0` sedangkan project ini pin ke
  1.4.x stable (2.0 masih beta). Revisit pakai package resmi begitu Elysia 2
  stabil & project upgrade.
- Authorization (role/permission check) terpisah dari authentication — user yang
  login belum tentu boleh akses semua resource, cek ownership/role di service layer.

## 5. Frontend (Next.js)
- Server Components untuk data sensitif — jangan fetch data sensitif di Client
  Component lalu render (bisa kelihatan di network tab tanpa perlu, tapi minimal
  jangan taruh logic authorization di client).
- CSRF: kalau pakai cookie-based auth, wajib CSRF token untuk mutasi (POST/PUT/DELETE) —
  Next.js Server Actions punya proteksi built-in, tapi API routes terpisah (apps/api)
  perlu implementasi CSRF token sendiri kalau pakai cookie auth.
- Content Security Policy (CSP) header untuk mitigasi XSS — set di `next.config.js`.
- Jangan taruh secret apapun di variable dengan prefix `NEXT_PUBLIC_` — itu ter-bundle
  ke client-side JS dan bisa dibaca siapa saja.

## 6. HTTP Security Headers (apps/api)
Set minimal header berikut (via plugin Elysia atau middleware manual):
```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: [sesuaikan]
Referrer-Policy: strict-origin-when-cross-origin
```

## 7. CORS & Rate Limiting

### CORS
Whitelist origin eksplisit (domain frontend production + dev), **jangan**
`origin: "*"` kalau endpoint butuh credentials/cookie.

```ts
// apps/api/src/index.ts
import { cors } from "@elysiajs/cors";

const allowedOrigins = [
  "http://localhost:3000",           // dev
  process.env.WEB_ORIGIN_PROD!,      // isi di .env.production, mis. https://app.namadomain.com
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true, // WAJIB true kalau auth pakai cookie (httpOnly refresh token)
}));
```

### Rate Limiting
Wajib untuk endpoint sensitif: login, register, forgot-password, OTP/verifikasi.

```ts
// apps/api/src/index.ts — contoh pakai elysia-rate-limit (in-memory)
import { rateLimit } from "elysia-rate-limit";

app.group("/auth", (app) =>
  app
    .use(rateLimit({ duration: 60_000, max: 5 })) // 5 request/menit per IP
    .post("/login", loginHandler)
    .post("/register", registerHandler)
);
```

> **Catatan penting kalau API di-scale ke >1 instance/container:** rate
> limiter in-memory (default) itu per-instance, jadi limit efektif jadi
> `max × jumlah instance` — tidak akurat. Kalau sudah butuh horizontal
> scaling, ganti ke backend Redis-based (banyak library rate-limit Bun/Elysia
> support adapter Redis) supaya limit konsisten lintas instance. Untuk single
> instance (kondisi awal project ini), in-memory sudah cukup.

## 8. File Upload (MinIO)
- Validasi MIME type di server dengan cek magic bytes (bukan cuma ekstensi/header
  `Content-Type` dari client, karena bisa dipalsukan).
- Batas ukuran file di level API sebelum generate presigned URL.
- Nama file di-generate ulang server-side (UUID), jangan pakai nama file asli dari
  client langsung (path traversal risk, filename collision).
- Bucket privat by default; bucket public hanya untuk asset yang memang publik
  (thumbnail, dll), tidak untuk dokumen/file user yang sensitif.

## 9. Dependency & Supply Chain
- `bun audit` (atau tool setara) dijalankan rutin, idealnya di CI dan lewat hook
  sebelum install dependency baru.
- Pin versi dependency di `bun.lockb`, jangan pakai range version terlalu longgar
  untuk dependency kritikal (auth, crypto).
- Review dependency baru sebelum ditambahkan — hindari package yang jarang di-maintain
  untuk fungsi security-sensitive (auth, crypto, file parsing).

## 10. Logging & Monitoring
- JANGAN log data sensitif: password, token, nomor identitas, data pribadi lengkap.
- Log cukup untuk audit trail: siapa, kapan, aksi apa — tanpa payload sensitif.
- Rate-limit & failed-login attempt di-log untuk deteksi brute force.
- Implementasi konkret (Pino structured logging + Sentry error tracking,
  kapan pakai yang mana) → `docs/architecture/architecture-observability.md`.
  JANGAN `console.log` tersebar di kode baru — checklist `security-review`
  ikut cek ini.

## 11. Audit Log (Beda dari Access Log §10)
Untuk data penting yang **sengaja diubah user** (settings, alamat, harga
produk, dll) — bukan cuma access log teknis, tapi jejak "siapa mengubah apa
dari nilai X ke Y, kapan" untuk kebutuhan akuntabilitas bisnis.
```ts
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // "settings" | "product" | dst
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(), // "create" | "update" | "delete"
  changes: jsonb("changes"), // { field: { from, to } } — hanya field yang berubah
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```
Ditulis di service layer (bukan trigger DB) supaya bisa sertakan konteks
bisnis (`actorId` dari session), bukan cuma diff row mentah.

## Referensi Enforcement
- `.claude/hooks/secret-scan.sh` — block commit kalau ada secret ter-hardcode.
- `.claude/hooks/README.md` — daftar hook lain (lint, guard branch, dst).
- Checklist ringkas versi CLAUDE.md root ada di bagian "Security — Non-Negotiable".
