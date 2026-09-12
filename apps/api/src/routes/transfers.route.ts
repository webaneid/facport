import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user as userTable } from "../db/schema";
import { auth } from "../lib/auth";
import { assignCustomerRole } from "../lib/assign-customer-role";
import { findValidTransferByToken, executeOwnershipTransfer } from "../lib/ownership-transfer";
import { permissionPlugin } from "../lib/permission";

// § Fase 111, architecture-user-tambahan.md — endpoint PUBLIK (tanpa auth,
// kecuali `accept-existing`) untuk terima transfer kepemilikan Data Usaha.
// Struktur SAMA PERSIS `invites.route.ts` (Fase 110, sudah lolos security
// review) — 2 jalur akun (baru/existing), token HASH-only, expiry+status
// dicek via `findValidTransferByToken` (yang JUGA cek ulang `fromUserId`
// masih = pemilik SAAT INI, § komentar di `lib/ownership-transfer.ts`).
// Rate limit didaftarkan di `app.ts` (`pathPrefix: "/transfers"`).
export const transfersRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/transfers/:token",
    async ({ params, set }) => {
      const found = await findValidTransferByToken(params.token);
      if (!found) {
        set.status = 404;
        return { code: "TRANSFER_NOT_FOUND_OR_EXPIRED" };
      }
      const [fromUser] = await db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, found.transfer.fromUserId));
      const [existingAccount] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, found.transfer.toEmail));

      return {
        email: found.transfer.toEmail,
        fromUserName: fromUser?.name ?? "",
        dataUsahaName: found.dataUsahaName,
        emailAlreadyRegistered: !!existingAccount,
      };
    },
    { params: t.Object({ token: t.String({ minLength: 1 }) }) },
  )
  // § Jalur akun BARU — TOLAK kalau email sudah terdaftar (harus lewat
  // `accept-existing` setelah login manual).
  .post(
    "/transfers/:token/accept",
    async ({ params, body, set }) => {
      const found = await findValidTransferByToken(params.token);
      if (!found) {
        set.status = 404;
        return { code: "TRANSFER_NOT_FOUND_OR_EXPIRED" };
      }
      const [existingAccount] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, found.transfer.toEmail));
      if (existingAccount) {
        set.status = 409;
        return { code: "EMAIL_ALREADY_REGISTERED" };
      }

      const result = await auth.api.signUpEmail({ body: { email: found.transfer.toEmail, password: body.password, name: body.name } });
      if (!result?.user) {
        set.status = 400;
        return { code: "ACCOUNT_CREATE_FAILED" };
      }

      // § transfer itu SENDIRI membuktikan kepemilikan email (link
      // dikirim ke email tsb) — pola sama invite Fase 110, tidak perlu
      // verifikasi email tambahan.
      await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, result.user.id));
      await assignCustomerRole(result.user.id);
      await executeOwnershipTransfer(found.transfer.id, found.transfer.dataUsahaId, result.user.id);

      return { ok: true };
    },
    {
      params: t.Object({ token: t.String({ minLength: 1 }) }),
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 200 }), password: t.String({ minLength: 8 }) }),
    },
  )
  // § Jalur akun EXISTING — WAJIB auth:true + email sesi cocok `toEmail`
  // (case-insensitive), cegah user lain yang lagi login klaim transfer
  // yang bukan untuknya.
  .post(
    "/transfers/:token/accept-existing",
    async ({ params, user, set }) => {
      const found = await findValidTransferByToken(params.token);
      if (!found) {
        set.status = 404;
        return { code: "TRANSFER_NOT_FOUND_OR_EXPIRED" };
      }
      if (found.transfer.toEmail.toLowerCase() !== user.email.toLowerCase()) {
        set.status = 403;
        return { code: "EMAIL_MISMATCH" };
      }

      await executeOwnershipTransfer(found.transfer.id, found.transfer.dataUsahaId, user.id);
      return { ok: true };
    },
    { auth: true, params: t.Object({ token: t.String({ minLength: 1 }) }) },
  );
