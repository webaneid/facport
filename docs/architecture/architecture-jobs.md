# Architecture — Background Jobs / Queue

## Masalah yang Diselesaikan
Arsitektur sekarang (sebelum file ini) full synchronous — kirim email,
resize gambar besar, generate PDF, export data besar, semua diasumsikan
selesai dalam 1 request/response. Begitu ada tugas yang agak berat (>beberapa
detik), ini jadi timeout/bottleneck, dan user nunggu response yang seharusnya
bisa "diproses di belakang layar".

## Tool: `pg-boss` (default) — BUKAN BullMQ+Redis dari awal
**Kenapa Postgres-based, bukan Redis+BullMQ:** stack ini sudah jalankan
Postgres, MinIO, API, Web di 1 VPS kecil (lihat resource limit di
`docker-compose.prod.yml`) — nambah Redis cuma untuk job queue itu 1
container lagi yang makan RAM, untuk kebutuhan yang di skala awal belum tentu
perlu performa Redis. `pg-boss` jalan di atas Postgres yang SUDAH ada, zero
infra tambahan.

**Kapan pindah ke BullMQ+Redis:** kalau volume job sudah tinggi (ribuan
job/menit) atau butuh fitur lanjutan (job priority kompleks, rate limiting
per-job-type bawaan) — **revisit lewat ADR baru**, jangan pindah diam-diam
(dampak ke semua tempat yang enqueue job).

```ts
// apps/api/src/lib/queue.ts
import { PgBoss } from "pg-boss"; // named export di v12, BUKAN default export
import { env } from "./env";

export const boss = new PgBoss(env.DATABASE_URL);

// Definisikan job type dengan nama eksplisit, bukan string bebas tersebar
export const JOBS = {
  SEND_EMAIL: "send-email",
  IMPORT_TO_ACCURATE: "import-to-accurate", // proses bulk import Excel→Accurate per baris (generik lintas modul: Purchase Invoice, Vendor Akun Hutang, dst — dibedakan field `module` di `import_batches`), lihat architecture-accurate-integration.md
  REFRESH_ACCURATE_TOKEN: "refresh-accurate-token", // refresh OAuth token proaktif sebelum expired
  EXPIRE_SUBSCRIPTIONS: "expire-subscriptions", // job terjadwal harian, lihat architecture-subscription.md
} as const;

// ⚠️ pg-boss v12: `createQueue()` WAJIB dipanggil untuk tiap queue SEBELUM
// send/work/schedule menargetkannya — beda dari versi lama yang auto-create.
// Lupa panggil ini bikin error "Database not opened" yang membingungkan
// (§ docs/lessons-learned.md). Dipanggil sekali di startQueue() (dipanggil
// dari app.ts SEBELUM .listen() DAN dari workers/index.ts) — bukan inline
// di sini, supaya jelas urutan start-nya.
let started = false;
export async function startQueue() {
  if (started) return boss;
  await boss.start();
  for (const queue of Object.values(JOBS)) await boss.createQueue(queue);
  started = true;
  return boss;
}
```
**Belum ada job resize gambar terpisah** (`RESIZE_IMAGE` di draf awal
dokumen ini tidak pernah dibuat) — resize (`sharp`/`generateVariants()`)
saat ini masih jalan SINKRON di `media.route.ts`'s request handler, bukan
lewat queue, karena Media Library masih dipakai untuk file kecil (maks
5MB, § `architecture-storage.md`). Kalau nanti ada kebutuhan upload file
besar/batch, revisit jadi job async sesuai prinsip § "Job yang WAJIB
Lewat Queue" di bawah — dicatat di sini supaya tidak dikira konsisten
100% dengan prinsipnya sendiri tanpa penjelasan.

## Enqueue (dari Route/Service)
```ts
// apps/api/src/services/posts.service.ts
import { boss, JOBS } from "../lib/queue";

export async function publishPost(postId: string) {
  await db.update(posts).set({ status: "published" }).where(eq(posts.id, postId));
  await boss.send(JOBS.SEND_EMAIL, { template: "post-published", postId }); // fire-and-forget, TIDAK nunggu selesai
  return { data: { postId }, error: null }; // response balik SEGERA, tidak nunggu email terkirim
}
```

## Worker (Proses Terpisah, Bukan di Request Handler)
**Satu file `workers/index.ts`** yang daftar SEMUA `boss.work()`/
`boss.schedule()` (bukan 1 file per job type seperti draf awal
`email.worker.ts`) — lebih gampang lihat semua job aktif di 1 tempat
untuk skala project ini:
```ts
// apps/api/src/workers/index.ts — dijalankan SEPARATE dari index.ts API (proses beda)
import { boss, JOBS, startQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
import { sendEmail } from "../lib/email";

async function main() {
  await startQueue(); // WAJIB — createQueue() semua job type dulu, § di atas

  await boss.work<{ to: string; subject: string; html: string }>(JOBS.SEND_EMAIL, async ([job]) => {
    if (!job) return;
    try {
      await sendEmail(job.data); // lihat architecture-notifications.md
      logger.info({ jobId: job.id }, "Email job processed");
    } catch (err) {
      logger.error({ err, jobId: job.id }, "Email job failed");
      Sentry.captureException(err);
      throw err; // pg-boss otomatis retry sesuai konfigurasi (default 3x, exponential backoff)
    }
  });

  // ...boss.work()/boss.schedule() job lain didaftarkan di sini juga
}
main();
```
`app.ts` (proses API) **JUGA** panggil `startQueue()` sebelum `.listen()`
— dibutuhkan supaya `boss.send()` dari route bisa jalan (queue harus
"opened" di proses API juga, bukan cuma di proses worker) — kelupaan ini
pernah jadi bug nyata ("Database not opened" saat route coba enqueue job,
§ `docs/lessons-learned.md`).
```json
// apps/api/package.json — worker jalan sebagai proses terpisah
{
  "scripts": {
    "dev": "concurrently \"bun run dev:api\" \"bun run dev:worker\"",
    "dev:worker": "bun run --watch src/workers/index.ts",
    "start:worker": "bun run src/workers/index.ts"
  }
}
```

## Docker — Worker Sebagai Service Terpisah
```yaml
# docker-compose.prod.yml — TAMBAHAN, bukan pengganti service "api"
  worker:
    image: ghcr.io/${GITHUB_REPO}/api:${IMAGE_TAG:-latest} # image SAMA dengan api, entrypoint beda
    restart: unless-stopped
    command: ["bun", "run", "dist/workers/index.js"]
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
    networks: [internal]
    mem_limit: 256m
    cpus: 0.5
```
> Worker pakai image yang SAMA dengan `api` (satu Dockerfile, dua command
> berbeda) — bukan Dockerfile terpisah, supaya tidak ada drift dependency
> antara API dan worker.

## Job yang WAJIB Lewat Queue (Bukan Sinkron)
- Kirim email/notifikasi (§ `architecture-notifications.md`)
- Resize/generate image variants untuk file besar (§ `components/architecture-component-image-processing.md`
  — untuk file kecil, sinkron masih oke; untuk batch/file besar, queue)
- **Import data Excel → Accurate Online** (§ `architecture-accurate-integration.md`)
  — ribuan baris per batch, WAJIB async + resumable per-row
- **Refresh token OAuth Accurate** sebelum expired (§ `architecture-accurate-integration.md`)
- Export data (CSV/PDF besar)

## Multi-Produk (Fase 117) — Queue Sudah Cukup Generik
`JOBS` cuma string enum, `boss.work()`/`boss.schedule()` job-type-agnostic —
dikonfirmasi (riset Fase 117) sistem ini TIDAK butuh perubahan apa pun untuk
Produk baru. Job Accurate-specific (`IMPORT_TO_ACCURATE`, `CANCEL_IMPORT`,
`REFRESH_ACCURATE_TOKEN`) TETAP scope Produk Facport saja. AutoProduksi
(kalau butuh proses async, mis. rekalkulasi stok dari formula) akan dapat
job type BARU sendiri (pola sama `SEND_ANNOUNCEMENT`/`PURGE_OLD_IMPORTS` —
1 baris konstanta + 1 `boss.work()`) pas fase build-nya, TIDAK lewat
`IMPORT_TO_ACCURATE` (2 titik gating di worker-nya unconditional assume
koneksi Accurate ada — lihat `architecture-product-lines.md`). Konverter
(100% client-side) TIDAK butuh job/queue sama sekali. Tidak ada perubahan
kode di file ini fase 117.

## Job Terjadwal (Scheduled, Bukan Cuma Reaktif dari Enqueue)
`pg-boss` juga support **cron-style scheduling** (`boss.schedule()`), dipakai
untuk job yang jalan berkala tanpa trigger user, mis.:
```ts
// apps/api/src/workers/index.ts
await boss.schedule(JOBS.EXPIRE_SUBSCRIPTIONS, "0 1 * * *"); // tiap jam 1 pagi
await boss.schedule(JOBS.REFRESH_ACCURATE_TOKEN, "0 2 * * *"); // tiap hari jam 2 pagi — access token Accurate expire 15 hari, tidak perlu sesering ini (terverifikasi § architecture-accurate-integration.md §1)
```

## Retry & Dead Letter
`pg-boss` retry otomatis (default 3x, exponential backoff) — job yang tetap
gagal setelah retry masuk status `failed`, WAJIB ada monitoring (Sentry akan
capture exception-nya, lihat contoh di atas) supaya job gagal tidak
diam-diam hilang tanpa siapa pun tahu.

## Timeout Job (`expireInSeconds`) — WAJIB Dihitung dari Throughput ASLI, Bukan Ditebak
`pg-boss` punya default `expireInSeconds: 900` (15 menit) per queue — **ini
BUKAN aturan dari Accurate**, murni default library yang kalau tidak
di-override, dipakai apa adanya (§ `docs/lessons-learned.md` 2026-09-24).
Job yang "expired" di tengah proses bisa di-retry (`retryLimit` default 2)
SEMENTARA proses lama masih jalan → risiko transaksi dobel masuk Accurate
kalau job itu sifatnya "panggil Accurate berkali-kali" (import/cancel).

**⚠️ Bug NYATA terjadi 2026-09-25** (§ `docs/lessons-learned.md`) — persis
risiko yang diperingatkan di atas: `expireInSeconds` lama (3600 detik)
dihitung dari asumsi "2 panggilan Accurate/baris" yang TERLALU OPTIMIS
untuk Sales Quotation (nyatanya ~3,5 panggilan/baris — customer lookup +
item lookup + save), 10.000 baris makan waktu ~78-82 menit, MELEWATI 3600
detik SAAT MASIH BERJALAN. `retryLimit` tidak pernah di-override (default
pg-boss = 2) → pg-boss otomatis retry job yang sama di menit ke-60,
SEMENTARA invocation lama masih jalan → 2 invocation berebut kuota 8
request/detik untuk batch yang SAMA → 1.457 baris gagal dengan pesan
rate-limit Accurate (dikonfirmasi presisi lewat 3 query SQL: `retry_count=1`,
timing `started_on` = `created_on`+3600 detik PERSIS, jumlah baris gagal
match PERSIS dengan window waktu setelah retry itu).

**Fix (`lib/queue.ts`, berlaku untuk `IMPORT_TO_ACCURATE`/`CANCEL_IMPORT`)**:
- **`retryLimit: 0`** — retry per-baris SUDAH ADA jalur sendiri yang aman
  ("Retry baris gagal" di UI), pg-boss TIDAK PERNAH BOLEH retry di level
  JOB untuk 2 queue ini. Ini yang MENUTUP TOTAL risiko 2 invocation batch
  yang sama jalan bersamaan, apa pun penyebab lambatnya nanti — **WAJIB
  ada untuk queue apa pun yang memanggil API pihak ketiga berkali-kali**,
  jangan andalkan `expireInSeconds` besar saja sebagai satu-satunya jaring
  pengaman.
- `expireInSeconds` naik 3600→**7200 detik (2 jam)**, dihitung ulang dari
  throughput ASLI (~3,5-4 panggilan/baris, bukan asumsi lama 2): `MAX_ROWS`
  (10.000) × 4 ÷ 8 request/detik (limit RESMI Accurate, §
  `accurate-rate-limiter.ts`) ≈ 83 menit — 7200 detik kasih margin ~1x
  lipat dari situ. **Kalau `MAX_ROWS` dinaikkan lagi nanti ATAU ada modul
  baru yang ternyata butuh lebih banyak panggilan/baris (mis. serial
  number/classification lookup), hitung ulang angka ini dari throughput
  ASLI (bukan asumsi) — JANGAN dibiarkan di 7200 begitu saja.**
- Tambahan defensif (`accurate-rate-limiter.ts`): retry-with-backoff (maks
  4x, eksponensial+jitter) khusus untuk pesan Accurate "melebihi
  toleransi" — supaya tabrakan sesaat yang genuinely dari luar kendali
  kita (klien pakai Accurate Desktop bersamaan, dll) sembuh sendiri,
  bukan langsung jadi kegagalan permanen per baris.

`createQueue()` pakai `ON CONFLICT DO NOTHING` (dikonfirmasi dari sumber
pg-boss) — TIDAK meng-update queue yang SUDAH ADA di database. Perubahan
`expireInSeconds`/`retryLimit` untuk queue yang sudah pernah dibuat (kasus
production) WAJIB lewat `updateQueue()` juga (beneran `UPDATE`), bukan cuma
ganti opsi di `createQueue()` dan berharap efeknya otomatis — `startQueue()`
sudah memanggil keduanya untuk queue yang masuk `LONG_RUNNING_QUEUES`.

## Referensi
- Notifikasi email/WA → `docs/architecture/architecture-notifications.md`
- Observability (Sentry/Pino) → `docs/architecture/architecture-observability.md`
