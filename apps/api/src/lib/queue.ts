import { PgBoss } from "pg-boss";
import { env } from "./env";
import { logger } from "./logger";

// pg-boss v12: createQueue() WAJIB dipanggil sebelum send/work/schedule
// menargetkan queue itu — beda dari versi lama yang auto-create. Export
// named `PgBoss` (bukan default export) di v12.
export const boss = new PgBoss(env.DATABASE_URL);

boss.on("error", (err: Error) => logger.error({ err }, "pg-boss error"));

export const JOBS = {
  SEND_EMAIL: "send-email",
  EXPIRE_SUBSCRIPTIONS: "expire-subscriptions",
  REFRESH_ACCURATE_TOKEN: "refresh-accurate-token",
  IMPORT_TO_ACCURATE: "import-to-accurate",
  CANCEL_IMPORT: "cancel-import", // § Fase 09, ADR-0013
  PURGE_OLD_IMPORTS: "purge-old-imports", // § Fase 10 — retensi data import
  NOTIFY_EXPIRING_SOON: "notify-expiring-soon", // § Fase 45 — reminder H-sekian sebelum subscription/trial berakhir
  SEND_ANNOUNCEMENT: "send-announcement", // § Fase 45 — fan-out broadcast admin ke banyak penerima
} as const;

// § diminta user 2026-09-24 — default pg-boss (`expireInSeconds: 900` = 15
// menit) TIDAK PERNAH di-override sebelumnya (bukan aturan dari Accurate,
// murni kelalaian konfigurasi kita — § lessons-learned.md). Setelah
// `MAX_ROWS` naik 5.000→10.000, skenario terburuk (waktu itu diasumsikan)
// ≈ 10.000×2 ÷ 8 request/detik ≈ 2.500 detik (~42 menit) — override ke
// 3600 detik (60 menit).
//
// § BUG NYATA TERJADI 2026-09-25 (§ lessons-learned.md) — asumsi "2
// panggilan/baris" di atas TERLALU OPTIMIS: import Sales Quotation 10.000
// baris NYATA butuh ~3,5 panggilan/baris (customer lookup + item lookup +
// save), makan waktu ~78-82 menit — MELEWATI 3600 detik SAAT MASIH
// BERJALAN. `retryLimit` TIDAK PERNAH di-override (tetap default pg-boss
// = 2), jadi persis skenario yang sudah diperingatkan di komentar lama:
// pg-boss menganggap job "expired" di menit ke-60 lalu men-dispatch ULANG
// job yang SAMA (retry otomatis) SEMENTARA invocation lama MASIH JALAN
// (kode kita tidak tahu-menahu soal "expired" pg-boss, terus proses
// sampai selesai) — 2 invocation berebut kuota 8 req/detik yang SAMA
// untuk batch yang SAMA → PERSIS match count-nya: 1457 baris gagal
// (dilaporkan client) = SELURUH baris gagal terjadi HANYA di jendela 18
// menit sejak retry ke-2 mulai (dikonfirmasi lewat `pgboss.job.retry_count
// = 1` + `started_on` job = `created_on` + PERSIS 3600 detik + timestamp
// baris gagal pertama = detik yang SAMA). Untung TIDAK ada
// `accurate_transaction_id` duplikat kejadian ini (dicek manual), tapi
// race condition-nya tetap ada — TIDAK BOLEH dibiarkan.
//
// FIX (2 bagian, keduanya wajib):
// 1. `retryLimit: 0` — retry per-baris SUDAH ADA jalur sendiri yang aman
//    ("Retry baris gagal" di UI, lihat *-import.route.ts), pg-boss TIDAK
//    PERNAH boleh retry di level JOB untuk 2 queue ini — inilah yang
//    MENUTUP TOTAL kemungkinan 2 invocation jalan bersamaan untuk batch
//    yang sama, apa pun penyebab job-nya lambat.
// 2. `expireInSeconds` naik 3600→7200 (2 jam), dihitung ulang dari
//    throughput ASLI (~3,5-4 panggilan/baris, bukan asumsi lama 2) +
//    margin ekstra untuk modul lain yang mungkin lebih berat (classification/
//    serial number lookup) — 10.000 × 4 ÷ 8 ≈ 5.000 detik (~83 menit),
//    7200 detik kasih margin ~2x dari situ.
// Queue LAIN (email, refresh token, dst) TETAP pakai default (15 menit
// expire, retry 2x) — itu memang cukup & retry aman untuk kerjanya (tidak
// ada risiko "kirim dokumen 2x ke sistem eksternal" seperti import).
const LONG_RUNNING_QUEUES = new Set<string>([JOBS.IMPORT_TO_ACCURATE, JOBS.CANCEL_IMPORT]);
const LONG_RUNNING_QUEUE_OPTIONS = { expireInSeconds: 7200, retryLimit: 0 };

let started = false;

export async function startQueue() {
  if (started) return boss;
  await boss.start();
  for (const queue of Object.values(JOBS)) {
    await boss.createQueue(queue, LONG_RUNNING_QUEUES.has(queue) ? LONG_RUNNING_QUEUE_OPTIONS : undefined);
  }
  // § `createQueue` di atas pakai `ON CONFLICT DO NOTHING` (dikonfirmasi
  // dari sumber pg-boss) — TIDAK meng-update queue yang SUDAH ADA di
  // database (IMPORT_TO_ACCURATE/CANCEL_IMPORT sudah lama dibuat di
  // production, dari import-import sebelum perubahan ini). `updateQueue`
  // (beneran `UPDATE ... SET expire_seconds = ..., retry_limit = ...`)
  // WAJIB dipanggil terpisah supaya production ikut ke-update, bukan cuma
  // database baru/dev.
  for (const queue of LONG_RUNNING_QUEUES) {
    await boss.updateQueue(queue, LONG_RUNNING_QUEUE_OPTIONS);
  }
  started = true;
  return boss;
}
