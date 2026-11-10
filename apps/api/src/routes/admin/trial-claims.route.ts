import { Elysia, t } from "elysia";
import { and, desc, eq, ilike, isNull, isNotNull } from "drizzle-orm";
import { db } from "../../lib/db";
import { trialClaims, user as userTable, dataUsaha } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { releaseTrialClaim } from "../../lib/trial-claims";

// § Fase 217, ADR-0054, architecture-trial-database-ledger.md § 5 — daftar klaim trial per (database Accurate, modul) dan aksi
// "Lepas klaim" (Super Admin, `users.manage`, alasan wajib, diaudit). Klaim yang dilepas tidak dihapus.
export const adminTrialClaimsRoute = new Elysia({ prefix: "/admin/trial-claims" })
  .use(permissionPlugin)
  .get(
    "/",
    async ({ query }) => {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
      const filters = [];
      if (query.q) filters.push(ilike(trialClaims.accurateDbId, `%${query.q.trim()}%`));
      if (query.status === "released") filters.push(isNotNull(trialClaims.releasedAt));
      else if (query.status !== "all") filters.push(isNull(trialClaims.releasedAt));
      const rows = await db
        .select({
          id: trialClaims.id,
          accurateDbId: trialClaims.accurateDbId,
          accurateDbAlias: dataUsaha.accurateDbAlias,
          module: trialClaims.module,
          subscriptionId: trialClaims.subscriptionId,
          userId: trialClaims.userId,
          userEmail: userTable.email,
          dataUsahaName: dataUsaha.name,
          rowsUsed: trialClaims.rowsUsed,
          claimedAt: trialClaims.claimedAt,
          releasedAt: trialClaims.releasedAt,
          releaseReason: trialClaims.releaseReason,
        })
        .from(trialClaims)
        .leftJoin(userTable, eq(userTable.id, trialClaims.userId))
        .leftJoin(dataUsaha, eq(dataUsaha.id, trialClaims.dataUsahaId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(trialClaims.claimedAt))
        .limit(limit);
      return { claims: rows };
    },
    {
      permission: "users.view",
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 100 })),
        status: t.Optional(t.Union([t.Literal("active"), t.Literal("released"), t.Literal("all")])),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .post(
    "/:id/release",
    async ({ params, body, user, set }) => {
      const reason = body.reason.trim();
      if (reason.length < 3) {
        set.status = 400;
        return { code: "REASON_REQUIRED" };
      }
      const result = await releaseTrialClaim(params.id, user.id, reason);
      if (!result.ok) {
        set.status = result.code === "CLAIM_NOT_FOUND" ? 404 : 409;
        return { code: result.code };
      }
      return { released: true, accurateDbId: result.claim.accurateDbId, module: result.claim.module };
    },
    {
      permission: "users.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ reason: t.String({ minLength: 3, maxLength: 500 }) }),
    },
  );
