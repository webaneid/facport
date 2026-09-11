import "./lib/env"; // WAJIB paling awal, sebelum apa pun yang butuh env

import { Elysia } from "elysia";
import { cors } from "@elysia/cors";
import { sql, eq } from "drizzle-orm";
import { db } from "./lib/db";
import { logger } from "./lib/logger";
import { Sentry } from "./lib/sentry";
import { auth } from "./lib/auth";
import { user as userTable, roles, userRoles } from "./db/schema";
import { webOriginsProd } from "./lib/env";
import { rateLimitPlugin } from "./lib/rate-limit";
import { settingsRoute } from "./routes/settings.route";
import { mediaRoute } from "./routes/media.route";
import { plansRoute } from "./routes/plans.route";
import { subscriptionsRoute } from "./routes/subscriptions.route";
import { adminPlansRoute } from "./routes/admin/plans.route";
import { adminUsersRoute } from "./routes/admin/users.route";
import { adminStaffRoute } from "./routes/admin/staff.route";
import { adminImportBatchesRoute } from "./routes/admin/import-batches.route";
import { adminUserSubscriptionsRoute } from "./routes/admin/user-subscriptions.route";
import { adminSubscriptionsRoute } from "./routes/admin/subscriptions.route";
import { brandingRoute } from "./routes/admin/branding.route";
import { adminAuditLogsRoute } from "./routes/admin/audit-logs.route";
import { adminStatsRoute } from "./routes/admin/stats.route";
import { accurateRoute } from "./routes/accurate.route";
import { meRoute } from "./routes/me.route";
import { notificationsRoute } from "./routes/notifications.route";
import { customerCareRoute } from "./routes/customer-care.route";
import { invoicesRoute } from "./routes/invoices.route";
import { adminInvoicesRoute } from "./routes/admin/invoices.route";
import { ordersRoute } from "./routes/orders.route";
import { publicOrdersRoute } from "./routes/public/orders.route";
import { publicStatsRoute } from "./routes/public/stats.route";
import { adminOrdersRoute } from "./routes/admin/orders.route";
import { adminAnnouncementsRoute } from "./routes/admin/announcements.route";
import { adminCustomerCareRoute } from "./routes/admin/customer-care.route";
import { purchaseInvoiceImportRoute } from "./routes/purchase-invoice-import.route";
import { salesInvoiceImportRoute } from "./routes/sales-invoice-import.route";
import { vendorPayableAccountImportRoute } from "./routes/vendor-payable-account-import.route";
import { purchasePaymentImportRoute } from "./routes/purchase-payment-import.route";
import { salesReceiptImportRoute } from "./routes/sales-receipt-import.route";
import { journalVoucherImportRoute } from "./routes/journal-voucher-import.route";
import { otherPaymentImportRoute } from "./routes/other-payment-import.route";

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
  // § Fase 27, ADR-0025 — endpoint publik TANPA auth (link pembayaran
  // tanpa login) adalah target abuse paling mudah (spam upload gambar,
  // percobaan enumerasi order ID) — rate limit WAJIB, sama prinsip
  // dengan /api/auth di atas.
  .use(rateLimitPlugin({ pathPrefix: "/public", windowMs: 60_000, max: 20 }))
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
  // § Fase 29, ADR-0027 — cegat SEBELUM `.mount(auth.handler)` di bawah:
  // tolak login untuk akun `disabled` (dinonaktifkan Super Admin), balas
  // 403 rapi + kode `ACCOUNT_DISABLED` (diuji `app.test.ts`).
  // § Fase 106 (koreksi) — komentar lama di sini SALAH mengklaim
  // `databaseHooks` "tidak ada di versi ini" — TERBUKTI SALAH (lihat
  // `lib/auth.ts` `databaseHooks.user.create.after` yang sudah lama
  // jalan, DAN `databaseHooks.session.create.before` baru Fase 106).
  // Guard di SINI tetap DIPERTAHANKAN apa adanya (bukan dipindah ke hook)
  // karena hook Better Auth kalau `before` return `false` cuma bisa
  // hasilkan 401 generik (`FAILED_TO_CREATE_SESSION`), BUKAN 403 +
  // kode kustom seperti di sini — mengganti ke hook akan mengubah
  // kontrak API yang sudah diuji. `lib/auth.ts` sekarang PUNYA hook
  // SERUPA juga (session.create.before) tapi itu untuk menutup celah
  // JALUR LAIN (Google OAuth) yang TIDAK tersentuh intercept manual di
  // sini — keduanya berdampingan, bukan saling menggantikan.
  // `request.clone()` WAJIB — body `Request`
  // cuma bisa dibaca SEKALI, `auth.handler(request)` di bawah butuh
  // body ORIGINAL masih utuh buat Better Auth proses sign-in beneran.
  .post("/api/auth/sign-in/email", async ({ request, set }) => {
    const body = (await request
      .clone()
      .json()
      .catch(() => null)) as { email?: string } | null;
    if (body?.email) {
      // § security review 2026-09-05 (Critical) — Better Auth (versi
      // terpasang, `internal-adapter.mjs`) SELALU simpan & lookup email
      // dalam bentuk `.toLowerCase()`. Bandingkan `body.email` APA
      // ADANYA (tanpa normalisasi sama) bikin lookup di sini gagal
      // match untuk email ber-kapital ("User@Example.com") padahal DB
      // & Better Auth sendiri tetap match (lowercase) — akun `disabled`
      // BISA login lewat email di-uppercase-kan, menganulir TOTAL
      // guard ini. WAJIB `.toLowerCase()` di sini juga, SAMA PERSIS
      // normalisasi Better Auth, bukan cuma "trim".
      const email = body.email.trim().toLowerCase();
      const [row] = await db.select({ disabled: userTable.disabled }).from(userTable).where(eq(userTable.email, email));
      if (row?.disabled) {
        set.status = 403;
        return { code: "ACCOUNT_DISABLED" };
      }
    }
    return auth.handler(request);
  })
  // § Bug ditemukan 2026-09-06 — self-register (`POST /register` web →
  // `authClient.signUp.email` → HTTP request ke path INI) TIDAK PERNAH
  // dapat role "customer" (beda dari admin-provisioned di
  // `admin/users.route.ts`/`admin/staff.route.ts` yang eksplisit assign
  // role SETELAH `auth.api.signUpEmail()` — itu server-side function call
  // LANGSUNG, TIDAK lewat HTTP route ini sama sekali, jadi assignment di
  // sini TIDAK dobel-jalan untuk akun admin/staff). Akibat bug: user
  // tidak muncul di `GET /admin/users` (query filter WAJIB role
  // "customer") DAN login "gagal diam-diam" (`app/(protected)/layout.tsx`
  // redirect balik ke `/login` kalau `roles` kosong). `response.clone()`
  // WAJIB (bukan `request`, kita tidak baca body request di sini) — body
  // `Response` juga cuma bisa dibaca SEKALI, `return response` di bawah
  // butuh body ORIGINAL masih utuh buat diteruskan ke client.
  .post("/api/auth/sign-up/email", async ({ request }) => {
    const response = await auth.handler(request);
    if (response.ok) {
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as { user?: { id: string } } | null;
      if (body?.user?.id) {
        const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
        if (customerRole) {
          await db.insert(userRoles).values({ userId: body.user.id, roleId: customerRole.id }).onConflictDoNothing();
        }
      }
    }
    return response;
  })
  .mount(auth.handler) // expose /api/auth/* — cek elysiajs/elysia#1806 kalau 404
  .use(settingsRoute)
  .use(mediaRoute)
  .use(plansRoute)
  .use(subscriptionsRoute)
  .use(adminPlansRoute)
  .use(adminUsersRoute)
  .use(adminStaffRoute)
  .use(adminImportBatchesRoute)
  .use(adminUserSubscriptionsRoute)
  .use(adminSubscriptionsRoute)
  .use(brandingRoute)
  .use(adminAuditLogsRoute)
  .use(adminStatsRoute)
  .use(accurateRoute)
  .use(meRoute)
  .use(notificationsRoute)
  .use(customerCareRoute)
  .use(invoicesRoute)
  .use(adminInvoicesRoute)
  .use(ordersRoute)
  .use(publicOrdersRoute)
  .use(publicStatsRoute)
  .use(adminOrdersRoute)
  .use(adminAnnouncementsRoute)
  .use(adminCustomerCareRoute)
  .use(purchaseInvoiceImportRoute)
  .use(salesInvoiceImportRoute)
  .use(vendorPayableAccountImportRoute)
  .use(purchasePaymentImportRoute)
  .use(salesReceiptImportRoute)
  .use(journalVoucherImportRoute)
  .use(otherPaymentImportRoute);

export type App = typeof app;
