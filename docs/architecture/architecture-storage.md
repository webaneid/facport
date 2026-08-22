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

**⚠️ Gap terbuka, BELUM diselesaikan (dicatat sejak security review Fase
00, § `docs/lessons-learned.md`)**: karena Opsi A dipakai, response
`media.upload` cuma balikin `storageKey` (path internal MinIO), BUKAN URL
yang bisa langsung dipakai `<img src>` di browser — MinIO bucket-nya
private, bukan public-read, dan tidak ada endpoint proxy/presign buat
generate URL yang bisa diakses browser. `MediaLibraryModal`
(`apps/web/components/media-library/media-library-modal.tsx`) saat ini
masih naive nyimpen `storageKey` mentah seakan-akan itu URL — LATEN, belum
ketauan karena komponen ini baru dipakai di halaman dev/test
(`apps/web/app/dev/components-test/page.tsx`), BELUM dipakai fitur nyata
manapun. **WAJIB diselesaikan SEBELUM fitur pertama yang benar-benar
nampilin gambar dari MinIO ke user** — opsi: (a) endpoint
`GET /media/:id/url` yang generate presigned GET URL sekali pakai/expiry
pendek, atau (b) endpoint proxy `GET /media/:id` yang stream isi file
lewat API. Belum diputuskan yang mana.

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
```

## Public vs Private Bucket
Bucket `facport-media` **private** (bukan public-read) — belum pakai CDN
di depan MinIO. Konsekuensinya persis gap "Gap terbuka" di atas: TANPA
endpoint proxy/presign, file yang sudah ke-upload TIDAK BISA diakses
browser sama sekali dari URL storageKey mentah.

## Catatan
- Validasi tipe file (magic-bytes via `sharp.metadata()`, bukan cuma
  percaya `Content-Type` dari client) & ukuran maksimal (`t.File({type,
  maxSize})` di layer schema Elysia) SEBELUM buffer di-proses penuh — pola
  ini sudah diterapkan di `media.route.ts`, ikuti pola yang sama untuk
  endpoint upload baru.
