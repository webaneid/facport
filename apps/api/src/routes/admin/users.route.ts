import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { auth } from "../../lib/auth";
import { roles, userRoles, auditLogs, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § architecture-subscription.md § "Admin-Provisioned" — admin buat user
// LANGSUNG (bukan lewat form self-register publik). Password sementara
// digenerate & dikembalikan di response (admin relay manual ke user lewat
// channel apa pun) — force-change-di-login-pertama BELUM diimplementasi
// (dicatat di Known Limitations phase doc, bukan blocker Fase 01).
export const adminUsersRoute = new Elysia({ prefix: "/admin/users" })
  .use(permissionPlugin)
  .post(
    "/",
    async ({ body, user, set }) => {
      const tempPassword = randomBytes(12).toString("base64url");

      const result = await auth.api.signUpEmail({
        body: { email: body.email, password: tempPassword, name: body.name },
      });
      if (!result?.user) {
        set.status = 400;
        return { code: "USER_CREATE_FAILED" };
      }

      // Self-service WAJIB verifikasi email (§ lib/auth.ts,
      // requireEmailVerification: true) — admin-provisioned SENGAJA
      // dikecualikan, admin yang vouch validitas data, bukan email itu
      // sendiri (§ architecture-subscription.md § "Admin-Provisioned").
      await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, result.user.id));

      const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
      if (customerRole) {
        await db.insert(userRoles).values({ userId: result.user.id, roleId: customerRole.id }).onConflictDoNothing();
      }

      await db.insert(auditLogs).values({
        entityType: "user",
        entityId: result.user.id,
        action: "create",
        changes: { email: body.email, name: body.name, provisionedBy: "admin" },
        actorId: user.id,
      });

      return { id: result.user.id, email: body.email, tempPassword };
    },
    {
      permission: "users.manage",
      body: t.Object({
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    },
  );
