import { Elysia, t } from "elysia";
import { eq, desc, count } from "drizzle-orm";
import { db } from "../lib/db";
import { conversionLogs, user as userTable } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getAccessibleSubscriptionsWithPlans, DATA_USAHA_HEADER } from "../lib/subscription-gate";
import { hasAccessToDataUsaha } from "../lib/data-usaha";
import { checkAndRecordConversionRowBudget } from "../lib/trial";
import { MODULE_CATALOG } from "../lib/module-catalog";

// § Fase 150, ADR-0038, architecture-konverter.md — Produk Konverter TIDAK punya `import_batches`/route per-modul
// server-side (16 Varian, tapi SEMUA numpang 1 endpoint di sini, BEDA dari Facport yang 1 route per modul) —
// `moduleKey` dinamis dari BODY (bukan dari macro `moduleAccess()` yang butuh string statis saat route
// didefinisikan), jadi gating ditulis manual di handler, MENIRU PERSIS logic macro itu (§ `lib/subscription-gate.ts`
// `moduleAccess`) supaya perilakunya konsisten (multi-Data-Usaha ambigu → 409, dst).
const KONVERTER_MODULE_KEYS: ReadonlySet<string> = new Set(
  MODULE_CATALOG.filter((m) => m.productLine === "konverter").map((m) => m.key),
);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const conversionLogsRoute = new Elysia()
  .use(permissionPlugin)
  // § "Gerbang" kuota trial SEKALIGUS pencatatan (§ `checkAndRecordConversionRowBudget`, `lib/trial.ts`) — browser
  // WAJIB panggil ini SEBELUM tombol download aktif, `rowCount` = hasil hitungan otomatis dari `summary()`
  // (baris yang lolos validasi build XML), BUKAN angka bebas yang diketik user.
  .post(
    "/me/conversion-logs",
    async ({ user, body, request, set }) => {
      if (!KONVERTER_MODULE_KEYS.has(body.moduleKey)) {
        set.status = 400;
        return { code: "INVALID_MODULE_KEY" };
      }

      const activeSubs = await getAccessibleSubscriptionsWithPlans(user.id);
      let candidates = activeSubs.filter((s) => s.plan.modules.includes(body.moduleKey));

      const requested = request.headers.get(DATA_USAHA_HEADER)?.trim().toLowerCase();
      if (requested) {
        if (!UUID_RE.test(requested) || !(await hasAccessToDataUsaha(user.id, requested))) {
          set.status = 403;
          return { code: "DATA_USAHA_FORBIDDEN" };
        }
        candidates = candidates.filter((s) => s.subscription.dataUsahaId === requested);
      } else if (new Set(candidates.map((s) => s.subscription.dataUsahaId)).size > 1) {
        set.status = 409;
        return { code: "DATA_USAHA_REQUIRED" };
      }

      const matching = candidates[0];
      if (!matching) {
        set.status = 403;
        return { code: "MODULE_NOT_SUBSCRIBED" };
      }

      const result = await checkAndRecordConversionRowBudget({
        subscriptionId: matching.subscription.id,
        userId: user.id,
        dataUsahaId: matching.subscription.dataUsahaId,
        moduleKey: body.moduleKey,
        fileName: body.fileName,
        rowCount: body.rowCount,
      });

      if (!result.ok) {
        set.status = 400;
        return { code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: result.remaining, max: result.max };
      }
      return { id: result.id };
    },
    {
      auth: true,
      body: t.Object({
        moduleKey: t.String({ minLength: 1, maxLength: 50 }),
        fileName: t.String({ minLength: 1, maxLength: 255 }),
        rowCount: t.Integer({ minimum: 0 }),
      }),
    },
  )
  // § Riwayat "Riwayat Konversi" — pola SAMA `GET /me/import-batches` (Arsip Import, § `me.route.ts`): scope MURNI
  // per Data Usaha (siapa pun yang convert, asal Data Usaha sama — owner lihat punya semua anggota tim), BUKAN
  // riwayat pribadi per-user. `dataUsahaId` WAJIB di query, `hasAccessToDataUsaha` digerbang dulu.
  .get(
    "/me/conversion-logs",
    async ({ user, query, set }) => {
      if (!(await hasAccessToDataUsaha(user.id, query.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = eq(conversionLogs.dataUsahaId, query.dataUsahaId);
      const [rows, totalRows] = await Promise.all([
        db
          .select({ conversionLogs, convertedByName: userTable.name })
          .from(conversionLogs)
          .innerJoin(userTable, eq(conversionLogs.userId, userTable.id))
          .where(where)
          .orderBy(desc(conversionLogs.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(conversionLogs).where(where),
      ]);
      const logs = rows.map((r) => ({ ...r.conversionLogs, convertedByName: r.convertedByName, convertedByYou: r.conversionLogs.userId === user.id }));
      return { logs, total: totalRows[0]?.total ?? 0 };
    },
    {
      auth: true,
      query: t.Object({
        dataUsahaId: t.String({ format: "uuid" }),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  );
