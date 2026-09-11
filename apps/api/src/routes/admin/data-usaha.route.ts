import { Elysia, t } from "elysia";
import { eq, and } from "drizzle-orm";
import { db } from "../../lib/db";
import { dataUsaha, user as userTable, auditLogs, ownershipTransfers } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § Fase 111, architecture-user-tambahan.md — transfer kepemilikan Data
// Usaha DIBANTU ADMIN: LANGSUNG eksekusi tanpa accept-flow token (admin
// sudah tepercaya, pola sama override admin lain di project ini — mis.
// `admin/subscriptions.route.ts` bikin subscription tanpa payment).
// Permission `users.manage` (BUKAN permission baru) — reuse permission
// paling tinggi kepercayaannya (satu-satunya yang tidak didapat role
// "staff", § ADR-0027), pola disetujui di plan Fase 111 dibanding
// menambah 1 permission baru cuma untuk 1 endpoint ini.
export const adminDataUsahaRoute = new Elysia({ prefix: "/admin/data-usaha" })
  .use(permissionPlugin)
  // § Dipakai UI admin (dialog "Transfer Data Usaha" di halaman
  // `/admin/users`) untuk menampilkan daftar Data Usaha milik user yang
  // dipilih, supaya admin tahu ID mana yang mau ditransfer.
  .get(
    "/",
    async ({ query }) => {
      const rows = await db.select({ id: dataUsaha.id, name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.userId, query.userId));
      return { dataUsaha: rows };
    },
    { permission: "users.manage", query: t.Object({ userId: t.String({ minLength: 1 }) }) },
  )
  .post(
    "/:id/transfer-ownership",
    async ({ user, params, body, set }) => {
      const [target] = await db.select({ id: dataUsaha.id, userId: dataUsaha.userId }).from(dataUsaha).where(eq(dataUsaha.id, params.id));
      if (!target) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      if (target.userId === body.toUserId) {
        set.status = 400;
        return { code: "CANNOT_TRANSFER_TO_SELF" };
      }
      const [toUser] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, body.toUserId));
      if (!toUser) {
        set.status = 404;
        return { code: "TARGET_USER_NOT_FOUND" };
      }

      await db.transaction(async (tx) => {
        await tx.update(dataUsaha).set({ userId: body.toUserId, updatedAt: new Date() }).where(eq(dataUsaha.id, params.id));
        // § batalkan transfer self-service yang masih pending untuk Data
        // Usaha ini — mencegah link accept lama nyasar dianggap valid lagi
        // di masa depan kalau kepemilikan somehow balik lagi ke
        // `fromUserId` semula (edge case, tapi murah dicegah sekarang).
        await tx
          .update(ownershipTransfers)
          .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
          .where(and(eq(ownershipTransfers.dataUsahaId, params.id), eq(ownershipTransfers.status, "pending")));
        await tx.insert(auditLogs).values({
          entityType: "data_usaha",
          entityId: params.id,
          action: "transfer_ownership",
          changes: { fromUserId: target.userId, toUserId: body.toUserId },
          actorId: user.id,
        });
      });

      return { ok: true };
    },
    {
      permission: "users.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ toUserId: t.String({ minLength: 1 }) }),
    },
  );
