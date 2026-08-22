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

## Referensi
- Notifikasi email/WA → `docs/architecture/architecture-notifications.md`
- Observability (Sentry/Pino) → `docs/architecture/architecture-observability.md`
