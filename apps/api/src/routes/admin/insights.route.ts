import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { dataUsaha, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { getCompanyTimezone } from "../../lib/company-timezone";
import { getSummary, listCustomers } from "../../lib/insights-data";
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
  );
