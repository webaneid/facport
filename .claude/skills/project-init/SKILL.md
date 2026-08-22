---
name: project-init
description: Kustomisasi seluruh file template (CLAUDE.md, docs/, .claude/) berdasarkan detail project baru yang diberikan user (nama, deskripsi, fitur, stack, istilah domain). WAJIB dipakai saat user memberi info project baru dan minta "sesuaikan semua file" atau menempel isi dari PROJECT-INIT-PROMPT.md. Ini one-time bootstrap, bukan dipakai untuk edit rutin sehari-hari.
---

# Skill: Project Init

Tugasmu: baca detail project yang diberikan user, lalu edit SEMUA file yang
relevan secara konsisten — jangan cuma ganti satu file dan lupa file lain yang
masih nyebut nama/stack lama.

## Urutan Kerja

### 1. Kumpulkan info dari input user
Pastikan kamu punya minimal: nama project, deskripsi, daftar fitur utama,
stack (default atau custom), istilah domain (kalau ada). Kalau ada yang
kosong/ambigu, tanya SATU pertanyaan singkat sebelum lanjut — jangan
mengarang detail yang tidak disebutkan user.

Tambahan khusus untuk fondasi (dipakai di Langkah 5 & 5c):
- Info perusahaan/organisasi (nama, alamat, timezone) — kalau user belum
  isi, boleh placeholder dan dicatat di ringkasan (langkah 9) untuk diisi
  manual lewat Settings Page nanti, JANGAN mengarang alamat/timezone.
- **Tabel "Checklist Kebutuhan Komponen"** dari `PROJECT-INIT-PROMPT.md` —
  ini WAJIB terisi lengkap (11 baris Ya/Tidak). Kalau user paste prompt
  dengan baris checklist yang masih kosong/placeholder `[ya/tidak]`, **STOP,
  tanya user untuk melengkapi checklist itu dulu** sebelum lanjut — jangan
  menebak/mengasumsikan default sendiri untuk checklist ini (beda dari field
  lain yang boleh placeholder), karena ini yang menentukan struktur dokumen
  final project.
- **Kalau Multi-tenant SaaS = Ya**, 3 sub-pertanyaan di bawah tabel checklist
  (custom domain per tenant? admin dashboard juga di custom domain? nama
  domain platform?) JUGA wajib terisi — sama-sama STOP dan tanya kalau
  kosong, jangan diasumsikan sendiri (lihat Langkah 5b).

### 2. Update CLAUDE.md (root)
- Ganti `[Nama Project]` dengan nama asli.
- Ganti bagian "Ringkasan Project" dengan deskripsi yang diberikan.
- Kalau stack beda dari default → update section "Stack Global".
- JANGAN hapus struktur/section yang sudah ada (Rules Non-Negotiable, Security,
  Alur Kerja, Peta Dokumen) — itu tetap berlaku terlepas dari project spesifik apa.

### 3. Update apps/api/CLAUDE.md dan apps/web/CLAUDE.md
- Sesuaikan "Tanggung Jawab Folder" kalau ada detail spesifik dari deskripsi project.
- Kalau stack beda dari default (misal bukan Elysia tapi Hono, atau bukan
  Next.js), update seluruh isi file ini — jangan cuma ganti judul, konvensi
  teknisnya juga harus konsisten sama stack yang dipilih.

### 4. Update docs/decisions/adr-0001-pilih-stack.md
- Kalau user bilang "pakai default" → cukup update baris Context supaya
  menyebut nama project yang benar, decision & rationale tetap.
- Kalau user bilang stack BEDA → ini WAJIB jadi ADR baru (bukan edit adr-0001,
  ADR yang sudah Accepted tidak diedit). **Cek dulu nomor tertinggi yang ada
  di `docs/decisions/` (misal sudah ada adr-0001, adr-0002 untuk versioning)
  dan pakai nomor urut BERIKUTNYA yang belum dipakai** — jangan asumsikan
  adr-0002 kosong, itu sudah dipakai untuk versioning strategy di template ini.
  Tulis ADR baru dengan format yang sama: Context, Decision, Alternatif,
  Konsekuensi, dan tandai "Supersedes ADR-0001" kalau memang menggantikan total.

### 5. Update docs/architecture/*.md
- Ganti contoh-contoh generic (nama tabel, nama endpoint) supaya relevan
  dengan fitur utama yang disebutkan user — tapi tetap sebagai CONTOH pola,
  bukan skema final (skema final tetap ditentukan pas eksekusi fase beneran).
- Kalau ada fitur di luar cakupan file architecture yang sudah ada (misal
  butuh `architecture-loyalty-points.md` karena ada fitur poin loyalitas),
  buat file baru mengikuti format file architecture yang sudah ada, JANGAN
  cuma disebut sambil lalu di overview.

### 5b. Proses Checklist Kebutuhan Komponen (Ya/Tidak)
Untuk **SETIAP baris "Tidak"** di tabel checklist (Langkah 1) → hapus file
terkait DAN baris-nya di tabel "Peta Dokumen" CLAUDE.md root. Untuk baris
"Ya" → file TETAP ADA, isi detail spesifik (provider payment, model tenant,
dst) kalau user sudah sebutkan. **JANGAN hapus file kalau statusnya "Ya"**,
walau kelihatan belum relevan untuk Fase 01 — checklist ini soal keputusan
arsitektur project, bukan soal fitur mana yang dikerjakan duluan.

**Khusus Multi-tenant SaaS = Ya** — isi
`docs/architecture/architecture-tenancy-domain-routing.md` dari 3
sub-pertanyaan di `PROJECT-INIT-PROMPT.md`:
- Ganti semua placeholder `namaplatform.com` dengan domain platform asli
  (sub-pertanyaan #3).
- § 4 (Custom Domain per Tenant) — kalau sub-pertanyaan #1 dijawab "tidak",
  **hapus seluruh § 4 dan § 4.1–4.4** dari file ini (custom domain tidak
  relevan, tenant cukup path/subdomain platform), sisakan § 1–3 dan § 5–6
  (empat entitas domain, guard layering, auth cross-domain, checklist
  keamanan — ini tetap relevan walau tanpa custom domain).
- § 4.3 (Admin di custom domain, Opsi A/B) — isi jawaban sub-pertanyaan #2 di
  bagian `[isi: pilih salah satu di sini...]`. Kalau user jawab "tetap di
  domain platform saja", hapus § 4.3 dan § 4.4 juga (tidak relevan).

| Checklist | Kalau "Tidak", hapus |
|---|---|
| Multi-tenant SaaS | `docs/architecture/architecture-tenancy.md` **DAN** `docs/architecture/architecture-tenancy-domain-routing.md` (dua-duanya, satu paket) |
| Komponen Alamat | `docs/architecture/components/architecture-component-address.md` — **plus** hapus referensi `AddressForm`/tabel `addresses` dari scope Fase 00 (Langkah 5c) |
| Payment Gateway | `docs/architecture/architecture-payment.md` |
| Kepatuhan Data Pribadi (UU PDP) | `docs/architecture/architecture-data-privacy.md` |
| Notifikasi Email **DAN** WhatsApp (dua-duanya Tidak) | `docs/architecture/architecture-notifications.md`. Kalau CUMA salah satu Tidak (mis. Email Ya, WA Tidak) → file tetap ada, tapi edit isinya: hapus section WhatsApp, catat di bagian atas file "WhatsApp tidak dipakai di project ini" |
| Background Jobs/Queue | `docs/architecture/architecture-jobs.md` — **cek dulu**: kalau Notifikasi Email/WA = Ya tapi Background Jobs = Tidak, itu kontradiktif (notifikasi WAJIB lewat queue, lihat `architecture-notifications.md`) — **tanya user untuk konfirmasi ulang**, jangan diam-diam pilih salah satu |
| Multi-bahasa (i18n) | `docs/architecture/architecture-i18n.md` — **plus** hapus setup `next-intl`/dictionary dari scope Fase 00, dan hapus baris terkait `next-intl` di `apps/web/CLAUDE.md` bagian Konvensi |
| SEO Analyzer + Sitemap | **DUA file**: `docs/architecture/components/architecture-component-seo.md` DAN `docs/architecture/components/architecture-component-sitemap.md` |
| Full-text Search | `docs/architecture/architecture-search.md` |
| Staging Environment | **Lebih dari 1 file** — lihat Langkah 5d, jangan cuma hapus 1 dokumen |

### 5c. Fase 00 — Setup Fondasi (SEBELUM Fase 01 fitur)
Komponen reusable, Settings Page, dan i18n itu fondasi yang WAJIB ada sejak
awal (lihat `docs/architecture/architecture-components.md` dan CLAUDE.md
root bagian Rules Non-Negotiable) — bukan "fitur" biasa, jadi dibuat sebagai
**Fase 00** terpisah dari Fase 01 (fitur prioritas pertama user). Scope Fase
00 mengikuti hasil checklist Langkah 5b — **JANGAN setup komponen yang
checklist-nya "Tidak"**, itu artinya dobel kerja yang langsung dibuang.
- Copy `docs/phases/phase-template.md` → `docs/phases/phase-00-fondasi.md`,
  isi Scope dari daftar berikut, **kurangi item yang checklist-nya "Tidak"**:
  - Selalu ada: skema `settings`, `media`, `audit_logs`, Better Auth + skema
    `roles`/`permissions`/`role_permissions`/`user_roles` (seed minimal 1
    role admin dengan izin penuh), komponen `Combobox`, `MediaLibraryModal` dasar.
  - Kondisional (cek checklist): `addresses` (+ seed data wilayah), `next-intl`
    (id.json/en.json awal), `pg-boss` queue dasar (worker skeleton), skema
    multi-tenant, skema consent/audit UU PDP, skema `orders` payment.
- Isi field wajib `settings` group `general` (§ `architecture-settings.md`)
  dari info perusahaan yang dikumpulkan di Langkah 1 — kalau user belum isi,
  pakai placeholder dan catat di ringkasan (Langkah 9).
- Kalau checklist Alamat = Ya TAPI user bilang tidak butuh luar negeri
  (single-country strict), catat sebagai simplifikasi di
  `docs/architecture/components/architecture-component-address.md` (hapus
  bagian toggle luar negeri).
- Tambah baris Fase 00 di `docs/PROGRESS.md`, status `Planned`, **sebelum**
  baris Fase 01 — SOP tetap berlaku penuh untuk Fase 00 ini juga (typecheck,
  security review, dst sebelum ditutup).

### 5d. Kalau Staging Environment = "Tidak"
Beda dari komponen lain (staging melibatkan beberapa file, bukan 1 dokumen):
- Hapus: `docker-compose.staging.yml`, `.env.staging.example`,
  `.github/workflows/deploy-staging.yml`, `docs/decisions/adr-0003-staging-environment.md`
- Edit `Caddyfile`: hapus blok `app-staging`/`api-staging`
- Edit `.github/workflows/ci.yml`: `branches: [main, develop]` → `branches: [main]`
  (kecuali user tetap mau pakai branch `develop` untuk kerja harian tanpa
  auto-deploy staging — tanya kalau ambigu)
- Edit `docs/SOP.md`: hapus bagian "Staging — Gerbang Sebelum Production"
- Edit `docs/deployment-server-setup.md`: hapus bagian "9. Setup Staging Environment"
- Edit `CLAUDE.md` root: hapus baris "Staging environment, branch strategy" di Peta Dokumen
- **Catat di ringkasan (Langkah 9)** kalau nanti project ini berkembang dan
  butuh staging, semua file di atas ada di template master (bukan dihapus
  permanen dari ekosistem kamu) — tinggal salin ulang dari sana.

### 6. Buat draft Fase 01
- Ambil fitur prioritas PERTAMA dari daftar user.
- Copy `docs/phases/phase-template.md` → `docs/phases/phase-01-{nama-fitur}.md`,
  isi Tujuan & Scope berdasarkan deskripsi fitur itu, status `Planned`.
- Tambah baris di `docs/PROGRESS.md`, isi juga fitur ke-2 dst sebagai
  `Not Started` di tabel yang sama (biar kelihatan roadmap-nya).
- Update "Fase Aktif Saat Ini" di `docs/PROGRESS.md` ke **Fase 00** (bukan
  Fase 01 — fondasi dulu baru fitur, jangan dibalik).

### 7. Update docs/glossary.md
- Isi tabel "Istilah Domain" dengan istilah yang diberikan user.
- Kalau user tidak kasih istilah domain, biarkan section itu kosong dengan
  placeholder-nya, jangan dihapus (mungkin nanti muncul istilah baru).

### 8. Update docs/conventions.md
- Cuma ubah kalau user sebutkan preferensi spesifik (misal naming convention
  beda). Kalau tidak disebutkan, biarkan default apa adanya.

### 8b. Update file deployment (KALAU user isi Domain/Repo/Server)
- `Caddyfile`: ganti `app.namadomain.com`, `api.namadomain.com`,
  `app-staging.namadomain.com`, `api-staging.namadomain.com` dengan domain
  asli yang diberikan user (staging = prefix `-staging` dari domain yang sama,
  kecuali user sebutkan domain staging yang beda).
- `.env.production.example` & `.env.staging.example`: ganti `GITHUB_REPO=namauser/nama-repo`
  dengan repo asli, dan `NEXT_PUBLIC_API_URL` dengan domain API asli (production/staging masing-masing).
- `docker-compose.prod.yml`, `docker-compose.staging.yml`: cek komentar yang
  menyebut repo/domain generic, update kalau ada.
- Kalau user KOSONGKAN bagian Domain/Repo/Server → JANGAN diisi asal-asalan.
  Biarkan placeholder apa adanya, tapi tambahkan catatan di ringkasan laporan
  (langkah 9) bahwa ini masih perlu diisi manual sebelum deploy pertama kali,
  dan arahkan ke `docs/deployment-server-setup.md`.

### 9. Laporkan ke user
Setelah semua file diupdate, kasih ringkasan dalam format:
```
## Project Init — [Nama Project]

Checklist Kebutuhan Komponen (sesuai yang kamu isi):
| Komponen | Status | Dokumen |
|---|---|---|
| Multi-tenant SaaS | ✅ Ya / ⬜ Tidak (dihapus) | ... |
| Komponen Alamat | ... | ... |
[ulangi utk semua 11 baris checklist — supaya user bisa cross-check tidak ada yang salah tercentang]

File yang diupdate:
- CLAUDE.md (root, api, web)
- docs/decisions/[adr-0001 diupdate / adr-XXXX dibuat baru, nomor urut benar]
- docs/architecture/[daftar file yang disentuh/dihapus sesuai checklist]
- docs/phases/phase-00-fondasi.md (draft — scope sesuai checklist)
- docs/phases/phase-01-[nama].md (draft)
- docs/PROGRESS.md (roadmap [N] fase, Fase 00 aktif duluan)
- docs/glossary.md
- [Caddyfile, .env.production.example — HANYA kalau domain/repo diisi]

Asumsi yang saya ambil (tolong dikoreksi kalau salah):
- [list asumsi, misal "saya asumsikan auth pakai email+password, bukan OAuth,
  karena tidak disebutkan"]

[Kalau domain/repo belum diisi, tambahkan baris ini:]
Catatan: domain/repo belum diisi, jadi Caddyfile dan .env.production.example
masih placeholder. Isi manual sebelum deploy pertama — lihat
docs/deployment-server-setup.md.

Siap mulai Fase 01? Kalau ya, saya lanjut ke skill phase-workflow.
```

### 10. JANGAN langsung eksekusi Fase 01
Skill ini cuma bootstrap dokumentasi. Setelah lapor ke langkah 9, BERHENTI dan
tunggu konfirmasi user sebelum mulai coding beneran (itu baru masuk skill
`phase-workflow`). Jangan gabungkan dua skill ini jadi satu jalan otomatis
tanpa jeda konfirmasi — user perlu kesempatan koreksi asumsi dulu.
