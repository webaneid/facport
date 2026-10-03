import { Elysia, t } from "elysia";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { dataUsaha, user as userTable, auditLogs, ownershipTransfers, accurateConnections, subscriptions, importBatches } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { createNotification, NOTIFICATION_TYPES } from "../../lib/notifications";

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
  // § Fase 144 — "Putuskan Koneksi" oleh admin di level DATA USAHA (koneksi Accurate dipegang Data Usaha, ADR-0037): SATU aksi
  // memutus SEMUA fitur di Data Usaha itu. Menggantikan `POST /admin/subscriptions/:id/disconnect-accurate`.
  // § DIUBAH 2026-10-03 (diminta client — banyak user salah memilih Data Usaha/email Accurate): putus sekarang BERSIH.
  // Sebelumnya hanya pointer koneksi yang dikosongkan, database Accurate terakhir TETAP tersimpan di Data Usaha sehingga
  // saat user menyambung lagi `pointDataUsahaToConnection` otomatis memakai database yang sama (kesalahan pilih tak
  // pernah terkoreksi), dan baris `accurate_connections` yang masih aktif membuat popup menawarkan "Pakai akun {email}"
  // tanpa OAuth. Sekarang:
  //   • selalu: pointer koneksi + database terpilih (id/alias/konfirmasi) dikosongkan → user WAJIB memilih database lagi;
  //   • `removeAccount: true`: koneksi akun Accurate itu dihapus (token dibuang) dan SEMUA Data Usaha yang memakainya ikut
  //     diputus bersih → user WAJIB OAuth dari nol (untuk kasus salah email/akun Accurate).
  // Ditolak 409 IMPORT_RUNNING kalau ada import yang sedang berjalan di Data Usaha terdampak (token dicabut di tengah batch
  // = batch gagal 401). Pemilik diberi notifikasi.
  .post(
    "/:id/disconnect-accurate",
    async ({ params, body, user, set }) => {
      const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, params.id));
      if (!du) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      if (!du.accurateConnectionId) {
        set.status = 400;
        return { code: "NOT_CONNECTED" };
      }
      const connectionId = du.accurateConnectionId;
      const removeAccount = body?.removeAccount === true;

      // Data Usaha yang terdampak: hanya ini, atau SEMUA yang memakai koneksi akun yang sama (removeAccount).
      const affected = removeAccount
        ? await db.select({ id: dataUsaha.id, name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.accurateConnectionId, connectionId))
        : [{ id: du.id, name: du.name }];
      const affectedIds = affected.map((a) => a.id);

      const [running] = await db
        .select({ id: importBatches.id })
        .from(importBatches)
        .innerJoin(subscriptions, eq(subscriptions.id, importBatches.subscriptionId))
        .where(and(inArray(subscriptions.dataUsahaId, affectedIds), inArray(importBatches.status, ["processing", "cancelling"])))
        .limit(1);
      if (running) {
        set.status = 409;
        return { code: "IMPORT_RUNNING" };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(dataUsaha)
          .set({ accurateConnectionId: null, accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null, updatedAt: new Date() })
          .where(inArray(dataUsaha.id, affectedIds));
        if (removeAccount) {
          // Pointer lama per-subscription (model sebelum ADR-0037) juga menunjuk baris ini — lepas dulu sebelum dihapus.
          await tx.update(subscriptions).set({ accurateConnectionId: null }).where(eq(subscriptions.accurateConnectionId, connectionId));
          await tx.delete(accurateConnections).where(eq(accurateConnections.id, connectionId));
        }
        await tx.insert(auditLogs).values({
          entityType: "data_usaha",
          entityId: du.id,
          action: "disconnect_accurate",
          changes: {
            previousConnectionId: connectionId,
            previousAccurateDbId: du.accurateDbId ?? null,
            previousAccurateDbAlias: du.accurateDbAlias ?? null,
            removedAccount: removeAccount,
            affectedDataUsahaIds: affectedIds,
          },
          actorId: user.id,
        });
      });

      await createNotification({
        userId: du.userId,
        type: NOTIFICATION_TYPES.ACCURATE_CONNECTION_DISCONNECTED_BY_ADMIN,
        title: "Koneksi Accurate diputuskan admin",
        body: removeAccount
          ? `Koneksi akun Accurate untuk Data Usaha ${affected.map((a) => a.name).join(", ")} diputuskan oleh admin — hubungkan ulang dari awal (login Accurate lalu pilih database) untuk lanjut import.`
          : `Koneksi Accurate untuk Data Usaha ${du.name}${du.accurateDbAlias ? ` (${du.accurateDbAlias})` : ""} diputuskan oleh admin — hubungkan ulang dan pilih database Accurate lagi untuk lanjut import.`,
        entityType: "data_usaha",
        entityId: du.id,
      });

      return { dataUsahaId: du.id, disconnected: true, removedAccount: removeAccount, affectedDataUsaha: affectedIds.length };
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Optional(t.Object({ removeAccount: t.Optional(t.Boolean()) })),
    },
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
        // § Fase 143, ADR-0037 #6 — transfer memutus koneksi Accurate (sama seperti `executeOwnershipTransfer`).
        await tx.update(dataUsaha).set({ userId: body.toUserId, accurateConnectionId: null, updatedAt: new Date() }).where(eq(dataUsaha.id, params.id));
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
