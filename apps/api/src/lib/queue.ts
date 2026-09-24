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
// `MAX_ROWS` naik 5.000→10.000, skenario terburuk (1 baris = 1 dokumen,
// tanpa grouping, + 1 panggilan find-or-create per baris kalau vendor/
// barang semuanya baru) ≈ 10.000×2 ÷ 8 request/detik (limit RESMI
// Accurate, § accurate-rate-limiter.ts) ≈ 2.500 detik (~42 menit) — jauh
// melewati 15 menit. Job yang "expired" di tengah proses bisa di-retry
// pg-boss (`retryLimit` default 2) SEMENTARA proses lama masih jalan →
// risiko transaksi dobel masuk Accurate. Override KHUSUS 2 queue yang
// benar-benar bisa long-running (import & cancel-nya, keduanya dibatasi
// rate limit Accurate yang sama) ke 3600 detik (60 menit, beri margin
// dari skenario terburuk ~42 menit) — queue LAIN (email, refresh token,
// dst) TETAP pakai default 15 menit, itu memang cukup untuk kerjanya.
const LONG_RUNNING_QUEUES = new Set<string>([JOBS.IMPORT_TO_ACCURATE, JOBS.CANCEL_IMPORT]);
const LONG_RUNNING_EXPIRE_SECONDS = 3600;

let started = false;

export async function startQueue() {
  if (started) return boss;
  await boss.start();
  for (const queue of Object.values(JOBS)) {
    await boss.createQueue(queue, LONG_RUNNING_QUEUES.has(queue) ? { expireInSeconds: LONG_RUNNING_EXPIRE_SECONDS } : undefined);
  }
  // § `createQueue` di atas pakai `ON CONFLICT DO NOTHING` (dikonfirmasi
  // dari sumber pg-boss) — TIDAK meng-update queue yang SUDAH ADA di
  // database (IMPORT_TO_ACCURATE/CANCEL_IMPORT sudah lama dibuat di
  // production, dari import-import sebelum perubahan ini). `updateQueue`
  // (beneran `UPDATE ... SET expire_seconds = ...`) WAJIB dipanggil
  // terpisah supaya production ikut naik, bukan cuma database baru/dev.
  for (const queue of LONG_RUNNING_QUEUES) {
    await boss.updateQueue(queue, { expireInSeconds: LONG_RUNNING_EXPIRE_SECONDS });
  }
  started = true;
  return boss;
}
