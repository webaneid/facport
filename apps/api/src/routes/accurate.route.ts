import { Elysia, t } from "elysia";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections, subscriptions } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getActiveSubscriptionsWithPlans } from "../lib/subscription-gate";
import { getAuthorizeUrl, exchangeCodeForToken, listDatabases, openDatabase } from "../lib/accurate";
import { scopesForModules } from "../lib/accurate-scopes";
import { createState, consumeState } from "../lib/oauth-state";
import { encrypt, decrypt } from "../lib/encryption";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

function getAppOrigin(): string {
  // `||` (bukan `??`) SENGAJA — .env sering set APP_ORIGIN_PROD= (string
  // kosong, bukan unset), dan `??` tidak fallback untuk string kosong.
  return env.APP_ORIGIN_PROD || "http://app.localhost:6209";
}

// § security review 2026-09-04 (Low) — WAJIB filter `status: "active"`
// juga, bukan cuma ownership. Tanpa ini, connectionId lama yang sudah
// "expired"/"revoked" tetap bisa di-reuse/dipakai pilih Data Usaha
// (assign sukses di DB), baru gagal belakangan pas worker pakai token-nya
// yang sudah tidak valid — gap validasi state, bukan celah lintas-user.
async function getOwnedConnection(userId: string, connectionId: string) {
  const [connection] = await db
    .select()
    .from(accurateConnections)
    .where(
      and(eq(accurateConnections.id, connectionId), eq(accurateConnections.userId, userId), eq(accurateConnections.status, "active")),
    );
  return connection ?? null;
}

// § Fase 14, ADR-0020 — koneksi SEKARANG milik user (bukan 1:1 ke
// subscription lagi), reusable lintas subscription/modul yang Data
// Usaha-nya sama. Route ini dirombak total dari versi sebelum Fase 14
// (yang asumsi 1 user = 1 subscription aktif = 1 koneksi tunggal).
export const accurateRoute = new Elysia()
  .use(permissionPlugin)
  // § ganti GET /accurate/status lama (1 status tunggal) — sekarang 1
  // baris per subscription/modul aktif user, masing-masing status
  // koneksinya sendiri. Dipakai halaman /accurate render daftar per modul.
  .get(
    "/accurate/subscriptions",
    async ({ user }) => {
      const activeSubs = await getActiveSubscriptionsWithPlans(user.id);
      const connectionIds = activeSubs
        .map((s) => s.subscription.accurateConnectionId)
        .filter((id): id is string => id !== null);
      const connections = connectionIds.length
        ? await db.select().from(accurateConnections).where(inArray(accurateConnections.id, connectionIds))
        : [];
      const connectionById = new Map(connections.map((c) => [c.id, c]));

      return {
        subscriptions: activeSubs.map(({ subscription, plan }) => {
          const connection = subscription.accurateConnectionId ? connectionById.get(subscription.accurateConnectionId) : undefined;
          return {
            subscriptionId: subscription.id,
            moduleKey: plan.modules[0] ?? null,
            planName: plan.name,
            connected: !!connection,
            accurateConnectionId: subscription.accurateConnectionId,
            accurateDbId: connection?.accurateDbId ?? null,
            accurateDbAlias: connection?.accurateDbAlias ?? null,
          };
        }),
      };
    },
    { auth: true },
  )
  // § daftar koneksi EXISTING milik user — sumber dropdown "pakai koneksi
  // yang sudah ada" di halaman /accurate.
  .get(
    "/accurate/connections",
    async ({ user }) => {
      const connections = await db
        .select()
        .from(accurateConnections)
        .where(and(eq(accurateConnections.userId, user.id), eq(accurateConnections.status, "active")));
      return { connections: connections.map((c) => ({ id: c.id, accurateDbId: c.accurateDbId, accurateDbAlias: c.accurateDbAlias })) };
    },
    { auth: true },
  )
  .post(
    "/accurate/connect",
    async ({ user, body, set }) => {
      const activeSubs = await getActiveSubscriptionsWithPlans(user.id);
      const target = activeSubs.find((s) => s.subscription.id === body.subscriptionId);
      if (!target) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      if (target.subscription.accurateConnectionId) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }

      const state = createState(target.subscription.id);
      const scopes = scopesForModules(target.plan.modules);

      try {
        return { authorizeUrl: getAuthorizeUrl(state, scopes) };
      } catch (err) {
        set.status = 503;
        logger.error({ err }, "Accurate client belum dikonfigurasi");
        return { code: "ACCURATE_NOT_CONFIGURED" };
      }
    },
    { auth: true, body: t.Object({ subscriptionId: t.String({ format: "uuid" }) }) },
  )
  .get(
    "/accurate/oauth/callback",
    async ({ query, redirect }) => {
      const appOrigin = getAppOrigin();

      if (query.error) {
        return redirect(`${appOrigin}/accurate?error=${encodeURIComponent(query.error)}`);
      }

      const subscriptionId = query.state ? consumeState(query.state) : null;
      if (!subscriptionId || !query.code) {
        return redirect(`${appOrigin}/accurate?error=invalid_state`);
      }

      try {
        const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
        if (!subscription) return redirect(`${appOrigin}/accurate?error=invalid_state`);

        const token = await exchangeCodeForToken(query.code);
        // § Fase 14 — bikin connection baru milik USER (bukan subscription
        // lagi), baru assign ke subscription yang menginisiasi OAuth ini.
        const [connection] = await db
          .insert(accurateConnections)
          .values({
            userId: subscription.userId,
            accessTokenEncrypted: encrypt(token.access_token),
            refreshTokenEncrypted: encrypt(token.refresh_token),
            expiresAt: new Date(Date.now() + token.expires_in * 1000),
          })
          .returning();
        await db.update(subscriptions).set({ accurateConnectionId: connection!.id }).where(eq(subscriptions.id, subscriptionId));
        return redirect(`${appOrigin}/accurate?connected=true`);
      } catch (err) {
        logger.error({ err }, "Accurate OAuth callback gagal");
        return redirect(`${appOrigin}/accurate?error=exchange_failed`);
      }
    },
    { query: t.Object({ code: t.Optional(t.String()), state: t.Optional(t.String()), error: t.Optional(t.String()) }) },
  )
  // § Fase 14, ADR-0020 — INTI perubahan: pakai koneksi yang SUDAH ADA
  // (Data Usaha yang sama dipakai modul lain) untuk subscription/modul
  // ini, TANPA OAuth ulang sama sekali. Ownership dicek DUA arah:
  // subscription target milik user ini, DAN connection yang di-reuse
  // juga milik user ini (bukan bisa pinjam koneksi user lain).
  .post(
    "/accurate/reuse",
    async ({ user, body, set }) => {
      const activeSubs = await getActiveSubscriptionsWithPlans(user.id);
      const target = activeSubs.find((s) => s.subscription.id === body.subscriptionId);
      if (!target) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      if (target.subscription.accurateConnectionId) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }

      const connection = await getOwnedConnection(user.id, body.connectionId);
      if (!connection) {
        set.status = 404;
        return { code: "CONNECTION_NOT_FOUND" };
      }

      await db.update(subscriptions).set({ accurateConnectionId: connection.id }).where(eq(subscriptions.id, target.subscription.id));
      return { subscriptionId: target.subscription.id, accurateConnectionId: connection.id };
    },
    { auth: true, body: t.Object({ subscriptionId: t.String({ format: "uuid" }), connectionId: t.String({ format: "uuid" }) }) },
  )
  .get(
    "/accurate/databases",
    async ({ user, query, set }) => {
      const connection = await getOwnedConnection(user.id, query.connectionId);
      if (!connection) {
        set.status = 400;
        return { code: "NOT_CONNECTED" };
      }
      try {
        const accessToken = decrypt(connection.accessTokenEncrypted);
        const databases = await listDatabases(accessToken);
        return { databases };
      } catch (err) {
        set.status = 502;
        logger.error({ err }, "Gagal ambil daftar Data Usaha Accurate");
        return { code: "ACCURATE_REQUEST_FAILED" };
      }
    },
    { auth: true, query: t.Object({ connectionId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/accurate/databases/select",
    async ({ user, body, set }) => {
      const connection = await getOwnedConnection(user.id, body.connectionId);
      if (!connection) {
        set.status = 400;
        return { code: "NOT_CONNECTED" };
      }
      // § Fase 14, security review 2026-09-04 (Medium) — koneksi ini
      // SEKARANG bisa dipakai BARENG oleh beberapa subscription
      // (ADR-0020). Kalau accurateDbId sudah pernah diisi, endpoint ini
      // BUKAN tempatnya ganti — diam-diam ganti Data Usaha di sini akan
      // ikut memindahkan tujuan import SEMUA subscription lain yang
      // share koneksi ini tanpa mereka sadar. Ganti Data Usaha WAJIB
      // lewat koneksi baru (connect ulang), bukan endpoint select ini.
      if (connection.accurateDbId) {
        set.status = 400;
        return { code: "DATABASE_ALREADY_SELECTED" };
      }
      try {
        const accessToken = decrypt(connection.accessTokenEncrypted);
        await openDatabase(accessToken, body.accurateDbId); // validasi id benar-benar bisa dibuka
        await db
          .update(accurateConnections)
          .set({ accurateDbId: String(body.accurateDbId), accurateDbAlias: body.alias, updatedAt: new Date() })
          .where(eq(accurateConnections.id, connection.id));
        return { accurateDbId: body.accurateDbId, accurateDbAlias: body.alias };
      } catch (err) {
        set.status = 502;
        logger.error({ err }, "Gagal buka Data Usaha Accurate");
        return { code: "ACCURATE_REQUEST_FAILED" };
      }
    },
    // `alias` dikirim client (sudah ada di tangan dari GET /accurate/databases
    // sebelumnya) — hindari panggilan Accurate API kedua cuma buat lookup nama.
    // maxLength 255 — konsisten batas kolom `accurateDbAlias` varchar(255)
    // (security review 2026-09-04, Low — cegah error DB mentah kalau
    // client kirim alias kepanjangan).
    {
      auth: true,
      body: t.Object({ connectionId: t.String({ format: "uuid" }), accurateDbId: t.Number(), alias: t.String({ maxLength: 255 }) }),
    },
  );
