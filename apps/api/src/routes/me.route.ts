import { Elysia, t } from "elysia";
import { eq, and, or, inArray, count, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { roles, userRoles, importBatches, importBatchRows, settings, dataUsaha, memberSeats, ownershipTransfers } from "../db/schema";
import { getUserPermissionKeys, permissionPlugin } from "../lib/permission";
import { MANUAL_INPUT_SECONDS_SETTING_KEY, DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW } from "../lib/manual-input-estimate";
import { ownsDataUsaha } from "../lib/data-usaha";
import { generateTransferToken } from "../lib/ownership-transfer";
import { boss, JOBS, startQueue } from "../lib/queue";
import { escapeHtml } from "../lib/email";
import { env } from "../lib/env";

// § pola sama `admin/users.route.ts`/`team.route.ts` `getAppOrigin()` —
// duplikasi sengaja (konvensi project ini).
function getAppOrigin(): string {
  return env.APP_ORIGIN_PROD || "http://app.localhost:6209";
}

// § Medium finding security review Fase 01 — proxy.ts (apps/web) cuma cek
// keberadaan session cookie (existence-only, sesuai rekomendasi Better Auth
// buat proxy/middleware), BUKAN role. Endpoint ini yang dipanggil dari
// Server Component (`app/admin/layout.tsx`) untuk cek role SEBENARNYA
// sebelum render konten admin — lapisan kedua, bukan proxy.
export const meRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me",
    async ({ user }) => {
      const [userRoleRows, permissionKeys] = await Promise.all([
        db
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(eq(userRoles.userId, user.id)),
        getUserPermissionKeys(user.id),
      ]);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: userRoleRows.map((r) => r.name),
        permissions: permissionKeys,
      };
    },
    { auth: true },
  )
  // § Fase 109, architecture-user-tambahan.md § Fase B2 — gerbang "Pilih
  // Data Usaha" (`/pilih-usaha`). GANTIKAN `GET /me/data-usaha/default`
  // (jembatan sementara Fase 107, sudah dihapus) — user sekarang benar2
  // pilih/buat Data Usaha sendiri, bukan auto-default diam-diam.
  // § Fase 110 — WAJIB union kepemilikan + Data Usaha tempat user py seat
  // AKTIF (member User Tambahan) — tanpa ini, member PURE (tidak punya
  // Data Usaha sendiri) tidak akan PERNAH lihat Data Usaha yang dia
  // numpang di gerbang ini, walau `subscription-gate.ts` sudah kasih dia
  // akses (gap ditemukan saat desain halaman `/invite/[token]`, sebelum
  // sempat jadi bug production).
  .get(
    "/me/data-usaha",
    async ({ user }) => {
      const rows = await db
        .select({ id: dataUsaha.id, name: dataUsaha.name, accurateConnectionId: dataUsaha.accurateConnectionId, ownerId: dataUsaha.userId })
        .from(dataUsaha)
        .where(
          or(
            eq(dataUsaha.userId, user.id),
            inArray(
              dataUsaha.id,
              db
                .select({ dataUsahaId: memberSeats.dataUsahaId })
                .from(memberSeats)
                .where(and(eq(memberSeats.memberUserId, user.id), eq(memberSeats.status, "active"))),
            ),
          ),
        )
        .orderBy(desc(dataUsaha.createdAt));
      return { dataUsaha: rows.map((r) => ({ ...r, isOwner: r.ownerId === user.id })) };
    },
    { auth: true },
  )
  .post(
    "/me/data-usaha",
    async ({ user, body }) => {
      const [created] = await db.insert(dataUsaha).values({ userId: user.id, name: body.name.trim() }).returning();
      return created;
    },
    { auth: true, body: t.Object({ name: t.String({ minLength: 1, maxLength: 200 }) }) },
  )
  // § Fase 111, architecture-user-tambahan.md — inisiasi transfer
  // kepemilikan Data Usaha (self-service, 2 tahap initiate→accept, pola
  // sama invite Fase 110). HANYA `data_usaha.userId` yang berubah begitu
  // di-accept (`lib/ownership-transfer.ts` `executeOwnershipTransfer`) —
  // `subscriptions.userId`/`invoices.userId` TIDAK PERNAH ditulis ulang
  // (riwayat pembelian historis, § ADR-0032).
  .post(
    "/me/data-usaha/:id/transfer-ownership",
    async ({ user, params, body, set }) => {
      if (!(await ownsDataUsaha(user.id, params.id))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      if (body.toEmail.toLowerCase() === user.email.toLowerCase()) {
        set.status = 400;
        return { code: "CANNOT_TRANSFER_TO_SELF" };
      }
      const [existingPending] = await db
        .select({ id: ownershipTransfers.id })
        .from(ownershipTransfers)
        .where(and(eq(ownershipTransfers.dataUsahaId, params.id), eq(ownershipTransfers.status, "pending")));
      if (existingPending) {
        set.status = 409;
        return { code: "TRANSFER_ALREADY_PENDING" };
      }

      const { token, tokenHash, expiresAt } = generateTransferToken();
      await db.insert(ownershipTransfers).values({
        dataUsahaId: params.id,
        fromUserId: user.id,
        toEmail: body.toEmail,
        tokenHash,
        tokenExpiresAt: expiresAt,
      });

      const [du] = await db.select({ name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.id, params.id));
      await sendTransferEmail({ to: body.toEmail, fromName: user.name, dataUsahaName: du?.name ?? "", token });

      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ toEmail: t.String({ format: "email" }) }),
    },
  )
  // § Batal transfer yang masih pending — pola sama semangat `revoke` seat
  // (Fase 110), supaya salah ketik email tidak terkunci 7 hari nunggu
  // expired sendiri sebelum bisa transfer ulang ke alamat yang benar.
  .post(
    "/me/data-usaha/:id/transfer-ownership/cancel",
    async ({ user, params, set }) => {
      if (!(await ownsDataUsaha(user.id, params.id))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const [pending] = await db
        .select({ id: ownershipTransfers.id })
        .from(ownershipTransfers)
        .where(and(eq(ownershipTransfers.dataUsahaId, params.id), eq(ownershipTransfers.fromUserId, user.id), eq(ownershipTransfers.status, "pending")));
      if (!pending) {
        set.status = 404;
        return { code: "TRANSFER_NOT_FOUND" };
      }
      await db
        .update(ownershipTransfers)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(ownershipTransfers.id, pending.id));
      return { ok: true };
    },
    { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  // § diminta user 2026-09-06 — "efisiensi waktu kerja" di dashboard
  // customer: total baris SUKSES milik user ini sendiri (GABUNGAN semua
  // modul yang pernah dia import, `import_batches.userId`, TIDAK dibatasi
  // subscription/module tertentu) dikali estimasi admin
  // (`data.manualInputSecondsPerRow`, § lib/manual-input-estimate.ts).
  // Baris `cancelled` (Batal Import) TIDAK dihitung — sama prinsipnya
  // dengan `admin/stats.route.ts`. Perhitungan waktu dilakukan DI SINI
  // (server), frontend cuma format tampilan — 1 sumber kebenaran logic.
  .get(
    "/me/stats",
    async ({ user }) => {
      const [rowCountRows, manualInputSetting] = await Promise.all([
        db
          .select({ successfulRowCount: count() })
          .from(importBatchRows)
          .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
          .where(and(eq(importBatches.userId, user.id), eq(importBatchRows.status, "success"))),
        db.select().from(settings).where(eq(settings.key, MANUAL_INPUT_SECONDS_SETTING_KEY)),
      ]);

      const successfulRowCount = rowCountRows[0]?.successfulRowCount ?? 0;
      const manualInputSecondsPerRow = Number(manualInputSetting[0]?.value ?? DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW);

      return {
        successfulRowCount,
        estimatedTimeSavedSeconds: successfulRowCount * manualInputSecondsPerRow,
      };
    },
    { auth: true },
  )
  // § diminta user 2026-09-06 — "Arsip Import" gabungan: SEMUA batch
  // import milik user ini, LINTAS SEMUA modul (`import_batches.userId`,
  // TIDAK filter `module` sama sekali) — dipakai card "Import Terakhir"
  // (dashboard, limit kecil) DAN halaman arsip penuh (paginated). TIDAK
  // dibatasi subscription AKTIF SEKARANG — riwayat batch lama dari modul
  // yang mungkin sudah tidak disubscribe lagi TETAP muncul (ini archive
  // milik user, bukan filter akses modul).
  .get(
    "/me/import-batches",
    async ({ user, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = eq(importBatches.userId, user.id);
      const [batches, totalRows] = await Promise.all([
        db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(importBatches).where(where),
      ]);
      return { batches, total: totalRows[0]?.total ?? 0 };
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  );

async function sendTransferEmail(params: { to: string; fromName: string; dataUsahaName: string; token: string }) {
  const appOrigin = getAppOrigin();
  const transferUrl = `${appOrigin}/transfer/${params.token}`;
  const safeFromName = escapeHtml(params.fromName);
  const safeDataUsaha = escapeHtml(params.dataUsahaName);
  await startQueue();
  await boss.send(JOBS.SEND_EMAIL, {
    to: params.to,
    subject: `${params.fromName || "Seseorang"} ingin transfer kepemilikan Data Usaha ke kamu di Facport`,
    html: `<p>${safeFromName} ingin memindahkan kepemilikan Data Usaha <strong>${safeDataUsaha}</strong> ke kamu di Facport.</p><p>Klik link berikut untuk menerima (berlaku 7 hari): <a href="${transferUrl}">${transferUrl}</a></p>`,
  });
}
