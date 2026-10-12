import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { dataUsaha, plans, subscriptions, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { getInternalReason } from "../../lib/internal-accounts";
import { InternalGrantError, cheapestPlanPerModule, grantInternalAccess, resolveGrantModules, revokeInternalGrants } from "../../lib/internal-grants";
import { moduleLabel } from "../../lib/module-catalog";

// § Fase 191, D9 Lapis 2 — hibah akses internal tanpa tanggal akhir (`lib/internal-grants.ts`). Izin `subscriptions.manage` (sama dengan mode "Gratis"). Hanya akun INTERNAL efektif yang boleh
// menerima hibah (409 NOT_INTERNAL), Data Usaha harus milik akun itu (404), modul harus dikenal (422). Dua langkah: pratinjau lalu terapkan; semua tercatat di audit.
const idParams = t.Object({ id: t.String({ minLength: 1, maxLength: 100 }) });
const grantBody = t.Object({
  dataUsahaId: t.String({ format: "uuid" }),
  moduleKeys: t.Union([t.Literal("all"), t.Array(t.String({ minLength: 1, maxLength: 60 }), { minItems: 1, maxItems: 100 })]),
});

export const adminInternalGrantsRoute = new Elysia({ prefix: "/admin/users" })
  .use(permissionPlugin)
  .post(
    "/:id/internal-grant/preview",
    async ({ params, body, set }) => {
      const [owner] = await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(eq(userTable.id, params.id));
      if (!owner) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }
      const internal = (await getInternalReason(owner.id)) !== null;
      const keys = resolveGrantModules(body.moduleKeys);
      if (!keys) {
        set.status = 422;
        return { code: "UNKNOWN_MODULE" };
      }
      const [du] = await db.select({ id: dataUsaha.id, name: dataUsaha.name }).from(dataUsaha).where(and(eq(dataUsaha.id, body.dataUsahaId), eq(dataUsaha.userId, owner.id)));
      if (!du) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const planByModule = await cheapestPlanPerModule(db, keys);
      const active = await db
        .select({ id: subscriptions.id, modules: plans.modules, internalGrant: subscriptions.internalGrant })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(and(eq(subscriptions.dataUsahaId, du.id), eq(subscriptions.status, "active"), eq(plans.kind, "module")));
      return {
        internal,
        dataUsaha: du,
        modules: keys.map((key) => {
          const existing = active.filter((s) => s.modules[0] === key);
          const status = existing.some((s) => s.internalGrant) ? ("already" as const) : !planByModule.has(key) ? ("no_plan" as const) : ("will_grant" as const);
          return { key, label: moduleLabel(key), status, replaces: status === "will_grant" ? existing.length : 0 };
        }),
      };
    },
    { permission: "subscriptions.manage", params: idParams, body: grantBody },
  )
  .post(
    "/:id/internal-grant",
    async ({ params, body, user, set }) => {
      try {
        const result = await db.transaction((tx) => grantInternalAccess(tx, { ownerId: params.id, dataUsahaId: body.dataUsahaId, moduleKeys: body.moduleKeys, actorId: user.id }));
        return { ok: true, ...result };
      } catch (err) {
        if (err instanceof InternalGrantError) {
          set.status = err.status;
          return { code: err.code };
        }
        throw err;
      }
    },
    { permission: "subscriptions.manage", params: idParams, body: grantBody },
  )
  .post(
    "/:id/internal-grant/revoke",
    async ({ params, body, user }) => {
      const revoked = await db.transaction((tx) => revokeInternalGrants(tx, { userIds: [params.id], dataUsahaId: body.dataUsahaId, actorId: user.id }));
      return { ok: true, revoked };
    },
    { permission: "subscriptions.manage", params: idParams, body: t.Object({ dataUsahaId: t.Optional(t.String({ format: "uuid" })) }) },
  );
