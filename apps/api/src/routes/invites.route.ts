import { Elysia, t } from "elysia";
import { eq, and, gt } from "drizzle-orm";
import { db } from "../lib/db";
import { memberSeats, dataUsaha, user as userTable } from "../db/schema";
import { auth } from "../lib/auth";
import { assignCustomerRole } from "../lib/assign-customer-role";
import { hashInviteToken } from "../lib/member-seats";
import { permissionPlugin } from "../lib/permission";

// § Fase 110, architecture-user-tambahan.md — endpoint PUBLIK (tanpa auth,
// kecuali `accept-existing`) untuk terima undangan "User Tambahan". Rate
// limit didaftarkan di `app.ts` (`pathPrefix: "/invites"`, pola sama
// `/api/auth`/`/public`) — endpoint publik = target abuse paling mudah.
export const invitesRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/invites/:token",
    async ({ params, set }) => {
      const seat = await findValidInviteByToken(params.token);
      if (!seat) {
        set.status = 404;
        return { code: "INVITE_NOT_FOUND_OR_EXPIRED" };
      }
      const [du] = await db.select({ name: dataUsaha.name }).from(dataUsaha).where(eq(dataUsaha.id, seat.dataUsahaId));
      const [primary] = await db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, seat.primaryUserId));
      const [existingAccount] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, seat.invitedEmail!));

      return {
        email: seat.invitedEmail,
        primaryUserName: primary?.name ?? "",
        dataUsahaName: du?.name ?? "",
        // § FE pakai ini pilih tampilan: "Set Password" (akun baru) ATAU
        // "Login untuk terima" (email ini SUDAH py akun Facport — bisa
        // terjadi, mis. akuntan yang sudah jadi customer/member di tempat
        // lain, § arsitektur "1 orang boleh jadi user tambahan di BANYAK
        // Data Usaha").
        emailAlreadyRegistered: !!existingAccount,
      };
    },
    { params: t.Object({ token: t.String({ minLength: 1 }) }) },
  )
  // § Jalur akun BARU — TOLAK kalau email SUDAH terdaftar (harus lewat
  // `accept-existing` setelah login manual, bukan bikin akun duplikat).
  .post(
    "/invites/:token/accept",
    async ({ params, body, set }) => {
      const seat = await findValidInviteByToken(params.token);
      if (!seat) {
        set.status = 404;
        return { code: "INVITE_NOT_FOUND_OR_EXPIRED" };
      }
      const [existingAccount] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, seat.invitedEmail!));
      if (existingAccount) {
        set.status = 409;
        return { code: "EMAIL_ALREADY_REGISTERED" };
      }

      const result = await auth.api.signUpEmail({ body: { email: seat.invitedEmail!, password: body.password, name: body.name } });
      if (!result?.user) {
        set.status = 400;
        return { code: "ACCOUNT_CREATE_FAILED" };
      }

      // § Invite itu SENDIRI membuktikan kepemilikan email (link dikirim
      // ke email tsb) — pola sama admin-provisioned (admin/users.route.ts),
      // TIDAK perlu verifikasi email tambahan.
      await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, result.user.id));
      await assignCustomerRole(result.user.id);
      await linkSeatToMember(seat.id, result.user.id);

      return { ok: true };
    },
    {
      params: t.Object({ token: t.String({ minLength: 1 }) }),
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 200 }), password: t.String({ minLength: 8 }) }),
    },
  )
  // § Jalur akun EXISTING — user login dulu lewat `/login` biasa (email
  // sudah cocok), lalu buka lagi link invite dan klik "Terima" — endpoint
  // ini WAJIB auth:true, dan WAJIB cek email sesi cocok `invitedEmail`
  // (case-insensitive) supaya tidak ada user LAIN yang lagi login bisa
  // klaim invite yang bukan untuknya.
  .post(
    "/invites/:token/accept-existing",
    async ({ params, user, set }) => {
      const seat = await findValidInviteByToken(params.token);
      if (!seat) {
        set.status = 404;
        return { code: "INVITE_NOT_FOUND_OR_EXPIRED" };
      }
      if (seat.invitedEmail!.toLowerCase() !== user.email.toLowerCase()) {
        set.status = 403;
        return { code: "EMAIL_MISMATCH" };
      }

      await linkSeatToMember(seat.id, user.id);
      return { ok: true };
    },
    { auth: true, params: t.Object({ token: t.String({ minLength: 1 }) }) },
  );

async function findValidInviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const [seat] = await db
    .select()
    .from(memberSeats)
    .where(and(eq(memberSeats.inviteTokenHash, tokenHash), eq(memberSeats.status, "invited"), gt(memberSeats.inviteTokenExpiresAt, now)));
  return seat ?? null;
}

async function linkSeatToMember(seatId: string, memberUserId: string) {
  await db
    .update(memberSeats)
    .set({
      memberUserId,
      status: "active",
      acceptedAt: new Date(),
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(memberSeats.id, seatId));
}
