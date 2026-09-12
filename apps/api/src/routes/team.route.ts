import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { memberSeats, dataUsaha, user as userTable } from "../db/schema";
import { ownsDataUsaha } from "../lib/data-usaha";
import { generateInviteToken, revokeAllSessions } from "../lib/member-seats";
import { boss, JOBS, startQueue } from "../lib/queue";
import { escapeHtml } from "../lib/email";
import { env } from "../lib/env";
import { permissionPlugin } from "../lib/permission";

// § pola sama `admin/users.route.ts` `getAppOrigin()` — duplikasi
// sengaja (konvensi project ini, `||` bukan `??` karena `.env` sering
// set string kosong bukan unset).
function getAppOrigin(): string {
  return env.APP_ORIGIN_PROD || "http://app.localhost:6209";
}

// § Fase 110, architecture-user-tambahan.md — customer-facing "Kelola
// Tim": list/invite/resend/revoke seat User Tambahan. SEMUA endpoint
// WAJIB verifikasi user yang login MEMILIKI Data Usaha seat ini SEKARANG
// (`ownsDataUsaha`, bukan cuma auth:true) — cegah user A kelola seat milik
// Data Usaha user B.
// § Fase 111 (fix, ditemukan saat audit sebelum menambah transfer
// kepemilikan) — invite/resend/revoke SEBELUMNYA cek `seat.primaryUserId
// === user.id` (siapa yang BELI slot ini, snapshot beku). Ini SALAH begitu
// transfer kepemilikan (Fase 111) ada: pemilik LAMA yang sudah transfer
// pergi tetap bisa kelola tim Data Usaha yang bukan miliknya lagi (masih
// `primaryUserId`), sementara pemilik BARU tidak bisa sama sekali (bukan
// `primaryUserId`). Diganti `ownsDataUsaha(user.id, seat.dataUsahaId)` —
// kontrol kelola tim SEKARANG ikut kepemilikan Data Usaha SAAT INI, sama
// prinsipnya dengan `getOwnedSubscriptionsWithPlans` (ADR-0032).
// `primaryUserId` sendiri TETAP TIDAK BERUBAH (riwayat "siapa yang beli
// slot ini", snapshot historis, sama seperti `subscriptions.userId`).
export const teamRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me/team",
    async ({ user, query, set }) => {
      if (!(await ownsDataUsaha(user.id, query.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const seats = await db
        .select({
          id: memberSeats.id,
          status: memberSeats.status,
          invitedEmail: memberSeats.invitedEmail,
          invitedAt: memberSeats.invitedAt,
          acceptedAt: memberSeats.acceptedAt,
          memberUserId: memberSeats.memberUserId,
          memberName: userTable.name,
          memberEmail: userTable.email,
        })
        .from(memberSeats)
        .leftJoin(userTable, eq(userTable.id, memberSeats.memberUserId))
        .where(eq(memberSeats.dataUsahaId, query.dataUsahaId));
      return { seats };
    },
    { auth: true, query: t.Object({ dataUsahaId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/me/team/:seatId/invite",
    async ({ user, params, body, set }) => {
      const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, params.seatId));
      if (!seat || !(await ownsDataUsaha(user.id, seat.dataUsahaId))) {
        set.status = 404;
        return { code: "SEAT_NOT_FOUND" };
      }
      if (seat.status !== "available") {
        set.status = 400;
        return { code: "SEAT_NOT_AVAILABLE" };
      }

      const { token, tokenHash, expiresAt } = generateInviteToken();
      const now = new Date();
      await db
        .update(memberSeats)
        .set({
          invitedEmail: body.email,
          inviteTokenHash: tokenHash,
          inviteTokenExpiresAt: expiresAt,
          status: "invited",
          invitedAt: now,
          updatedAt: now,
        })
        .where(eq(memberSeats.id, seat.id));

      const [du] = await db.select({ name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.id, seat.dataUsahaId));
      const [primary] = await db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, user.id));
      await sendInviteEmail({ to: body.email, inviterName: primary?.name ?? "", dataUsahaName: du?.name ?? "", token });

      return { ok: true };
    },
    { auth: true, params: t.Object({ seatId: t.String({ format: "uuid" }) }), body: t.Object({ email: t.String({ format: "email" }) }) },
  )
  .post(
    "/me/team/:seatId/resend",
    async ({ user, params, set }) => {
      const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, params.seatId));
      if (!seat || !(await ownsDataUsaha(user.id, seat.dataUsahaId))) {
        set.status = 404;
        return { code: "SEAT_NOT_FOUND" };
      }
      if (seat.status !== "invited" || !seat.invitedEmail) {
        set.status = 400;
        return { code: "SEAT_NOT_INVITED" };
      }

      const { token, tokenHash, expiresAt } = generateInviteToken();
      await db
        .update(memberSeats)
        .set({ inviteTokenHash: tokenHash, inviteTokenExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(memberSeats.id, seat.id));

      const [du] = await db.select({ name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.id, seat.dataUsahaId));
      const [primary] = await db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, user.id));
      await sendInviteEmail({ to: seat.invitedEmail, inviterName: primary?.name ?? "", dataUsahaName: du?.name ?? "", token });

      return { ok: true };
    },
    { auth: true, params: t.Object({ seatId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/me/team/:seatId/revoke",
    async ({ user, params, set }) => {
      const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, params.seatId));
      if (!seat || !(await ownsDataUsaha(user.id, seat.dataUsahaId))) {
        set.status = 404;
        return { code: "SEAT_NOT_FOUND" };
      }
      if (seat.status === "available") {
        set.status = 400;
        return { code: "SEAT_ALREADY_AVAILABLE" };
      }

      const previousMemberUserId = seat.memberUserId;
      await db
        .update(memberSeats)
        .set({
          memberUserId: null,
          invitedEmail: null,
          inviteTokenHash: null,
          inviteTokenExpiresAt: null,
          status: "available",
          revokedAt: new Date(),
          revokedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(memberSeats.id, seat.id));

      // § WAJIB cabut sesi aktif member yang di-revoke — dia harus
      // langsung ke-logout, bukan tetap bisa akses sampai sesi
      // kadaluarsa sendiri.
      if (previousMemberUserId) {
        await revokeAllSessions(previousMemberUserId);
      }

      return { ok: true };
    },
    { auth: true, params: t.Object({ seatId: t.String({ format: "uuid" }) }) },
  );

async function sendInviteEmail(params: { to: string; inviterName: string; dataUsahaName: string; token: string }) {
  const appOrigin = getAppOrigin();
  const inviteUrl = `${appOrigin}/invite/${params.token}`;
  const safeInviter = escapeHtml(params.inviterName);
  const safeDataUsaha = escapeHtml(params.dataUsahaName);
  await startQueue();
  await boss.send(JOBS.SEND_EMAIL, {
    to: params.to,
    subject: `${params.inviterName || "Seseorang"} mengundangmu ke Facport`,
    html: `<p>${safeInviter} mengundang kamu sebagai User Tambahan untuk Data Usaha <strong>${safeDataUsaha}</strong> di Facport.</p><p>Klik link berikut untuk menerima undangan (berlaku 7 hari): <a href="${inviteUrl}">${inviteUrl}</a></p>`,
  });
}
