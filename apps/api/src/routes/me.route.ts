import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { roles, userRoles } from "../db/schema";
import { permissionPlugin } from "../lib/permission";

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
      const userRoleRows = await db
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, user.id));

      return { id: user.id, email: user.email, name: user.name, roles: userRoleRows.map((r) => r.name) };
    },
    { auth: true },
  );
