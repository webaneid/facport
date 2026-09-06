import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { permissions, rolePermissions, userRoles, user as userTable } from "../db/schema";

// § Fase 29, ADR-0027 — security review (High): mekanisme "nonaktifkan
// user" SEBELUMNYA cuma dijaga di 2 tempat DI LUAR layer otorisasi ini
// (intercept login `app.ts` + hapus sesi saat `PATCH /:id/disable`) —
// kalau KEDUANYA gagal/dilewati (mis. `disabled` di-set manual lewat SQL
// tanpa lewat endpoint resmi, atau bug di intercept login), TIDAK ADA
// apa pun di sini yang menangkap. Dicek LANGSUNG per-request supaya
// layer ini aman independen, sesuai prinsip architecture-security.md
// ("tiap layer harus aman seolah layer lain bisa gagal/dilewati").
// `disabled` BUKAN field bawaan Better Auth (tidak didaftarkan lewat
// `additionalFields`), jadi `session.user.disabled` tidak bisa
// diandalkan — query manual ke tabel `user` di sini.
async function isDisabled(userId: string): Promise<boolean> {
  const [row] = await db.select({ disabled: userTable.disabled }).from(userTable).where(eq(userTable.id, userId));
  return row?.disabled ?? false;
}

// § Fase 15 — exported: dipakai di luar macro juga (`invoices.route.ts`
// `GET /invoices/:id/pdf`, campur akses "milik sendiri" ATAU "admin", TIDAK
// bisa diekspresikan lewat 1 macro `permission` tunggal).
export async function userHasPermission(userId: string, permissionKey: string) {
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  return rows.some((r) => r.key === permissionKey);
}

// § Fase 19, ADR-0023 — dipakai `GET /me` supaya frontend bisa render
// `PermissionGuard` (sembunyikan tombol/menu yang user tidak boleh pakai)
// TANPA nebak dari nama role. INI HANYA UI HINT — authorization sungguhan
// tetap di backend lewat macro `permission`/`userHasPermission` di atas,
// bukan diganti oleh ini.
export async function getUserPermissionKeys(userId: string): Promise<string[]> {
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  return [...new Set(rows.map((r) => r.key))];
}

// § Fase 45 — REVERSE lookup dari `getUserPermissionKeys` di atas ("user
// ini punya permission apa" → "permission ini dipunyai user mana saja").
// Dipakai target notifikasi admin (mis. "siapa saja yang boleh
// menangani order" — `orders.manage`) — SENGAJA lewat permission
// dinamis, BUKAN hardcode role "admin", konsisten RBAC dinamis
// ADR-0027 (staff custom role bisa saja diberi permission ini juga).
export async function getUserIdsWithPermission(permissionKey: string): Promise<string[]> {
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(permissions.key, permissionKey));

  return [...new Set(rows.map((r) => r.userId))];
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
      if (await isDisabled(session.user.id)) return status(403);
      return { user: session.user, session: session.session };
    },
  },
  permission: (permissionKey: string) => ({
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);
      if (await isDisabled(session.user.id)) return status(403);

      const allowed = await userHasPermission(session.user.id, permissionKey);
      if (!allowed) return status(403);

      return { user: session.user, session: session.session };
    },
  }),
});
