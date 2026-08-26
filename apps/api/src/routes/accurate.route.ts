import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getActiveSubscriptionWithPlan } from "../lib/subscription-gate";
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

async function getConnectionForUser(userId: string) {
  const active = await getActiveSubscriptionWithPlan(userId);
  if (!active) return null;
  const [connection] = await db
    .select()
    .from(accurateConnections)
    .where(eq(accurateConnections.subscriptionId, active.subscription.id));
  return connection ?? null;
}

export const accurateRoute = new Elysia()
  .use(permissionPlugin)
  .post(
    "/accurate/connect",
    async ({ user, set }) => {
      const active = await getActiveSubscriptionWithPlan(user.id);
      if (!active) {
        set.status = 400;
        return { code: "NO_ACTIVE_SUBSCRIPTION" };
      }

      const [existing] = await db
        .select()
        .from(accurateConnections)
        .where(eq(accurateConnections.subscriptionId, active.subscription.id));
      if (existing) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }

      const state = createState(active.subscription.id);
      const scopes = scopesForModules(active.plan.modules);

      try {
        return { authorizeUrl: getAuthorizeUrl(state, scopes) };
      } catch (err) {
        set.status = 503;
        logger.error({ err }, "Accurate client belum dikonfigurasi");
        return { code: "ACCURATE_NOT_CONFIGURED" };
      }
    },
    { auth: true },
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
        const token = await exchangeCodeForToken(query.code);
        await db.insert(accurateConnections).values({
          subscriptionId,
          accessTokenEncrypted: encrypt(token.access_token),
          refreshTokenEncrypted: encrypt(token.refresh_token),
          expiresAt: new Date(Date.now() + token.expires_in * 1000),
        });
        return redirect(`${appOrigin}/accurate?connected=true`);
      } catch (err) {
        logger.error({ err }, "Accurate OAuth callback gagal");
        return redirect(`${appOrigin}/accurate?error=exchange_failed`);
      }
    },
    { query: t.Object({ code: t.Optional(t.String()), state: t.Optional(t.String()), error: t.Optional(t.String()) }) },
  )
  .get(
    "/accurate/status",
    async ({ user }) => {
      const connection = await getConnectionForUser(user.id);
      if (!connection) return { connected: false, accurateDbId: null, accurateDbAlias: null };
      return { connected: true, accurateDbId: connection.accurateDbId, accurateDbAlias: connection.accurateDbAlias };
    },
    { auth: true },
  )
  .get(
    "/accurate/databases",
    async ({ user, set }) => {
      const connection = await getConnectionForUser(user.id);
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
    { auth: true },
  )
  .post(
    "/accurate/databases/select",
    async ({ user, body, set }) => {
      const connection = await getConnectionForUser(user.id);
      if (!connection) {
        set.status = 400;
        return { code: "NOT_CONNECTED" };
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
    { auth: true, body: t.Object({ accurateDbId: t.Number(), alias: t.String() }) },
  );
