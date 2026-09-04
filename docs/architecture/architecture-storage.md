# Architecture — Storage (MinIO)

## Struktur Bucket
Satu bucket (`facport-media`, konstanta `MEDIA_BUCKET` di `lib/minio.ts`),
key per file diorganisir per random UUID, bukan per-entity folder:
```
facport-media/
  uploads/{media_id}/original.webp
  uploads/{media_id}/{variant_name}.webp   # thumbnail, dst — lihat services/image-processing.service.ts
```
Semua gambar dikonversi ke `.webp` saat upload (`sharp`), terlepas dari
format aslinya (jpeg/png masuk) — `id` (UUID) itu sendiri jadi primary key
baris `media`, jadi `storageKey` tinggal turunan dari `id`, tidak perlu
tabel/nama lain buat nge-link balik.

## Alur Upload — TERPILIH: Opsi A (Proxy lewat API)
```
Client → POST /media/upload (multipart) → API buffer file → validasi
magic-bytes (sharp.metadata()) → generate variants → API putObject ke
MinIO → API simpan row `media` (storageKey, variants) → return row
```
Dipilih karena lebih simpel untuk fase saat ini (Opsi B/presigned URL
TIDAK diimplementasikan) — lihat `apps/api/src/routes/media.route.ts`
untuk implementasi lengkap. Trade-off yang diterima: server ikut menahan
beban proses upload (buffer penuh + resize sinkron di request handler),
bukan pilihan performa terbaik untuk file besar/traffic tinggi — cukup
untuk kebutuhan saat ini (Media Library internal, bukan upload publik
skala besar).

**⚠️ Gap RESOLVED SEBAGIAN (Fase 12, ADR-0017)** — untuk kategori **aset
branding publik** (logo/favicon company), gap ini sudah diselesaikan lewat
bucket terpisah `facport-public` (public-read), lihat § "Bucket Kedua:
Aset Branding Publik" di bawah. Untuk kategori **media lain yang privat**
(dokumen/gambar user via `POST /media/upload` yang tetap ke `facport-media`),
gap **TETAP TERBUKA** — response `media.upload` masih cuma balikin
`storageKey` (path internal MinIO), BUKAN URL yang bisa langsung dipakai
`<img src>` di browser. `MediaLibraryModal`
(`apps/web/components/media-library/media-library-modal.tsx`) masih naive
nyimpen `storageKey` mentah seakan-akan itu URL — LATEN, belum ketauan
karena komponen ini baru dipakai di halaman dev/test
(`apps/web/app/dev/components-test/page.tsx`), BELUM dipakai fitur nyata
manapun. **WAJIB diselesaikan SEBELUM ada fitur nyata lain yang benar-benar
nampilin gambar PRIVAT dari `facport-media` ke user** — opsi: (a) endpoint
`GET /media/:id/url` yang generate presigned GET URL sekali pakai/expiry
pendek, atau (b) endpoint proxy `GET /media/:id` yang stream isi file
lewat API. Belum diputuskan yang mana — JANGAN otomatis pakai pola bucket
public seperti branding (§ ADR-0017 § "Alternatif yang Dipertimbangkan"
— sengaja tidak digeneralisasi tanpa kebutuhan konkret).

## Konfigurasi Client (Bun/Elysia)
```ts
// apps/api/src/lib/minio.ts
import { Client } from "minio";
import { env } from "./env"; // WAJIB via env.ts yang sudah divalidasi, bukan process.env langsung

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: Number(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL === "true",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const MEDIA_BUCKET = "facport-media";
export const PUBLIC_MEDIA_BUCKET = "facport-public"; // § Fase 12, ADR-0017
```

## Public vs Private Bucket
Bucket `facport-media` **private** (bukan public-read) — belum pakai CDN
di depan MinIO. Konsekuensinya persis gap "Gap terbuka" di atas: TANPA
endpoint proxy/presign, file yang sudah ke-upload TIDAK BISA diakses
browser sama sekali dari URL storageKey mentah.

## Bucket Kedua: Aset Branding Publik (Fase 12, ADR-0017)
`facport-public` — bucket **public-read** (`s3:GetObject` untuk semua
principal, HANYA pada bucket ini), terpisah dari `facport-media` yang tetap
private. Khusus dipakai untuk logo & favicon company (aset yang MEMANG
publik: tampil di landing page tanpa login, favicon di-fetch browser tanpa
auth) — BUKAN tempat umum untuk media lain.
```
facport-public/
  branding/logo-{uuid}.webp
  branding/favicon-{uuid}/16.png
  branding/favicon-{uuid}/32.png
  branding/favicon-{uuid}/180.png
  branding/favicon-{uuid}/512.png
```
Diakses browser lewat host terpisah `media.<domain>` (Caddy `reverse_proxy
minio:9000`, MinIO sendiri TETAP di network internal — lihat
`docs/architecture/architecture-deployment.md` § "Host Baru: media.<domain>").
Base URL browser-facing disimpan di env var `MINIO_PUBLIC_URL`, BEDA dari
`MINIO_ENDPOINT` (host internal Docker network, cuma bisa diakses server):
```
MINIO_PUBLIC_URL = http://localhost:9000        # dev
MINIO_PUBLIC_URL = https://media.<domain>        # production
```
URL lengkap yang disimpan ke `settings.company.logo`/`company.favicon` =
`${MINIO_PUBLIC_URL}/${PUBLIC_MEDIA_BUCKET}/${key}` — server yang
construct, frontend tinggal pakai URL jadi, tidak perlu tahu detail
bucket/key (§ `architecture-settings.md`).

## Catatan
- Validasi tipe file (magic-bytes via `sharp.metadata()`, bukan cuma
  percaya `Content-Type` dari client) & ukuran maksimal (`t.File({type,
  maxSize})` di layer schema Elysia) SEBELUM buffer di-proses penuh — pola
  ini sudah diterapkan di `media.route.ts`, ikuti pola yang sama untuk
  endpoint upload baru.
