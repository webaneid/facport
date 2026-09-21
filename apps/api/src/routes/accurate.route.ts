import { Elysia, t } from "elysia";
import { eq, and, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections, dataUsaha, importBatches, importBatchRows, subscriptions } from "../db/schema";
import { auth } from "../lib/auth";
import { permissionPlugin } from "../lib/permission";
import { getAccessibleSubscriptionsWithPlans } from "../lib/subscription-gate";
import { hasAccessToDataUsaha, ownsDataUsaha } from "../lib/data-usaha";
import { getAuthorizeUrl, exchangeCodeForToken, listDatabases, openDatabase, parseGrantedScopes } from "../lib/accurate";
import { ALL_ACCURATE_SCOPES } from "../lib/accurate-scopes";
import { missingScopes } from "../lib/accurate-scope-check";
import { resolveConnectionForDataUsaha } from "../lib/accurate-connection";
import { computeAccurateGate } from "../lib/accurate-gate";
import { createState, consumeState } from "../lib/oauth-state";
import { encrypt, decrypt } from "../lib/encryption";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

function getAppOrigin(): string {
  // `||` (bukan `??`) SENGAJA — .env sering set APP_ORIGIN_PROD= (string
  // kosong, bukan unset), dan `??` tidak fallback untuk string kosong.
  return env.APP_ORIGIN_PROD || "http://app.localhost:6209";
}

// § Fase 143, ADR-0036/ADR-0037 — MODEL KONEKSI BARU. 1 koneksi = 1 AKUN Accurate (kunci `accurate_user_id`,
// unik global), dibagi semua Data Usaha milik akun itu; Data Usaha menyimpan pointer koneksi + database yang dipilih
// (`data_usaha.accurate_connection_id/accurate_db_id`). Terbukti Fase 141 E2: otorisasi baru untuk akun yang sama
// mematikan token lama, jadi TIDAK PERNAH ada baris kedua untuk akun yang sama — callback = upsert. Endpoint `reuse`
// (Fase 14) dihapus: berbagi terjadi otomatis lewat akun yang sama. Semua endpoint di sini owner-only per Data Usaha
// kecuali yang read-only (Accessible: member seat boleh lihat status).

// § Cek pemilik + koneksi AKTIF milik Data Usaha. `null` → pemanggil balas kode error yang sesuai.
async function getOwnedActiveConnection(userId: string, dataUsahaId: string) {
  if (!(await ownsDataUsaha(userId, dataUsahaId))) return { error: "DATA_USAHA_NOT_FOUND" as const };
  const resolved = await resolveConnectionForDataUsaha(dataUsahaId);
  if (!resolved?.connection || resolved.connection.status !== "active") return { error: "NOT_CONNECTED" as const };
  return { resolved, connection: resolved.connection };
}

// Arahkan Data Usaha ke koneksi akun (dipakai callback OAuth DAN `attach`). Database yang sudah tersimpan di Data Usaha
// (hasil backfill / koneksi sebelumnya) DIPERTAHANKAN hanya kalau ada di akun ini (`db-list.do`), kalau tidak DIKOSONGKAN
// supaya user memilih ulang (bukan import diam-diam gagal/salah tujuan). UPDATE menyertakan `userId` pemilik: kepemilikan
// bisa berpindah (transfer) di sela pemeriksaan awal & sini (§ security review Fase 143, Low) — `false` = tidak ada baris
// yang diubah (bukan pemilik lagi).
async function pointDataUsahaToConnection(dataUsahaId: string, ownerId: string, connectionId: string, accessToken: string): Promise<boolean> {
  const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
  let keepDb = !!du?.accurateDbId;
  if (du?.accurateDbId) {
    try {
      const databases = await listDatabases(accessToken);
      keepDb = databases.some((d) => String(d.id) === du.accurateDbId);
    } catch (err) {
      logger.warn({ err }, "Gagal verifikasi database tersimpan di akun Accurate, dipertahankan apa adanya");
    }
  }
  const updated = await db
    .update(dataUsaha)
    .set({ accurateConnectionId: connectionId, ...(keepDb ? {} : { accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null }), updatedAt: new Date() })
    .where(and(eq(dataUsaha.id, dataUsahaId), eq(dataUsaha.userId, ownerId)))
    .returning({ id: dataUsaha.id });
  return updated.length > 0;
}

export const accurateRoute = new Elysia()
  .use(permissionPlugin)
  // Status koneksi per subscription/modul aktif (bentuk respons dipertahankan dari model lama supaya web tetap
  // jalan), tapi DITURUNKAN dari Data Usaha subscription itu: semua modul di 1 Data Usaha menampilkan koneksi &
  // database yang sama. `missingScopes`: null = scope koneksi belum diketahui (baris lama); [] = lengkap.
  .get(
    "/accurate/subscriptions",
    async ({ user, query }) => {
      // § Fase 110 — Accessible (bukan Owned): read-only, member BOLEH lihat status koneksi.
      const allActiveSubs = await getAccessibleSubscriptionsWithPlans(user.id);
      const activeSubs = query.dataUsahaId ? allActiveSubs.filter((s) => s.subscription.dataUsahaId === query.dataUsahaId) : allActiveSubs;
      const dataUsahaIds = [...new Set(activeSubs.map((s) => s.subscription.dataUsahaId))];
      const rows = dataUsahaIds.length
        ? await db
            .select({ du: dataUsaha, connection: accurateConnections })
            .from(dataUsaha)
            .leftJoin(accurateConnections, eq(accurateConnections.id, dataUsaha.accurateConnectionId))
            .where(inArray(dataUsaha.id, dataUsahaIds))
        : [];
      const byDataUsaha = new Map(rows.map((r) => [r.du.id, r]));

      return {
        subscriptions: activeSubs.map(({ subscription, plan }) => {
          const row = byDataUsaha.get(subscription.dataUsahaId);
          // Cutover (ADR-0037 #1): koneksi tanpa identitas akun = koneksi LAMA → dianggap belum terhubung.
          const connection = row?.connection && row.connection.accurateUserId ? row.connection : null;
          return {
            subscriptionId: subscription.id,
            moduleKey: plan.modules[0] ?? null,
            planName: plan.name,
            // § Fase 91 — `connected` HANYA kalau status "active"; `connectionStatus` membedakan "sehat" /
            // "ada tapi bermasalah" / "belum ada".
            connected: connection?.status === "active",
            connectionStatus: connection?.status ?? null,
            accurateConnectionId: connection?.id ?? null,
            accurateDbId: row?.du.accurateDbId ?? null,
            accurateDbAlias: row?.du.accurateDbAlias ?? null,
            missingScopes: connection?.grantedScopes ? missingScopes(connection.grantedScopes, plan.modules) : null,
          };
        }),
      };
    },
    { auth: true, query: t.Object({ dataUsahaId: t.Optional(t.String({ format: "uuid" })) }) },
  )
  // Koneksi milik Data Usaha yang diminta (0 atau 1 elemen; bentuk daftar dipertahankan untuk web). Baca-saja:
  // `hasAccessToDataUsaha` (pemilik SEKARANG atau member seat aktif) WAJIB dulu — `accurate_connections.userId`
  // dibekukan ke user yang OAuth pertama (§ security review Fase 113), bukan bukti akses sekarang.
  .get(
    "/accurate/connections",
    async ({ user, query, set }) => {
      if (!(await hasAccessToDataUsaha(user.id, query.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const resolved = await resolveConnectionForDataUsaha(query.dataUsahaId);
      const connection = resolved?.connection;
      if (!resolved || !connection || connection.status !== "active") return { connections: [] };
      return { connections: [{ id: connection.id, accurateDbId: resolved.accurateDbId, accurateDbAlias: resolved.accurateDbAlias }] };
    },
    { auth: true, query: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  // Memulai OAuth untuk 1 Data Usaha. Owner-only.
  .post(
    "/accurate/connect",
    async ({ user, body, set }) => {
      const dataUsahaId = body.dataUsahaId;
      if (!(await ownsDataUsaha(user.id, dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }

      // § Fase 91 — `reconnect: true` (tombol "Hubungkan Ulang") melewati guard ini secara EKSPLISIT.
      const current = await resolveConnectionForDataUsaha(dataUsahaId);
      if (current?.connection && !body.reconnect) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }

      const state = createState({ userId: user.id, dataUsahaId });
      // § Fase 142, ADR-0036 #2 — SELALU minta SEMUA scope katalog: otorisasi baru untuk akun yang sama mematikan
      // token lama dan MENGGANTI seluruh scope (Fase 141 E2), jadi tidak boleh ada otorisasi "sempit" per modul.
      try {
        return { authorizeUrl: getAuthorizeUrl(state, ALL_ACCURATE_SCOPES) };
      } catch (err) {
        set.status = 503;
        logger.error({ err }, "Accurate client belum dikonfigurasi");
        return { code: "ACCURATE_NOT_CONFIGURED" };
      }
    },
    {
      auth: true,
      body: t.Object({ dataUsahaId: t.String({ format: "uuid" }), reconnect: t.Optional(t.Boolean()) }),
    },
  )
  // Callback OAuth (tanpa sesi login — redirect dari Accurate). UPSERT berkunci `accurate_user_id` (respons token
  // `user.id`): akun yang sama → perbarui baris yang sama (token lama sudah mati di sisi Accurate); akun milik
  // pemilik Facport LAIN → ditolak (kalau tidak, otorisasi B diam-diam mematikan koneksi A).
  .get(
    "/accurate/oauth/callback",
    async ({ query, redirect, request }) => {
      const appOrigin = getAppOrigin();

      if (query.error) {
        return redirect(`${appOrigin}/?accurate_error=${encodeURIComponent(query.error)}`);
      }

      const context = query.state ? consumeState(query.state) : null;
      if (!context || !query.code) {
        return redirect(`${appOrigin}/?accurate_error=invalid_state`);
      }

      // § security review Fase 143 (HIGH, login CSRF/account-linking) — `state` acak saja tidak mengikat flow ke BROWSER
      // yang memulainya: penyerang bisa menyodorkan `authorizeUrl`-nya ke korban, dan akun Accurate korban akan
      // tersambung ke Data Usaha penyerang. Callback WAJIB berada di sesi login yang SAMA dengan pemulai flow
      // (cookie sesi ikut terkirim pada navigasi top-level dari Accurate; production: cross-subdomain, dev: host `localhost`).
      // Diperiksa SEBELUM tukar kode: penukaran kode sendiri mematikan token lama akun itu (Fase 141 E2).
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session || session.user.id !== context.userId) {
        logger.warn({ hasSession: !!session }, "Accurate OAuth callback: sesi tidak cocok dengan pemulai flow");
        return redirect(`${appOrigin}/?accurate_error=invalid_state`);
      }

      try {
        // Kepemilikan Data Usaha bisa berubah sejak OAuth dimulai (transfer) — cek ulang di sini.
        if (!(await ownsDataUsaha(context.userId, context.dataUsahaId))) {
          return redirect(`${appOrigin}/?accurate_error=invalid_state`);
        }

        const token = await exchangeCodeForToken(query.code);
        const accurateUserId = token.user?.id != null ? String(token.user.id) : null;
        if (!accurateUserId) {
          // Tanpa identitas akun koneksi tak bisa dikunci per akun — jangan membuat baris yatim.
          logger.error("Accurate OAuth callback: respons token tanpa user.id");
          return redirect(`${appOrigin}/?accurate_error=missing_account`);
        }

        const values = {
          accessTokenEncrypted: encrypt(token.access_token),
          refreshTokenEncrypted: encrypt(token.refresh_token),
          expiresAt: new Date(Date.now() + token.expires_in * 1000),
          status: "active",
          grantedScopes: parseGrantedScopes(token.scope),
          accurateUserEmail: token.user?.email ?? null,
          updatedAt: new Date(),
        };
        // Atomik: INSERT baru, atau UPDATE HANYA kalau baris itu milik user yang sama (`setWhere`). Akun milik
        // user lain → tidak ada baris yang dikembalikan → ditolak.
        const [connection] = await db
          .insert(accurateConnections)
          .values({ userId: context.userId, accurateUserId, ...values })
          .onConflictDoUpdate({
            target: accurateConnections.accurateUserId,
            targetWhere: sql`${accurateConnections.accurateUserId} IS NOT NULL`,
            set: { ...values, connectedAt: new Date() },
            setWhere: eq(accurateConnections.userId, context.userId),
          })
          .returning();
        if (!connection) {
          logger.warn({ dataUsahaId: context.dataUsahaId }, "Accurate OAuth callback: akun Accurate sudah dipakai pemilik Facport lain");
          return redirect(`${appOrigin}/?accurate_error=accurate_account_in_use`);
        }

        if (!(await pointDataUsahaToConnection(context.dataUsahaId, context.userId, connection.id, token.access_token))) {
          return redirect(`${appOrigin}/?accurate_error=invalid_state`);
        }
        return redirect(`${appOrigin}/?accurate=connected`);
      } catch (err) {
        logger.error({ err }, "Accurate OAuth callback gagal");
        return redirect(`${appOrigin}/?accurate_error=exchange_failed`);
      }
    },
    { query: t.Object({ code: t.Optional(t.String({ maxLength: 512 })), state: t.Optional(t.String({ maxLength: 128 })), error: t.Optional(t.String({ maxLength: 128 })) }) },
  )
  // § Fase 144 — mesin status koneksi per Data Usaha (popup gerbang, banner, kartu dashboard, halaman /accurate).
  // Accessible: pemilik ATAU member seat aktif; field sensitif (email akun, daftar akun) hanya untuk pemilik.
  .get(
    "/accurate/gate",
    async ({ user, query, set }) => {
      const gate = await computeAccurateGate(user.id, query.dataUsahaId);
      if (!gate) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      return gate;
    },
    { auth: true, query: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  // Pemilik mengonfirmasi bahwa database yang tersimpan (hasil backfill/koneksi lama) memang benar.
  .post(
    "/accurate/databases/confirm",
    async ({ user, body, set }) => {
      const owned = await getOwnedActiveConnection(user.id, body.dataUsahaId);
      if ("error" in owned) {
        set.status = owned.error === "DATA_USAHA_NOT_FOUND" ? 404 : 400;
        return { code: owned.error };
      }
      if (!owned.resolved.accurateDbId) {
        set.status = 400;
        return { code: "DATABASE_NOT_SELECTED" };
      }
      await db.update(dataUsaha).set({ accurateDbConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(dataUsaha.id, body.dataUsahaId));
      return { confirmed: true };
    },
    { auth: true, body: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  // "Pilih yang Lain": kosongkan database supaya bisa dipilih ulang — HANYA bila Data Usaha belum punya riwayat import sukses
  // (ADR-0037 #5: riwayat terikat ke database itu; mengganti diam-diam = data perusahaan A tampak milik B).
  .post(
    "/accurate/databases/reset",
    async ({ user, body, set }) => {
      if (!(await ownsDataUsaha(user.id, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const [history] = await db
        .select({ id: importBatchRows.id })
        .from(importBatchRows)
        .innerJoin(importBatches, eq(importBatches.id, importBatchRows.batchId))
        .innerJoin(subscriptions, eq(subscriptions.id, importBatches.subscriptionId))
        .where(and(eq(subscriptions.dataUsahaId, body.dataUsahaId), eq(importBatchRows.status, "success")))
        .limit(1);
      if (history) {
        set.status = 409;
        return { code: "DATABASE_HAS_IMPORT_HISTORY" };
      }
      await db
        .update(dataUsaha)
        .set({ accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null, updatedAt: new Date() })
        .where(eq(dataUsaha.id, body.dataUsahaId));
      return { reset: true };
    },
    { auth: true, body: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  // Akun Accurate yang SUDAH terhubung milik user ini (untuk memilih "pakai akun yang sama" pada Data Usaha lain). Owner-only:
  // email akun Accurate hanya dilihat pemilik koneksinya.
  .get(
    "/accurate/accounts",
    async ({ user }) => {
      const rows = await db
        .select()
        .from(accurateConnections)
        .where(and(eq(accurateConnections.userId, user.id), eq(accurateConnections.status, "active"), isNotNull(accurateConnections.accurateUserId)));
      return { accounts: rows.map((c) => ({ id: c.id, accountEmail: c.accurateUserEmail })) };
    },
    { auth: true },
  )
  // Pakai koneksi akun yang SUDAH ada untuk Data Usaha ini TANPA OAuth ulang. Penting: OAuth ulang untuk akun yang sama
  // mematikan token lama seketika (Fase 141 E2) — import Data Usaha lain yang sedang berjalan bisa 401 di tengah batch.
  // Berbeda dari `reuse` lama (Fase 14): koneksi harus milik user ini, aktif, dan berakun (bukan koneksi LAMA).
  .post(
    "/accurate/attach",
    async ({ user, body, set }) => {
      if (!(await ownsDataUsaha(user.id, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const [connection] = await db
        .select()
        .from(accurateConnections)
        .where(
          and(
            eq(accurateConnections.id, body.connectionId),
            eq(accurateConnections.userId, user.id),
            eq(accurateConnections.status, "active"),
            isNotNull(accurateConnections.accurateUserId),
          ),
        );
      if (!connection) {
        set.status = 404;
        return { code: "CONNECTION_NOT_FOUND" };
      }
      const current = await resolveConnectionForDataUsaha(body.dataUsahaId);
      if (current?.connection && !body.reconnect) {
        set.status = 409;
        return { code: "ALREADY_CONNECTED" };
      }
      if (!(await pointDataUsahaToConnection(body.dataUsahaId, user.id, connection.id, decrypt(connection.accessTokenEncrypted)))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      return { dataUsahaId: body.dataUsahaId, accurateConnectionId: connection.id };
    },
    {
      auth: true,
      body: t.Object({ dataUsahaId: t.String({ format: "uuid" }), connectionId: t.String({ format: "uuid" }), reconnect: t.Optional(t.Boolean()) }),
    },
  )
  // Daftar database Accurate milik akun yang terhubung ke Data Usaha ini; `used` = sudah dipakai Data Usaha LAIN
  // (1 database ↔ 1 Data Usaha).
  .get(
    "/accurate/databases",
    async ({ user, query, set }) => {
      const owned = await getOwnedActiveConnection(user.id, query.dataUsahaId);
      if ("error" in owned) {
        set.status = owned.error === "DATA_USAHA_NOT_FOUND" ? 404 : 400;
        return { code: owned.error };
      }
      try {
        const databases = await listDatabases(decrypt(owned.connection.accessTokenEncrypted));
        const usedRows = await db
          .select({ accurateDbId: dataUsaha.accurateDbId })
          .from(dataUsaha)
          .where(and(eq(dataUsaha.accurateConnectionId, owned.connection.id), ne(dataUsaha.id, query.dataUsahaId)));
        const used = new Set(usedRows.map((r) => r.accurateDbId).filter((id): id is string => id !== null));
        return { databases: databases.map((d) => ({ ...d, used: used.has(String(d.id)) })) };
      } catch (err) {
        set.status = 502;
        logger.error({ err }, "Gagal ambil daftar Data Usaha Accurate");
        return { code: "ACCURATE_REQUEST_FAILED" };
      }
    },
    { auth: true, query: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/accurate/databases/select",
    async ({ user, body, set }) => {
      const owned = await getOwnedActiveConnection(user.id, body.dataUsahaId);
      if ("error" in owned) {
        set.status = owned.error === "DATA_USAHA_NOT_FOUND" ? 404 : 400;
        return { code: owned.error };
      }
      // Riwayat import Data Usaha ini terikat ke database tersebut — ganti diam-diam = data perusahaan A masuk ke B.
      // (Callback OAuth sudah mengosongkan database yang tidak ada di akun baru, jadi kasus "salah tersimpan" tidak buntu.)
      if (owned.resolved.accurateDbId) {
        set.status = 400;
        return { code: "DATABASE_ALREADY_SELECTED" };
      }
      // 1 database ↔ 1 Data Usaha: cek awal (pesan jelas); indeks unik `data_usaha_connection_db_uidx` jaga balapan.
      const [clash] = await db
        .select({ id: dataUsaha.id })
        .from(dataUsaha)
        .where(
          and(
            eq(dataUsaha.accurateConnectionId, owned.connection.id),
            eq(dataUsaha.accurateDbId, String(body.accurateDbId)),
            ne(dataUsaha.id, body.dataUsahaId),
          ),
        );
      if (clash) {
        set.status = 409;
        return { code: "DATABASE_ALREADY_USED" };
      }
      try {
        await openDatabase(decrypt(owned.connection.accessTokenEncrypted), body.accurateDbId); // validasi id benar-benar bisa dibuka
      } catch (err) {
        set.status = 502;
        logger.error({ err }, "Gagal buka Data Usaha Accurate");
        return { code: "ACCURATE_REQUEST_FAILED" };
      }
      try {
        await db
          .update(dataUsaha)
          .set({ accurateDbId: String(body.accurateDbId), accurateDbAlias: body.alias, accurateDbConfirmedAt: new Date(), updatedAt: new Date() })
          .where(eq(dataUsaha.id, body.dataUsahaId));
      } catch (err) {
        if (String((err as { cause?: { constraint?: string } })?.cause?.constraint ?? err).includes("data_usaha_connection_db_uidx")) {
          set.status = 409;
          return { code: "DATABASE_ALREADY_USED" };
        }
        throw err;
      }
      return { accurateDbId: body.accurateDbId, accurateDbAlias: body.alias };
    },
    // `alias` dikirim client (sudah ada dari GET /accurate/databases) — hindari panggilan Accurate kedua.
    // maxLength 255 — konsisten batas kolom `accurate_db_alias` varchar(255).
    {
      auth: true,
      body: t.Object({ dataUsahaId: t.String({ format: "uuid" }), accurateDbId: t.Integer({ minimum: 1 }), alias: t.String({ maxLength: 255 }) }),
    },
  );
