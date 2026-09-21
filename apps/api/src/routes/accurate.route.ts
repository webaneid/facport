import { Elysia, t } from "elysia";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections, subscriptions } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getOwnedSubscriptionsWithPlans, getAccessibleSubscriptionsWithPlans } from "../lib/subscription-gate";
import { hasAccessToDataUsaha } from "../lib/data-usaha";
import { getAuthorizeUrl, exchangeCodeForToken, listDatabases, openDatabase, parseGrantedScopes } from "../lib/accurate";
import { ALL_ACCURATE_SCOPES } from "../lib/accurate-scopes";
import { checkConnectionScopes } from "../lib/accurate-scope-check";
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
    async ({ user, query }) => {
      // § Fase 110 — Accessible (bukan Owned): read-only, member BOLEH lihat
      // status koneksi modul yang dia numpang pakai (bukan cuma pemilik).
      const allActiveSubs = await getAccessibleSubscriptionsWithPlans(user.id);
      // § Fase 113 — `dataUsahaId` OPSIONAL, sama alasan `GET /me/subscriptions`
      // (subscriptions.route.ts): cuma narrowing dari union yang sudah
      // access-controlled, dibiarkan opsional untuk jaga kompatibilitas
      // pemanggil yang mungkin masih butuh union (saat ini tidak ada, tapi
      // konsisten dengan endpoint kembarannya).
      const activeSubs = query.dataUsahaId ? allActiveSubs.filter((s) => s.subscription.dataUsahaId === query.dataUsahaId) : allActiveSubs;
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
            // § Fase 91 (2026-09-10, BUG DITEMUKAN & DIPERBAIKI) — SEBELUM
            // ini `connected` cuma cek "ada baris koneksi", BUKAN cek
            // statusnya — koneksi yang sudah ditandai `expired` (§
            // `markConnectionExpired`, workers/index.ts) tetap dilaporkan
            // "Terhubung" ke frontend, padahal tokennya sudah mati.
            // `connectionStatus` BARU ditambah supaya frontend bisa
            // bedakan "sehat" vs "ada tapi bermasalah" vs "belum ada
            // sama sekali", bukan cuma boolean biner.
            connected: connection?.status === "active",
            connectionStatus: connection?.status ?? null,
            accurateConnectionId: subscription.accurateConnectionId,
            accurateDbId: connection?.accurateDbId ?? null,
            accurateDbAlias: connection?.accurateDbAlias ?? null,
          };
        }),
      };
    },
    { auth: true, query: t.Object({ dataUsahaId: t.Optional(t.String({ format: "uuid" })) }) },
  )
  // § daftar koneksi EXISTING milik user — sumber dropdown "pakai koneksi
  // yang sudah ada" di halaman /accurate. `dataUsahaId` WAJIB (Fase 113,
  // beda dari `/accurate/subscriptions` di atas) — cuma 1 pemanggil
  // (halaman itu sendiri, sedang diperbaiki bareng fase ini), dan tujuan
  // endpoint ini MEMANG "koneksi yang bisa dipakai untuk Data Usaha X"
  // (reuse), jadi tidak masuk akal punya mode "tanpa Data Usaha".
  // Koneksi tidak punya kolom `dataUsahaId` langsung — di-join lewat
  // `subscriptions.accurateConnectionId` (tiap koneksi pasti sudah
  // ter-assign ke minimal 1 subscription sejak dibuat, lihat callback
  // OAuth di bawah). `Map` dedupe karena 1 koneksi bisa dipakai >1
  // subscription pada Data Usaha yang sama (reuse berulang).
  // § security review Fase 113 (Medium, DIPERBAIKI) — `accurateConnections.userId`
  // DIBEKUKAN ke user yang OAuth pertama kali, TIDAK ikut berubah saat
  // kepemilikan Data Usaha ditransfer. `hasAccessToDataUsaha` WAJIB dicek
  // dulu, sama alasan `GET /me/stats`/`GET /me/import-batches`
  // (me.route.ts) — mantan pemilik yang sudah kehilangan akses TIDAK
  // boleh tetap lihat metadata koneksi (bisa jadi company Accurate yang
  // MASIH aktif dipakai pemilik baru).
  .get(
    "/accurate/connections",
    async ({ user, query, set }) => {
      if (!(await hasAccessToDataUsaha(user.id, query.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const rows = await db
        .select({ connection: accurateConnections })
        .from(accurateConnections)
        .innerJoin(subscriptions, eq(subscriptions.accurateConnectionId, accurateConnections.id))
        .where(
          and(
            eq(accurateConnections.userId, user.id),
            eq(accurateConnections.status, "active"),
            eq(subscriptions.dataUsahaId, query.dataUsahaId),
          ),
        );
      const connectionById = new Map(rows.map((r) => [r.connection.id, r.connection]));
      return {
        connections: [...connectionById.values()].map((c) => ({ id: c.id, accurateDbId: c.accurateDbId, accurateDbAlias: c.accurateDbAlias })),
      };
    },
    { auth: true, query: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/accurate/connect",
    async ({ user, body, set }) => {
      // § Fase 110 — WAJIB Owned (bukan Accessible): ini MENGUBAH konfigurasi
      // integrasi (bikin/timpa koneksi Accurate) — member (akses lewat seat)
      // TIDAK BOLEH pernah lolos di sini, cuma pemilik Data Usaha yang boleh.
      const activeSubs = await getOwnedSubscriptionsWithPlans(user.id);
      const target = activeSubs.find((s) => s.subscription.id === body.subscriptionId);
      if (!target) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      // § Fase 91 (2026-09-10) — gap ditemukan/dicatat sejak Fase 01/04
      // ("tombol Hubungkan Ulang BELUM dibangun"): endpoint ini dulu
      // SELALU tolak 409 kalau subscription sudah punya `accurateConnectionId`,
      // padahal koneksi itu bisa saja SUDAH MATI (revoked di sisi
      // Accurate, § `markConnectionExpired`) — user tidak punya cara
      // self-service memperbaikinya dari UI. `body.reconnect: true`
      // (dikirim tombol "Hubungkan Ulang" BARU di halaman /accurate)
      // melewati guard ini secara EKSPLISIT — callback OAuth di bawah
      // SUDAH aman menimpa `accurateConnectionId` lama dengan koneksi
      // baru (unconditional overwrite, tidak berubah).
      if (target.subscription.accurateConnectionId && !body.reconnect) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }

      const state = createState(target.subscription.id);
      // § Fase 142, ADR-0036 #2 — SELALU minta SEMUA scope katalog, BUKAN scope modul ini saja.
      // Terbukti (Fase 141 E2): otorisasi baru untuk akun Accurate yang sama mematikan token lama dan
      // MENGGANTI seluruh scope — otorisasi "sempit" per modul membuat modul lain kehilangan izin.
      try {
        return { authorizeUrl: getAuthorizeUrl(state, ALL_ACCURATE_SCOPES) };
      } catch (err) {
        set.status = 503;
        logger.error({ err }, "Accurate client belum dikonfigurasi");
        return { code: "ACCURATE_NOT_CONFIGURED" };
      }
    },
    { auth: true, body: t.Object({ subscriptionId: t.String({ format: "uuid" }), reconnect: t.Optional(t.Boolean()) }) },
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
            // § Fase 142 — simpan apa yang BENAR-BENAR diberikan Accurate + identitas akunnya
            // (respons token; dulu dibuang). NULL kalau respons tidak memuatnya.
            grantedScopes: parseGrantedScopes(token.scope),
            accurateUserId: token.user?.id != null ? String(token.user.id) : null,
            accurateUserEmail: token.user?.email ?? null,
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
      // § Fase 110 — WAJIB Owned, sama alasan `/connect` di atas.
      const activeSubs = await getOwnedSubscriptionsWithPlans(user.id);
      const target = activeSubs.find((s) => s.subscription.id === body.subscriptionId);
      if (!target) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      // § Fase 114 — `reconnect: true` (dikirim tombol "Pakai Koneksi yang
      // Sudah Ada" di kartu status sehat/rusak, § accurate-connections-form.tsx)
      // melewati guard ini secara EKSPLISIT — pola PERSIS `/accurate/connect`
      // di atas (§ Fase 91). SEBELUM ini, reuse cuma bisa dipakai first-connect
      // (belum pernah punya `accurateConnectionId` sama sekali) — reconnect
      // SELALU dipaksa OAuth baru walau company-nya sama, bikin koneksi
      // numpuk (temuan debugging production 2026-09-14, 2 customer nyata
      // sampai 5-17 koneksi terpisah ke company yang SAMA — § lessons-learned.md).
      if (target.subscription.accurateConnectionId && !body.reconnect) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }

      const connection = await getOwnedConnection(user.id, body.connectionId);
      if (!connection) {
        set.status = 404;
        return { code: "CONNECTION_NOT_FOUND" };
      }

      // § security review Fase 114 (Medium, DIPERBAIKI) — `getOwnedConnection`
      // di atas cuma cek koneksi ini MILIK user (lintas SEMUA Data Usaha
      // dia), TIDAK cek koneksi ini sebelumnya dipakai untuk Data Usaha
      // yang SAMA dengan `target.subscription.dataUsahaId`. User yang py
      // >1 Data Usaha (kasus SAH, § lessons-learned.md 2026-09-14) bisa
      // salah kirim `connectionId` milik Data Usaha LAIN — tidak ketahuan
      // sebagai IDOR (masih 1 user yang sama), tapi bisa bikin data
      // import kekirim ke company Accurate yang SALAH, persis kelas bug
      // yang baru saja diperbaiki manual di production hari ini. UI
      // (`GET /accurate/connections?dataUsahaId=X`, § Fase 113) sudah
      // filter benar, tapi backend WAJIB validasi ulang, bukan andalkan
      // filter UI saja (defense-in-depth, § architecture-security.md).
      const [reusableForThisDataUsaha] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.accurateConnectionId, connection.id), eq(subscriptions.dataUsahaId, target.subscription.dataUsahaId)));
      if (!reusableForThisDataUsaha) {
        set.status = 400;
        return { code: "CONNECTION_DATA_USAHA_MISMATCH" };
      }

      // § Fase 142 — koneksi yang di-reuse WAJIB sudah punya scope modul ini (dulu tidak dicek: reuse
      // sukses, import baru gagal 403 belakangan). Scope tidak diketahui (baris lama, token mati) → lolos.
      const scopeCheck = await checkConnectionScopes(connection, target.plan.modules);
      if (!scopeCheck.ok) {
        set.status = 409;
        return { code: "ACCURATE_SCOPE_MISSING", missing: scopeCheck.missing };
      }

      await db.update(subscriptions).set({ accurateConnectionId: connection.id }).where(eq(subscriptions.id, target.subscription.id));
      return { subscriptionId: target.subscription.id, accurateConnectionId: connection.id };
    },
    {
      auth: true,
      body: t.Object({
        subscriptionId: t.String({ format: "uuid" }),
        connectionId: t.String({ format: "uuid" }),
        reconnect: t.Optional(t.Boolean()),
      }),
    },
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
