import "./lib/env"; // WAJIB paling awal, sebelum apa pun yang butuh env

import { Elysia } from "elysia";
import { cors } from "@elysia/cors";
import { sql } from "drizzle-orm";
import { db } from "./lib/db";
import { logger } from "./lib/logger";
import { Sentry } from "./lib/sentry";
import { auth } from "./lib/auth";
import { webOriginsProd } from "./lib/env";
import { rateLimitPlugin } from "./lib/rate-limit";
import { settingsRoute } from "./routes/settings.route";
import { mediaRoute } from "./routes/media.route";
import { plansRoute } from "./routes/plans.route";
import { subscriptionsRoute } from "./routes/subscriptions.route";
import { adminPlansRoute } from "./routes/admin/plans.route";
import { adminUsersRoute } from "./routes/admin/users.route";
import { adminSubscriptionsRoute } from "./routes/admin/subscriptions.route";
import { brandingRoute } from "./routes/admin/branding.route";
import { adminAuditLogsRoute } from "./routes/admin/audit-logs.route";
import { adminStatsRoute } from "./routes/admin/stats.route";
import { accurateRoute } from "./routes/accurate.route";
import { meRoute } from "./routes/me.route";
import { invoicesRoute } from "./routes/invoices.route";
import { adminInvoicesRoute } from "./routes/admin/invoices.route";
import { ordersRoute } from "./routes/orders.route";
import { adminOrdersRoute } from "./routes/admin/orders.route";
import { purchaseInvoiceImportRoute } from "./routes/purchase-invoice-import.route";
import { salesInvoiceImportRoute } from "./routes/sales-invoice-import.route";
import { vendorPayableAccountImportRoute } from "./routes/vendor-payable-account-import.route";

const allowedOrigins = [
  "http://localhost:6209",
  "http://admin.localhost:6209",
  "http://app.localhost:6209",
  ...webOriginsProd,
];

// Elysia instance TANPA .listen() — supaya bisa di-test via `.handle()`
// (pola resmi Elysia testing) tanpa perlu bind port beneran. `index.ts`
// yang import file ini dan panggil .listen() sebagai entry point asli.
export const app = new Elysia()
  .use(cors({ origin: allowedOrigins, credentials: true }))
  .use(rateLimitPlugin({ pathPrefix: "/api/auth", windowMs: 60_000, max: 10 }))
  // § architecture-security.md §6 — header keamanan minimal.
  .onAfterHandle(({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    // Notasi bracket ("NODE_ENV") SENGAJA, bukan process.env.NODE_ENV —
    // Bun const-fold pola dot-notation itu SAAT BUILD (builder stage build
    // tanpa NODE_ENV=production di-set), header ini jadi TIDAK PERNAH
    // terpasang di production kalau pakai dot-notation. Lihat lib/auth.ts
    // § crossSubDomainCookies buat detail lengkap bug class ini.
    if (process.env["NODE_ENV"] === "production") {
      set.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
    }
  })
  .onError(({ code, error, set }) => {
    logger.error({ err: error, code }, "Unhandled error");
    // Body error SELALU bare {code, message} — BUKAN {data,error} manual
    // (§ docs/decisions/adr-0010-response-format-eden.md — Eden Treaty
    // sendiri yang jadi wrapper {data,error} di client berdasarkan HTTP
    // status, bukan bentuk body).
    // VALIDATION/PARSE: Elysia SUDAH set status yang benar (422/400) —
    // JANGAN ditimpa jadi 500 (bug yang ketemu sendiri pas security review
    // Fase 00: sebelumnya semua error non-NOT_FOUND dipaksa 500, termasuk
    // input tidak valid yang seharusnya 400/422).
    if (code === "VALIDATION" || code === "PARSE") {
      return { message: "Invalid request", code };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Not found", code };
    }
    Sentry.captureException(error);
    set.status = 500;
    return { message: "Internal server error", code };
  })
  .get("/health", async () => {
    await db.execute(sql`SELECT 1`);
    return { status: "ok" };
  })
  .mount(auth.handler) // expose /api/auth/* — cek elysiajs/elysia#1806 kalau 404
  .use(settingsRoute)
  .use(mediaRoute)
  .use(plansRoute)
  .use(subscriptionsRoute)
  .use(adminPlansRoute)
  .use(adminUsersRoute)
  .use(adminSubscriptionsRoute)
  .use(brandingRoute)
  .use(adminAuditLogsRoute)
  .use(adminStatsRoute)
  .use(accurateRoute)
  .use(meRoute)
  .use(invoicesRoute)
  .use(adminInvoicesRoute)
  .use(ordersRoute)
  .use(adminOrdersRoute)
  .use(purchaseInvoiceImportRoute)
  .use(salesInvoiceImportRoute)
  .use(vendorPayableAccountImportRoute);

export type App = typeof app;
