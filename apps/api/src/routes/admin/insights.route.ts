import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { dataUsaha, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { getCompanyTimezone } from "../../lib/company-timezone";
import { getSummary, getTenure, getTrend, isKnownModule, listCustomers, listExpiring, listFeatureCustomers, listFeatures, listNewSubscriptions } from "../../lib/insights-data";
import { monthKey, monthOf, parseMonthKey, resolveDateRange } from "../../lib/admin-insights";
import { listSeatsForDataUsaha } from "../../lib/seat-queries";

// § Fase 189C, ADR-0044 — API Insight pelanggan (READ-ONLY) untuk kebutuhan data client FAC. Izin `insights.view` (Super Admin & Admin, D6). Route hanya mengambil data lewat
// `lib/insights-data.ts` dan merumuskan lewat `lib/admin-insights.ts` (murni, diuji data sintetis). Definisi baku: docs/phases/phase-189c-api-insight.md. Berisi DATA PRIBADI
// (email/telepon/perusahaan): jangan masuk log; ekspor CSV dicatat audit.
const pageQuery = {
  page: t.Optional(t.Numeric({ minimum: 0, maximum: 100_000 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
};

export const adminInsightsRoute = new Elysia({ prefix: "/admin/insights" })
  .use(permissionPlugin)
  .get("/summary", async () => getSummary(new Date(), await getCompanyTimezone()), { permission: "insights.view" })
  .get(
    "/customers",
    async ({ query }) => listCustomers({ q: query.q, type: query.type ?? "all", page: query.page ?? 0, pageSize: query.pageSize ?? 20, now: new Date() }),
    {
      permission: "insights.view",
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        type: t.Optional(t.Union([t.Literal("all"), t.Literal("commercial"), t.Literal("internal")])),
        ...pageQuery,
      }),
    },
  )
  // Butir 4: akses per pelanggan — tiap Data Usaha miliknya beserta slot User Tambahan (member/undangan/tersedia, masa berlaku kursi).
  .get(
    "/customers/:userId/access",
    async ({ params, set }) => {
      const [owner] = await db.select({ id: userTable.id, name: userTable.name, email: userTable.email, companyName: userTable.companyName }).from(userTable).where(eq(userTable.id, params.userId));
      if (!owner) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }
      const owned = await db.select({ id: dataUsaha.id, name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.userId, owner.id)).orderBy(asc(dataUsaha.createdAt));
      const now = Date.now();
      const result = await Promise.all(owned.map(async (du) => ({ ...du, seats: await listSeatsForDataUsaha(du.id, now) })));
      return { owner, dataUsaha: result };
    },
    { permission: "insights.view", params: t.Object({ userId: t.String({ minLength: 1, maxLength: 100 }) }) },
  )
  // Butir 2: pengguna per fitur (jumlah) lalu daftar pelanggan pemakai satu fitur.
  .get("/features", async () => ({ features: await listFeatures(new Date()) }), { permission: "insights.view" })
  .get(
    "/features/:moduleKey/customers",
    async ({ params, query, set }) => {
      if (!isKnownModule(params.moduleKey)) {
        set.status = 404;
        return { code: "MODULE_NOT_FOUND" };
      }
      return listFeatureCustomers({ moduleKey: params.moduleKey, now: new Date(), page: query.page ?? 0, pageSize: query.pageSize ?? 20 });
    },
    { permission: "insights.view", params: t.Object({ moduleKey: t.String({ minLength: 1, maxLength: 50 }) }), query: t.Object({ ...pageQuery }) },
  )
  // Butir 5: pelanggan/langganan baru dalam rentang tanggal (zona waktu perusahaan, `to` inklusif, maks ±24 bulan).
  .get(
    "/new",
    async ({ query, set }) => {
      const range = resolveDateRange(query.from, query.to, await getCompanyTimezone());
      if (!range.ok) {
        set.status = 422;
        return { code: range.code };
      }
      const result = await listNewSubscriptions({ start: range.start, endExclusive: range.endExclusive, page: query.page ?? 0, pageSize: query.pageSize ?? 20 });
      return { range: { from: query.from, to: query.to }, ...result };
    },
    { permission: "insights.view", query: t.Object({ from: t.String({ maxLength: 10 }), to: t.String({ maxLength: 10 }), ...pageQuery }) },
  )
  // Butir 6: langganan yang akan berakhir dalam 14 atau 30 hari (hanya dua preset, D14) beserta status tagihan perpanjangan.
  .get(
    "/expiring",
    async ({ query }) => listExpiring({ now: new Date(), windowDays: query.window === "14" ? 14 : 30, page: query.page ?? 0, pageSize: query.pageSize ?? 20 }),
    { permission: "insights.view", query: t.Object({ window: t.Union([t.Literal("14"), t.Literal("30")]), ...pageQuery }) },
  )
  // Butir 5–7 + uang: tren 12 bulan untuk SATU tahun (filter tahun), bulan ini vs bulan lalu, selisih dan %. Metrik: registered · active · new · stopped · money.
  .get(
    "/trend",
    async ({ query }) => getTrend({ year: query.year, metric: query.metric, now: new Date(), timeZone: await getCompanyTimezone() }),
    {
      permission: "insights.view",
      query: t.Object({
        year: t.Numeric({ minimum: 2020, maximum: 2100 }),
        metric: t.Union([t.Literal("registered"), t.Literal("active"), t.Literal("new"), t.Literal("stopped"), t.Literal("money")]),
      }),
    },
  )
  // Butir 7: rincian pelanggan aktif menurut USIA langganan di satu bulan (Baru / Lanjutan tahun ke-1 / Tahun ke-2.. / Berhenti / Kembali).
  .get(
    "/tenure",
    async ({ query, set }) => {
      const timeZone = await getCompanyTimezone();
      const current = monthOf(new Date(), timeZone);
      const month = query.month === undefined ? current : parseMonthKey(query.month);
      if (!month) {
        set.status = 422;
        return { code: "INVALID_MONTH" };
      }
      if (monthKey(month) > monthKey(current)) {
        set.status = 422;
        return { code: "FUTURE_MONTH" };
      }
      return getTenure(month, timeZone);
    },
    { permission: "insights.view", query: t.Object({ month: t.Optional(t.String({ maxLength: 7 })) }) },
  );
