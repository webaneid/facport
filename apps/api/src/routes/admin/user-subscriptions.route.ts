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
          startAt: subscriptions.startAt,
          endAt: subscriptions.endAt,
          // § Fase 130 (diminta user 2026-09-17) — admin sebelumnya cuma
          // lihat `endAt`, tidak tahu durasi paketnya (Bulanan/Tahunan)
          // atau kapan MULAI-nya — dua-duanya dibutuhkan biar "Detail
          // User" benar-benar berguna buat support (§ komentar file ini).
          durationDays: plans.durationDays,
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

      // § Fase 144 — status koneksi Accurate adalah milik DATA USAHA (ADR-0037), BUKAN subscription: dikembalikan sebagai daftar
      // `dataUsaha` (semua Data Usaha yang dimiliki user ATAU memuat subscription-nya) dengan status koneksi + akun + database.
      // Baris subscription TIDAK lagi membawa kolom koneksi (dulu diulang di tiap baris & tombol putus per baris = menyesatkan).
      const owned = await db.select({ id: dataUsaha.id }).from(dataUsaha).where(eq(dataUsaha.userId, params.id));
      const dataUsahaIds = [...new Set([...rows.map((r) => r.dataUsahaId), ...owned.map((d) => d.id)])];
      const duRows = dataUsahaIds.length
        ? await db
            .select({ du: dataUsaha, connection: accurateConnections })
            .from(dataUsaha)
            .leftJoin(accurateConnections, eq(accurateConnections.id, dataUsaha.accurateConnectionId))
            .where(inArray(dataUsaha.id, dataUsahaIds))
        : [];

      return {
        user: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
        dataUsaha: duRows.map(({ du, connection: found }) => {
          // Koneksi LAMA (tanpa identitas akun, sebelum cutover) dianggap belum terhubung.
          const connection = found?.accurateUserId ? found : null;
          return {
            id: du.id,
            name: du.name,
            isOwner: du.userId === params.id,
            connected: connection?.status === "active",
            connectionStatus: connection?.status ?? null,
            accountEmail: connection?.accurateUserEmail ?? null,
            accurateDbAlias: du.accurateDbAlias,
          };
        }),
        subscriptions: rows.map((r) => ({
          subscriptionId: r.id,
          status: r.status,
          startAt: r.startAt,
          endAt: r.endAt,
          durationDays: r.durationDays,
          moduleKey: r.moduleKey[0] ?? null,
          planName: r.planName,
          dataUsahaId: r.dataUsahaId,
          dataUsahaName: r.dataUsahaName,
        })),
      };
    },
    { permission: "users.view", params: t.Object({ id: t.String() }) },
  );
