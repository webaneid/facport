import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { eq, and, or, ilike, inArray, desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, session, account, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { boss, JOBS, startQueue } from "../../lib/queue";
import { env } from "../../lib/env";
import { escapeHtml } from "../../lib/email";
import { safeSignUpEmail } from "../../lib/auth-errors";
import { auth } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { isAnonymizedEmail } from "../../lib/account-erasure";
import { canRemoveSuperAdmin, confirmMatches, planTierSwitch } from "../../lib/role-actions";
import { loadTarget, sendRoleChangedEmail } from "./user-roles.route";

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
    // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 (audit menyeluruh, KOREKSI
    // dari fix pertama hari ini yang salah asumsi) — `signUpEmail` untuk
    // email duplikat TIDAK throw di project ini (`requireEmailVerification:
    // true` bikin Better Auth balikin user SINTETIS/PALSU, bukan throw) —
    // pakai `safeSignUpEmail` (lib/auth-errors.ts) yang menangani SEMUA
    // bentuk kegagalan ini + verifikasi id BENAR tersimpan di DB sebelum
    // dipakai insert ke tabel lain. § docs/lessons-learned.md untuk detail
    // lengkap root cause asli bug "Gagal membuat akun staff" untuk
    // fajar@cpssoft.com.
    const signUpResult = await safeSignUpEmail({ email: body.email, password: tempPassword, name: body.name });
    if (!signUpResult.ok) {
      set.status = 400;
      return { code: signUpResult.reason === "EMAIL_ALREADY_EXISTS" ? "EMAIL_ALREADY_EXISTS" : "USER_CREATE_FAILED" };
    }
    const userId = signUpResult.userId;

    // § pola sama `admin/users.route.ts` — admin-provisioned dianggap
    // terverifikasi (admin yang vouch), TIDAK perlu verifikasi email.
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, userId));
    await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();

    await db.insert(auditLogs).values({
      entityType: "user",
      entityId: userId,
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

    return { id: userId, email: body.email, role: body.role, tempPassword };
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
  )
  // § Fase 216, ADR-0053 — ubah tingkat akun staf (Admin ↔ Super Admin) sebagai SATU operasi atomik. Pratinjau dulu (tanpa menulis), lalu terapkan dengan konfirmasi ketik email.
  // Aturan murni di `lib/role-actions.ts` (`planTierSwitch`); di sini kunci baris, transaksi, sesi, email, audit — pola `user-roles.route.ts` (Fase 189H).
  .post(
    "/:id/role/preview",
    async ({ params, body, user, set }) => {
      if (params.id === user.id) {
        set.status = 400;
        return { code: "CANNOT_CHANGE_OWN_ROLE" };
      }
      const target = await loadTarget(params.id, db);
      if (!target) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }
      const plan = planTierSwitch(target.roleNames, body.role);
      if (!plan.ok) {
        set.status = 400;
        return { code: plan.code };
      }
      const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));
      const activeSuperAdmins = adminRole
        ? (await db.select({ id: userRoles.userId }).from(userRoles).innerJoin(userTable, eq(userTable.id, userRoles.userId)).where(and(eq(userRoles.roleId, adminRole.id), eq(userTable.disabled, false)))).length
        : 0;
      return {
        user: { id: target.id, name: target.name, email: target.email, disabled: target.disabled },
        noop: plan.noop,
        rolesBefore: plan.before,
        rolesAfter: plan.after,
        promotes: plan.promotes,
        demotes: plan.demotes,
        activeSuperAdmins,
        // penurunan ditolak bila ini Super Admin aktif terakhir; UI memperingatkan, server yang menegakkan saat terapkan
        blockedLastSuperAdmin: plan.demotes && !target.disabled && !canRemoveSuperAdmin(activeSuperAdmins),
      };
    },
    { permission: "users.manage", params: t.Object({ id: t.String({ minLength: 1, maxLength: 100 }) }), body: t.Object({ role: t.Union([t.Literal("admin"), t.Literal("staff")]) }) },
  )
  .post(
    "/:id/role",
    async ({ params, body, user, set }) => {
      if (params.id === user.id) {
        set.status = 400;
        return { code: "CANNOT_CHANGE_OWN_ROLE" };
      }
      // Satu transaksi dengan kunci baris target (dan Super Admin aktif saat menurunkan) → tidak balapan dengan Super Admin lain.
      const outcome = await db.transaction(async (tx) => {
        const target = await loadTarget(params.id, tx, true);
        if (!target) return { status: 404, code: "USER_NOT_FOUND" } as const;
        if (isAnonymizedEmail(target.email)) return { status: 409, code: "ACCOUNT_ANONYMIZED" } as const;
        if (!confirmMatches(body.confirm, target.email)) return { status: 400, code: "CONFIRM_MISMATCH" } as const;
        const plan = planTierSwitch(target.roleNames, body.role);
        if (!plan.ok) return { status: 400, code: plan.code } as const;
        if (plan.noop) return { status: 200, changed: false, target, after: plan.after } as const;
        if (target.disabled && plan.promotes) return { status: 409, code: "ACCOUNT_DISABLED" } as const;

        if (plan.demotes && !target.disabled) {
          const [adminRole] = await tx.select().from(roles).where(eq(roles.name, "admin"));
          if (adminRole) {
            const active = await tx
              .select({ userId: userRoles.userId })
              .from(userRoles)
              .innerJoin(userTable, eq(userTable.id, userRoles.userId))
              .where(and(eq(userRoles.roleId, adminRole.id), eq(userTable.disabled, false)))
              .orderBy(userRoles.userId)
              .for("update");
            if (!canRemoveSuperAdmin(active.length)) return { status: 400, code: "CANNOT_REMOVE_LAST_SUPER_ADMIN" } as const;
          }
        }

        const tierRoles = await tx.select().from(roles).where(inArray(roles.name, ["admin", "staff"]));
        const targetRole = tierRoles.find((r) => r.name === body.role);
        if (!targetRole) return { status: 400, code: "ROLE_NOT_FOUND" } as const;
        await tx.delete(userRoles).where(and(eq(userRoles.userId, target.id), inArray(userRoles.roleId, tierRoles.filter((r) => r.id !== targetRole.id).map((r) => r.id))));
        await tx.insert(userRoles).values({ userId: target.id, roleId: targetRole.id }).onConflictDoNothing();
        await tx.insert(auditLogs).values({
          entityType: "user",
          entityId: target.id,
          action: "role_change",
          changes: { action: "switch_tier", from: plan.before, to: plan.after },
          actorId: user.id,
        });
        return { status: 200, changed: true, target, after: plan.after } as const;
      });

      if (outcome.status !== 200) {
        set.status = outcome.status;
        return { code: outcome.code };
      }
      if (outcome.changed) {
        // hak berubah → paksa login ulang; role dibaca dari DB per permintaan sehingga hak baru langsung berlaku
        await db.delete(session).where(eq(session.userId, outcome.target.id));
        await sendRoleChangedEmail(outcome.target, outcome.after);
      }
      return { ok: true, changed: outcome.changed, roles: outcome.after };
    },
    { permission: "users.manage", params: t.Object({ id: t.String({ minLength: 1, maxLength: 100 }) }), body: t.Object({ role: t.Union([t.Literal("admin"), t.Literal("staff")]), confirm: t.String({ maxLength: 320 }) }) },
  )
  // § Fase 216, ADR-0053 — reset kata sandi akun staf: sandi sementara acak, hash lewat Better Auth (`context.password.hash` + `internalAdapter.updatePassword`, terbukti di spike
  // 2026-11-10: login sandi baru berhasil, sandi lama gagal), semua sesi target dicabut. Sandi dikirim ke email staf (job `sensitive`, tidak masuk log) dan dikembalikan SEKALI ke
  // Super Admin. Audit TIDAK memuat sandi. Akun tanpa kredensial sandi (mis. login Google saja) ditolak jelas, tidak dibuatkan kredensial diam-diam.
  .post(
    "/:id/reset-password",
    async ({ params, body, user, set }) => {
      if (params.id === user.id) {
        set.status = 400;
        return { code: "CANNOT_RESET_OWN_PASSWORD" };
      }
      const target = await loadTarget(params.id, db);
      if (!target) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }
      if (isAnonymizedEmail(target.email)) {
        set.status = 409;
        return { code: "ACCOUNT_ANONYMIZED" };
      }
      if (!confirmMatches(body.confirm, target.email)) {
        set.status = 400;
        return { code: "CONFIRM_MISMATCH" };
      }
      if (!target.roleNames.includes("admin") && !target.roleNames.includes("staff")) {
        set.status = 400;
        return { code: "NOT_STAFF" };
      }
      if (target.disabled) {
        set.status = 409;
        return { code: "ACCOUNT_DISABLED" };
      }
      const ctx = await auth.$context;
      const tempPassword = randomBytes(12).toString("base64url");
      const passwordHash = await ctx.password.hash(tempPassword);
      // § audit keamanan 216 (LOW-1) — SATU transaksi: kunci baris target, periksa ULANG (bisa berubah sejak pemeriksaan awal), ganti hash, cabut sesi, tulis audit. Bila salah satu gagal
      // semuanya batal (tidak ada keadaan "sandi berganti tanpa audit/sesi masih hidup"). Hash dihasilkan hasher resmi Better Auth; tabel `account` diperbarui di transaksi yang sama.
      const outcome = await db.transaction(async (tx) => {
        const locked = await loadTarget(target.id, tx, true);
        if (!locked) return { status: 404, code: "USER_NOT_FOUND" } as const;
        if (isAnonymizedEmail(locked.email)) return { status: 409, code: "ACCOUNT_ANONYMIZED" } as const;
        if (!locked.roleNames.includes("admin") && !locked.roleNames.includes("staff")) return { status: 400, code: "NOT_STAFF" } as const;
        if (locked.disabled) return { status: 409, code: "ACCOUNT_DISABLED" } as const;
        const updated = await tx
          .update(account)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")))
          .returning({ id: account.id });
        if (updated.length === 0) return { status: 409, code: "NO_PASSWORD_LOGIN" } as const; // mis. login Google saja: tidak dibuatkan kredensial diam-diam
        await tx.delete(session).where(eq(session.userId, target.id));
        await tx.insert(auditLogs).values({
          entityType: "user",
          entityId: target.id,
          action: "update",
          changes: { passwordReset: true }, // JANGAN PERNAH memuat sandi
          actorId: user.id,
        });
        return { status: 200 } as const;
      });
      if (outcome.status !== 200) {
        set.status = outcome.status;
        return { code: outcome.code };
      }

      // Sandi SUDAH diganti: kegagalan antre email tidak boleh menggagalkan respons (Super Admin masih menerima sandi dan bisa menyampaikannya).
      try {
        await startQueue();
        await boss.send(JOBS.SEND_EMAIL, {
          to: target.email,
          subject: "Kata sandi akun admin Facport kamu direset",
          html: `<p>Halo ${escapeHtml(target.name)},</p><p>Kata sandi akun admin Facport kamu direset oleh Super Admin. Kredensial login baru:</p><p>Email: ${escapeHtml(target.email)}<br>Password sementara: <strong>${tempPassword}</strong></p><p>Login di sini: <a href="${getAdminOrigin()}/login">${getAdminOrigin()}/login</a></p><p>Segera ganti password setelah login.</p>`,
          sensitive: true, // password plaintext, JANGAN masuk log terstruktur
        });
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : "unknown" }, "Email reset kata sandi gagal diantrekan"); // tanpa PII/sandi
      }
      return { email: target.email, tempPassword };
    },
    { permission: "users.manage", params: t.Object({ id: t.String({ minLength: 1, maxLength: 100 }) }), body: t.Object({ confirm: t.String({ maxLength: 320 }) }) },
  );
