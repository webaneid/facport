---
name: security-review
description: Audit kode yang baru ditulis/diedit terhadap checklist keamanan project (docs/architecture/architecture-security.md). Gunakan setelah selesai bikin endpoint baru, fitur auth, upload file, atau query database — sebelum dianggap "selesai"/commit. Bisa juga dipanggil manual lewat "/security-review" atau saat user minta "cek keamanan kode ini".
---

# Skill: Security Review

Tujuan: mengecek kode yang baru ditulis terhadap checklist konkret, BUKAN
memberi opini umum "sudah cukup aman". Setiap poin harus dijawab dengan
merujuk baris kode spesifik, bukan asumsi.

## Langkah

1. Identifikasi file yang baru diubah di sesi ini (route, service, schema,
   auth, upload handler). Kalau tidak jelas, tanya user file mana yang mau di-review.

2. Baca `docs/architecture/architecture-security.md` untuk checklist lengkap
   (jangan hafal dari memori, checklist project bisa sudah diupdate).
   Kalau `docs/architecture/architecture-tenancy.md` masih ada di project ini
   (berarti project multi-tenant), baca juga checklist tenant isolation di
   file itu — query yang lupa filter `tenant_id` masuk kategori Critical.
   Kalau `docs/architecture/architecture-tenancy-domain-routing.md` juga ada
   (multi-tenant dengan custom domain), cek checklist § 6 file itu — slug
   yang di-resolve dari path (bukan Host header) atau guard middleware tanpa
   `return` eksplisit masuk kategori Critical.
   Untuk file frontend (apps/web), cek juga tidak ada string UI hardcoded
   (harus lewat `next-intl`, lihat `docs/architecture/architecture-i18n.md`)
   — masuk kategori Medium kalau ditemukan.

3. Untuk TIAP file yang direview, cek poin yang relevan:

   **Kalau file adalah route/endpoint (apps/api/src/routes/*.ts):**
   - [ ] Semua field body/query/params punya schema Elysia (`t.Object`, dst) — bukan `t.Any()`
   - [ ] Endpoint yang butuh login pakai auth guard/middleware, bukan cek manual di dalam handler
   - [ ] Kalau endpoint akses resource spesifik (by id), ada cek ownership/permission
         — bukan cuma cek "user sudah login", tapi "user ini boleh akses resource ini"
   - [ ] Response tidak membocorkan data sensitif (password hash, internal error stack trace)
   - [ ] Rate limiting ada untuk endpoint sensitif (login, register, forgot-password, OTP)

   **Kalau file menyentuh database (service/schema):**
   - [ ] Tidak ada raw SQL dengan string concatenation/template literal manual
   - [ ] Kalau ada raw SQL, pakai parameter binding Drizzle (`sql\`...${value}\``)
   - [ ] Tidak ada query yang return semua kolom termasuk field sensitif
         (mis. `select *` yang ikut ekspos password hash ke response)

   **Kalau file terkait auth (login/register/token):**
   - [ ] Password di-hash (Argon2id/bcrypt), tidak pernah plaintext atau di-log
   - [ ] JWT/token punya expiry yang wajar, bukan token yang tidak pernah expire
   - [ ] Refresh token disimpan httpOnly cookie, bukan localStorage/response body
         yang gampang diakses JS di client
   - [ ] Permission check lewat middleware terpusat (bukan `if` manual di
         handler), ownership check terpisah di service layer — lihat
         `docs/architecture/architecture-auth.md`

   **Kalau file terkait webhook (payment, dst — kalau `architecture-payment.md` ada di project ini):**
   - [ ] Signature/HMAC webhook diverifikasi SEBELUM payload diproses,
         request dengan signature tidak valid di-reject
   - [ ] Handler idempotent (webhook yang sama dikirim ulang tidak boleh
         diproses 2x) — lihat `docs/architecture/architecture-payment.md`

   **Kalau file terkait upload file (MinIO):**
   - [ ] Validasi MIME type di server (bukan cuma trust header dari client)
   - [ ] Ada batas ukuran file
   - [ ] Nama file di-generate ulang server-side (bukan pakai nama asli dari client)

   **Kalau ada secret/config baru:**
   - [ ] Diambil dari `process.env`, bukan hardcoded
   - [ ] Ada di `.env.example` (tanpa nilai asli) kalau memang perlu didokumentasikan

4. Laporkan hasil dalam format:
   ```
   ## Security Review — [nama file/fitur]

   ✅ Lolos: [poin yang sudah benar]
   ⚠️  Perlu diperbaiki: [poin bermasalah + baris kode + saran fix]
   ❓ Perlu dicek manual: [hal yang tidak bisa dipastikan dari kode saja,
      mis. "apakah rate limit ini cukup ketat untuk kebutuhan bisnis?"]
   ```

5. Kalau ketemu masalah kategori "⚠️ Perlu diperbaiki", JANGAN anggap task selesai
   — perbaiki dulu atau tanya user mau prioritaskan fix sekarang atau dicatat
   sebagai technical debt di `docs/lessons-learned.md`.

6. Kalau reviewnya kompleks/menyentuh banyak file sekaligus (misal audit
   seluruh folder routes/), pertimbangkan delegasikan ke subagent
   `security-auditor` (lihat `.claude/agents/security-auditor.md`) supaya
   tidak menghabiskan context window sesi utama.
