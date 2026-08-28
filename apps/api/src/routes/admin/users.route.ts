import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { eq, and, or, ilike, inArray, desc, count } from "drizzle-orm";
import { db } from "../../lib/db";
import { auth } from "../../lib/auth";
import { roles, userRoles, auditLogs, subscriptions, plans, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § architecture-subscription.md § "Admin-Provisioned" — admin buat user
// LANGSUNG (bukan lewat form self-register publik). Password sementara
// digenerate & dikembalikan di response (admin relay manual ke user lewat
// channel apa pun) — force-change-di-login-pertama BELUM diimplementasi
// (dicatat di Known Limitations phase doc, bukan blocker Fase 01).
export const adminUsersRoute = new Elysia({ prefix: "/admin/users" })
  .use(permissionPlugin)
  // § Fase 10 — list user + role + subscription AKTIF (kalau ada), buat
  // halaman `/admin/users`. Query role/subscription DIPISAH (bukan 1 JOIN
  // besar) supaya tidak duplikasi baris user kalau punya >1 role — pola
  // fetch-lalu-gabung-di-memory, bukan SQL join multi-baris.
  .get(
    "/",
    async ({ query }) => {
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;
      const search = query.search?.trim();
      const where = search ? or(ilike(userTable.name, `%${search}%`), ilike(userTable.email, `%${search}%`)) : undefined;

      const [rows, totalRows] = await Promise.all([
        db.select().from(userTable).where(where).orderBy(desc(userTable.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(userTable).where(where),
      ]);

      const userIds = rows.map((r) => r.id);
      const [roleRows, subRows] = userIds.length
        ? await Promise.all([
            db
              .select({ userId: userRoles.userId, roleName: roles.name })
              .from(userRoles)
              .innerJoin(roles, eq(userRoles.roleId, roles.id))
              .where(inArray(userRoles.userId, userIds)),
            db
              .select({ userId: subscriptions.userId, status: subscriptions.status, planName: plans.name, endAt: subscriptions.endAt })
              .from(subscriptions)
              .innerJoin(plans, eq(subscriptions.planId, plans.id))
              .where(and(inArray(subscriptions.userId, userIds), eq(subscriptions.status, "active"))),
          ])
        : [[], []];

      const rolesByUser = new Map<string, string[]>();
      for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.roleName]);
      const subByUser = new Map(subRows.map((s) => [s.userId, s]));

      return {
        users: rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          emailVerified: u.emailVerified,
          createdAt: u.createdAt,
          roles: rolesByUser.get(u.id) ?? [],
          activeSubscription: subByUser.get(u.id) ?? null,
        })),
        total: totalRows[0]?.total ?? 0,
      };
    },
    {
      permission: "users.manage",
      query: t.Object({
        search: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
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
