import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { permissions, rolePermissions, userRoles } from "../db/schema";

async function userHasPermission(userId: string, permissionKey: string) {
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  return rows.some((r) => r.key === permissionKey);
}

// § architecture-auth.md — middleware terpusat, BUKAN cek manual per-handler.
// Dua macro: `auth: true` (cuma cek sudah login, tidak peduli permission
// spesifik — dipakai untuk GET yang boleh dibaca siapa pun yang login) dan
// `permission: "key"` (login + role harus punya permission key tertentu).
// WAJIB pasang SALAH SATU di tiap route baru — jangan biarkan route tanpa
// keduanya kalau memang tidak sengaja publik (ini persis kelas bug yang
// ketemu di security review Fase 00: GET /settings kelupaan dikasih guard).
export const permissionPlugin = new Elysia({ name: "permission" }).macro({
  auth: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);
      return { user: session.user, session: session.session };
    },
  },
  permission: (permissionKey: string) => ({
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);

      const allowed = await userHasPermission(session.user.id, permissionKey);
      if (!allowed) return status(403);

      return { user: session.user, session: session.session };
    },
  }),
});
