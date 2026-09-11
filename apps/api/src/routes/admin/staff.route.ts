import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { eq, and, or, ilike, inArray, desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { auth } from "../../lib/auth";
import { roles, userRoles, auditLogs, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { boss, JOBS, startQueue } from "../../lib/queue";
import { env } from "../../lib/env";
import { escapeHtml } from "../../lib/email";

function getAdminOrigin(): string {
  // `||` (bukan `??`) SENGAJA — pola sama `getAppOrigin()` di
  // `admin/users.route.ts`, `.env` sering set string kosong bukan unset.
  return env.ADMIN_ORIGIN_PROD || "http://admin.localhost:6209";
}

// § Fase 29, ADR-0027 — provisioning akun SISI ADMIN (Super Admin/Admin),
// TERPISAH dari `POST /admin/users` (yang SELALU bikin akun `customer`).
// SENGAJA endpoint baru, bukan diperluas ke endpoint lama — 2 tipe akun
// beda origin login (admin. vs app.) & beda kebutuhan (tidak ada
// planIds/markAsPaid di sini).
// § diminta user 2026-09-05 — halaman "Pengguna" (`/admin/users`) cuma
// tampilkan customer sekarang (§ users.route.ts), akun sisi-admin (Super
// Admin/Admin) dapat MENU KHUSUS sendiri di sini — jawaban langsung atas
// "saya mau pisahin antara customer dan user untuk admin" dari awal
// permintaan role ini.
export const adminStaffRoute = new Elysia({ prefix: "/admin/staff" })
  .use(permissionPlugin)
  .get(
    "/",
    async ({ query }) => {
      const search = query.search?.trim();
      const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));
      const [staffRole] = await db.select().from(roles).where(eq(roles.name, "staff"));
      const roleIds = [adminRole?.id, staffRole?.id].filter((id): id is string => Boolean(id));
      if (roleIds.length === 0) return { users: [] };

      const memberships = await db
        .select({ userId: userRoles.userId, roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(userRoles.roleId, roleIds));
      const userIds = [...new Set(memberships.map((m) => m.userId))];
      if (userIds.length === 0) return { users: [] };

      const roleByUser = new Map(memberships.map((m) => [m.userId, m.roleName]));
      // § Fase 105 (2026-09-11) — search nama/email, pola SAMA PERSIS
      // `admin/users.route.ts` (`ilike` name/email, digabung `and()`
      // dengan filter `inArray` role di atas).
      const searchCondition = search ? or(ilike(userTable.name, `%${search}%`), ilike(userTable.email, `%${search}%`)) : undefined;
      const where = searchCondition ? and(inArray(userTable.id, userIds), searchCondition) : inArray(userTable.id, userIds);
      const rows = await db.select().from(userTable).where(where).orderBy(desc(userTable.createdAt));

      return {
        users: rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          disabled: u.disabled,
          createdAt: u.createdAt,
          role: roleByUser.get(u.id) ?? "",
        })),
      };
    },
    // § lihat daftar tim internal boleh KEDUA role (Admin terbatas juga
    // perlu tahu siapa saja rekan timnya) — tambah/nonaktifkan tetap
    // `users.manage` (endpoint POST di bawah & PATCH di users.route.ts).
    { permission: "users.view", query: t.Object({ search: t.Optional(t.String()) }) },
  )
  .post(
    "/",
  async ({ body, user, set }) => {
    const [role] = await db.select().from(roles).where(eq(roles.name, body.role));
    if (!role) {
      set.status = 400;
      return { code: "ROLE_NOT_FOUND" };
    }

    const tempPassword = randomBytes(12).toString("base64url");
    const result = await auth.api.signUpEmail({ body: { email: body.email, password: tempPassword, name: body.name } });
    if (!result?.user) {
      set.status = 400;
      return { code: "USER_CREATE_FAILED" };
    }

    // § pola sama `admin/users.route.ts` — admin-provisioned dianggap
    // terverifikasi (admin yang vouch), TIDAK perlu verifikasi email.
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, result.user.id));
    await db.insert(userRoles).values({ userId: result.user.id, roleId: role.id }).onConflictDoNothing();

    await db.insert(auditLogs).values({
      entityType: "user",
      entityId: result.user.id,
      action: "create",
      changes: { email: body.email, name: body.name, role: body.role, provisionedBy: "admin" },
      actorId: user.id,
    });

    const safeName = escapeHtml(body.name);
    const adminOrigin = getAdminOrigin();
    const loginUrl = `${adminOrigin}/login`;
    const roleLabel = body.role === "admin" ? "Super Admin" : "Admin";
    await startQueue();
    await boss.send(JOBS.SEND_EMAIL, {
      to: body.email,
      subject: "Akun admin Facport kamu sudah dibuat",
      html: `<p>Halo ${safeName},</p><p>Akun admin Facport kamu (role: ${roleLabel}) sudah dibuat. Berikut kredensial login kamu:</p><p>Email: ${body.email}<br>Password sementara: <strong>${tempPassword}</strong></p><p>Login di sini: <a href="${loginUrl}">${loginUrl}</a></p><p>Segera ganti password setelah login pertama.</p>`,
      // § pola sama `admin/users.route.ts` — password plaintext, JANGAN masuk log terstruktur.
      sensitive: true,
    });

    return { id: result.user.id, email: body.email, role: body.role, tempPassword };
  },
  {
    // § HANYA Super Admin — role "staff" (Admin terbatas) TIDAK BOLEH
    // provision akun admin/staff baru (§ ADR-0027 § Decision 2).
    permission: "users.manage",
    body: t.Object({
      email: t.String({ format: "email" }),
      name: t.String({ minLength: 1, maxLength: 100 }),
      role: t.Union([t.Literal("admin"), t.Literal("staff")]),
    }),
  },
);
