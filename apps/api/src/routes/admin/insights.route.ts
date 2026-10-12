import { Elysia, t } from "elysia";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { auditLogs, dataUsaha, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { getCompanyTimezone } from "../../lib/company-timezone";
import { customerUserIdsSubquery } from "../../lib/internal-accounts";
import { getConnectionHistory, getSummary, getTenure, getTrend, isKnownModule, listCustomers, listExpiring, listFeatureCustomers, listFeatures, listNewSubscriptions } from "../../lib/insights-data";
import { monthKey, monthOf, parseMonthKey, resolveDateRange } from "../../lib/admin-insights";
import { EXPORT_HOURLY_QUOTA, EXPORT_MAX_ROWS, capRows, connectionHistoryCsv, csvFile, customersCsv, expiringCsv, featureUsersCsv, formatLocalDateTime, newCsv, trendCsv } from "../../lib/insights-export";
import { moduleLabel } from "../../lib/module-catalog";
import { listSeatsForDataUsaha } from "../../lib/seat-queries";

// § Fase 189C, ADR-0044 — API Insight pelanggan (READ-ONLY) untuk kebutuhan data client FAC. Izin `insights.view` (Super Admin & Admin, D6). Route hanya mengambil data lewat
// `lib/insights-data.ts` dan merumuskan lewat `lib/admin-insights.ts` (murni, diuji data sintetis). Definisi baku: docs/phases/phase-189c-api-insight.md. Berisi DATA PRIBADI
// (email/telepon/perusahaan): jangan masuk log; ekspor CSV dicatat audit.
const pageQuery = {
  // maks 2.000 halaman × 100 = OFFSET ≤ 200.000 (OFFSET besar memaksa Postgres memindai & membuang baris — audit 189C, Low)
  page: t.Optional(t.Numeric({ minimum: 0, maximum: 2000 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
};

// Audit ekspor TIDAK menyimpan teks pencarian mentah (bisa berisi email/nama pelanggan = PII ikutan, audit 189C Medium) — hanya penanda dan panjangnya.
const searchFilter = (q: string | undefined) => ({ hasQ: !!q?.trim(), qLength: q?.trim().length ?? 0 });

export const adminInsightsRoute = new Elysia({ prefix: "/admin/insights" })
  .use(permissionPlugin)
  .get("/summary", async () => getSummary(new Date(), await getCompanyTimezone()), { permission: "insights.view" })
  .get(
    "/customers",
    async ({ query }) => listCustomers({ q: query.q, type: query.type ?? "all", kind: query.kind ?? "semua", page: query.page ?? 0, pageSize: query.pageSize ?? 20, now: new Date() }),
    {
      permission: "insights.view",
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        type: t.Optional(t.Union([t.Literal("all"), t.Literal("commercial"), t.Literal("internal")])),
        // jenis akun: pemilik (punya Data Usaha) · tambahan (pemegang slot aktif) · belum · semua
        kind: t.Optional(t.Union([t.Literal("semua"), t.Literal("pemilik"), t.Literal("tambahan"), t.Literal("belum")])),
        ...pageQuery,
      }),
    },
  )
  // Butir 4: akses per pelanggan — tiap Data Usaha miliknya beserta slot User Tambahan (member/undangan/tersedia, masa berlaku kursi).
  .get(
    "/customers/:userId/access",
    async ({ params, set }) => {
      // hanya akun ber-role customer (konsisten dengan definisi "pelanggan"); akun admin/staf tidak ditelusuri lewat endpoint ini (audit 189C, Low)
      const [owner] = await db
        .select({ id: userTable.id, name: userTable.name, email: userTable.email, companyName: userTable.companyName })
        .from(userTable)
        .where(and(eq(userTable.id, params.userId), inArray(userTable.id, customerUserIdsSubquery())));
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
  )
  // Butir 9: riwayat koneksi Accurate lintas pelanggan (sambung/pilih/konfirmasi/koreksi/putus) + ringkasan koreksi ("salah koneksi"). Rentang tanggal opsional (keduanya atau tidak sama sekali).
  .get(
    "/connection-history",
    async ({ query, set }) => {
      let range: { start: Date; endExclusive: Date } | undefined;
      if (query.from !== undefined || query.to !== undefined) {
        if (query.from === undefined || query.to === undefined) {
          set.status = 422;
          return { code: "RANGE_INCOMPLETE" };
        }
        const resolved = resolveDateRange(query.from, query.to, await getCompanyTimezone());
        if (!resolved.ok) {
          set.status = 422;
          return { code: resolved.code };
        }
        range = { start: resolved.start, endExclusive: resolved.endExclusive };
      }
      return getConnectionHistory({ q: query.q, kind: query.kind ?? "all", range, page: query.page ?? 0, pageSize: query.pageSize ?? 20 });
    },
    {
      permission: "insights.view",
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        kind: t.Optional(t.Union([t.Literal("all"), t.Literal("koreksi")])),
        from: t.Optional(t.String({ maxLength: 10 })),
        to: t.Optional(t.String({ maxLength: 10 })),
        ...pageQuery,
      }),
    },
  )
  // Ekspor CSV (D5): unduh LANGSUNG, maks 10.000 baris (lebih → dipotong, header `X-Export-Truncated: true`). Berisi data pribadi → izin `insights.view`, rate limit di app.ts, dan SETIAP ekspor
  // dicatat di audit (siapa, laporan, filter, jumlah baris); bila pencatatan gagal ekspor DITOLAK (tidak ada ekspor tanpa jejak). Sel berawalan = + - @ dinetralkan (`csvCell`).
  .get(
    "/export/:report",
    async ({ params, query, user, set }) => {
      const timeZone = await getCompanyTimezone();
      const now = new Date();
      // KUOTA PER AKUN (bukan hanya per IP): rate limit IP di app.ts mudah dihindari akun yang dibajak (ganti IP) dan menghukum IP kantor bersama. Dihitung dari audit ekspor
      // akun ini dalam 1 jam terakhir (insert audit sudah ada → murah, memakai indeks entity_type+action+created_at).
      const [recent] = await db
        .select({ n: count() })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, "insight_export"), eq(auditLogs.action, "export"), eq(auditLogs.actorId, user.id), gte(auditLogs.createdAt, new Date(now.getTime() - 60 * 60 * 1000))));
      if ((recent?.n ?? 0) >= EXPORT_HOURLY_QUOTA) {
        set.status = 429;
        return { code: "EXPORT_QUOTA_EXCEEDED" };
      }
      const fail = (status: number, code: string) => {
        set.status = status;
        return { code };
      };
      const bigPage = { page: 0, pageSize: EXPORT_MAX_ROWS + 1 };
      let csv: ReturnType<typeof customersCsv>;
      let truncated = false;
      let filters: Record<string, unknown> = {};

      if (params.report === "customers") {
        const { items } = await listCustomers({ q: query.q, type: query.type ?? "all", kind: query.accountKind ?? "semua", now, ...bigPage });
        const capped = capRows(items);
        truncated = capped.truncated;
        csv = customersCsv(capped.rows, timeZone);
        filters = { ...searchFilter(query.q), type: query.type ?? "all", accountKind: query.accountKind ?? "semua" };
      } else if (params.report === "feature-users") {
        if (!query.moduleKey) return fail(422, "MODULE_REQUIRED");
        if (!isKnownModule(query.moduleKey)) return fail(404, "MODULE_NOT_FOUND");
        const { items } = await listFeatureCustomers({ moduleKey: query.moduleKey, now, ...bigPage });
        const capped = capRows(items);
        truncated = capped.truncated;
        csv = featureUsersCsv(moduleLabel(query.moduleKey), capped.rows, timeZone);
        filters = { moduleKey: query.moduleKey };
      } else if (params.report === "new") {
        if (!query.from || !query.to) return fail(422, "RANGE_REQUIRED");
        const range = resolveDateRange(query.from, query.to, timeZone);
        if (!range.ok) return fail(422, range.code);
        const { items } = await listNewSubscriptions({ start: range.start, endExclusive: range.endExclusive, ...bigPage });
        const flat = newCsv(items, timeZone);
        const capped = capRows(flat.rows);
        truncated = capped.truncated;
        csv = { header: flat.header, rows: capped.rows };
        filters = { from: query.from, to: query.to };
      } else if (params.report === "expiring") {
        if (!query.window) return fail(422, "WINDOW_REQUIRED");
        const { items } = await listExpiring({ now, windowDays: query.window === "14" ? 14 : 30, ...bigPage });
        const flat = expiringCsv(items, timeZone);
        const capped = capRows(flat.rows);
        truncated = capped.truncated;
        csv = { header: flat.header, rows: capped.rows };
        filters = { window: query.window };
      } else if (params.report === "connection-history") {
        let range: { start: Date; endExclusive: Date } | undefined;
        if (query.from !== undefined || query.to !== undefined) {
          if (!query.from || !query.to) return fail(422, "RANGE_INCOMPLETE");
          const resolved = resolveDateRange(query.from, query.to, timeZone);
          if (!resolved.ok) return fail(422, resolved.code);
          range = { start: resolved.start, endExclusive: resolved.endExclusive };
        }
        const { items } = await getConnectionHistory({ q: query.q, kind: query.kind ?? "all", range, ...bigPage });
        const capped = capRows(items);
        truncated = capped.truncated;
        csv = connectionHistoryCsv(capped.rows, timeZone);
        filters = { ...searchFilter(query.q), kind: query.kind ?? "all", from: query.from ?? null, to: query.to ?? null };
      } else {
        if (query.year === undefined || !query.metric) return fail(422, "TREND_PARAMS_REQUIRED");
        const trend = await getTrend({ year: query.year, metric: query.metric, now, timeZone });
        csv = trendCsv(trend.points);
        filters = { year: query.year, metric: query.metric };
      }

      await db.insert(auditLogs).values({ entityType: "insight_export", entityId: params.report, action: "export", changes: { report: params.report, filters, rows: csv.rows.length, truncated }, actorId: user.id });

      const stamp = formatLocalDateTime(now, timeZone).slice(0, 10).replace(/-/g, "");
      return new Response(csvFile(csv), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="facport-${params.report}-${stamp}.csv"`,
          "Cache-Control": "no-store",
          "X-Export-Rows": String(csv.rows.length),
          "X-Export-Truncated": String(truncated),
        },
      });
    },
    {
      permission: "insights.view",
      params: t.Object({ report: t.Union([t.Literal("customers"), t.Literal("feature-users"), t.Literal("new"), t.Literal("expiring"), t.Literal("connection-history"), t.Literal("trend")]) }),
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        type: t.Optional(t.Union([t.Literal("all"), t.Literal("commercial"), t.Literal("internal")])),
        accountKind: t.Optional(t.Union([t.Literal("semua"), t.Literal("pemilik"), t.Literal("tambahan"), t.Literal("belum")])), // jenis akun (ekspor customers); `kind` dipakai riwayat koneksi
        moduleKey: t.Optional(t.String({ maxLength: 50 })),
        from: t.Optional(t.String({ maxLength: 10 })),
        to: t.Optional(t.String({ maxLength: 10 })),
        window: t.Optional(t.Union([t.Literal("14"), t.Literal("30")])),
        kind: t.Optional(t.Union([t.Literal("all"), t.Literal("koreksi")])),
        year: t.Optional(t.Numeric({ minimum: 2020, maximum: 2100 })),
        metric: t.Optional(t.Union([t.Literal("registered"), t.Literal("active"), t.Literal("new"), t.Literal("stopped"), t.Literal("money")])),
      }),
    },
  );
