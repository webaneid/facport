import { app } from "./app";
import { logger } from "./lib/logger";
import { startQueue } from "./lib/queue";

// § lessons-learned.md 2026-08-19 — pg-boss WAJIB di-`start()` di proses INI
// juga (bukan cuma proses worker), karena route (mis.
// purchase-invoice-import.route.ts) panggil `boss.send()` langsung dari
// HTTP handler. Sebelum Fase 02 tidak ada route yang benar-benar
// `boss.send()`, jadi gap ini baru ketahuan sekarang — `boss` instance
// SAMA (singleton dari lib/queue.ts) dipakai proses api DAN worker, tapi
// tiap proses harus `start()` sendiri-sendiri.
await startQueue();

const server = app.listen(process.env.PORT ?? 3001);

logger.info(`apps/api listening on port ${server.server?.port}`);

export type { App } from "./app";
export default app;
