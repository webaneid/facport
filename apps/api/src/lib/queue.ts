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
} as const;

let started = false;

export async function startQueue() {
  if (started) return boss;
  await boss.start();
  for (const queue of Object.values(JOBS)) {
    await boss.createQueue(queue);
  }
  started = true;
  return boss;
}
