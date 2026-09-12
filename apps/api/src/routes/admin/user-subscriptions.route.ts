import { Elysia, t } from "elysia";
import { eq, inArray, desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { subscriptions, plans, accurateConnections, user as userTable, dataUsaha } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § Fase 92 (2026-09-10) — mirror pola `admin/import-batches.route.ts`
// (READ-ONLY, permission `users.view`, dipakai halaman `/admin/users/:id`
// untuk konteks support). Dibuat file TERPISAH (bukan ditumpuk di
// `import-batches.route.ts` walau sama-sama prefix `/admin/users/:id/...`)
// karena isinya soal langganan+koneksi Accurate, bukan riwayat import —
// konsisten prinsip 1 file = 1 topik.
//
// Menampilkan status koneksi Accurate (`connectionStatus`) memakai
// logic SAMA PERSIS `GET /accurate/subscriptions` versi customer (Fase
// 91 — `connected` cuma "active" kalau statusnya BENERAN "active", bukan
// cuma "ada baris koneksi") — supaya admin lihat gambaran yang SAMA
// akuratnya dengan yang dilihat customer sendiri, bukan info basi.
//
// § diminta user 2026-09-12 — endpoint ini dibuat Fase 92 (SEBELUM Data
// Usaha jadi entity, Fase 107), jadi awalnya TIDAK JOIN `data_usaha` sama
// sekali. Ini bikin admin tidak bisa tahu 1 subscription itu punya
// Data Usaha yang mana (padahal 1 user SEKARANG bisa punya banyak Data
// Usaha, tiap satu status koneksi Accurate-nya independen) — tambah
// `dataUsahaId`/`dataUsahaName` supaya FE bisa kelompokkan per Data Usaha
// (§ `admin/users/[id]/page.tsx`).
export const adminUserSubscriptionsRoute = new Elysia({ prefix: "/admin" })
  .use(permissionPlugin)
  .get(
    "/users/:id/subscriptions",
    async ({ params, set }) => {
      const [targetUser] = await db.select().from(userTable).where(eq(userTable.id, params.id));
      if (!targetUser) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }

      // § SEMUA subscription (bukan cuma "active") — admin support butuh
      // konteks lengkap, mis. "kenapa fitur ini tidak bisa import" bisa
      // jawabannya "langganannya sudah expired", bukan cuma soal koneksi.
      const rows = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          endAt: subscriptions.endAt,
          accurateConnectionId: subscriptions.accurateConnectionId,
          planName: plans.name,
          moduleKey: plans.modules,
          dataUsahaId: dataUsaha.id,
          dataUsahaName: dataUsaha.name,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
        .where(eq(subscriptions.userId, params.id))
        .orderBy(desc(subscriptions.createdAt));

      const connectionIds = rows.map((r) => r.accurateConnectionId).filter((id): id is string => id !== null);
      const connections = connectionIds.length
        ? await db.select().from(accurateConnections).where(inArray(accurateConnections.id, connectionIds))
        : [];
      const connectionById = new Map(connections.map((c) => [c.id, c]));

      return {
        user: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
        subscriptions: rows.map((r) => {
          const connection = r.accurateConnectionId ? connectionById.get(r.accurateConnectionId) : undefined;
          return {
            subscriptionId: r.id,
            status: r.status,
            endAt: r.endAt,
            moduleKey: r.moduleKey[0] ?? null,
            planName: r.planName,
            connected: connection?.status === "active",
            connectionStatus: connection?.status ?? null,
            accurateDbAlias: connection?.accurateDbAlias ?? null,
            dataUsahaId: r.dataUsahaId,
            dataUsahaName: r.dataUsahaName,
          };
        }),
      };
    },
    { permission: "users.view", params: t.Object({ id: t.String() }) },
  );
