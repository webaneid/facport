import { Elysia, t } from "elysia";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, session, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { boss, JOBS, startQueue } from "../../lib/queue";
import { escapeHtml } from "../../lib/email";
import { internalChangeImpact } from "../../lib/internal-accounts";
import { ROLE_ACTIONS, canRemoveSuperAdmin, confirmMatches, planRoleChange } from "../../lib/role-actions";
import { logger } from "../../lib/logger";
import { isAnonymizedEmail } from "../../lib/account-erasure";

// § Fase 189H, D17 (architecture-admin-insight.md § 4.4) — aksi peran dua arah, HANYA Super Admin (`users.manage`): "Aktifkan akses pengguna" (admin/staf → juga customer),
// "Jadikan Admin/Super Admin" (customer → admin/staf, tanpa akun baru dan tanpa mengubah kata sandi), dan pencabutan role. Kenaikan hak akses = risiko eskalasi → dua langkah
// (`/preview` lalu apply), konfirmasi ketik email target DICEK DI SERVER, tidak boleh mengubah role diri sendiri, tidak boleh menghapus Super Admin aktif terakhir,
// akun tidak boleh berakhir tanpa role, sesi target dicabut saat hak berubah, email pemberitahuan generik, audit `role_change`. Aturan murni di `lib/role-actions.ts`.
const actionSchema = t.Union([t.Literal("grant_customer"), t.Literal("grant_admin"), t.Literal("grant_staff"), t.Literal("revoke_customer"), t.Literal("revoke_admin"), t.Literal("revoke_staff")]);
const idParams = t.Object({ id: t.String({ minLength: 1, maxLength: 100 }) });

const ROLE_LABEL: Record<string, string> = { customer: "Pengguna (aplikasi)", staff: "Admin", admin: "Super Admin" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadTarget(id: string, executor: Tx | typeof db, lock = false) {
  const base = executor.select({ id: userTable.id, name: userTable.name, email: userTable.email, disabled: userTable.disabled, isInternal: userTable.isInternal }).from(userTable).where(eq(userTable.id, id));
  const [target] = lock ? await base.for("update") : await base;
  if (!target) return null;
  const roleRows = await executor.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id));
  return { ...target, roleNames: roleRows.map((r) => r.name).sort() };
}

async function sendRoleChangedEmail(target: { email: string; name: string }, after: string[]) {
  try {
    const labels = after.map((r) => ROLE_LABEL[r] ?? r).join(", ");
    await startQueue();
    await boss.send(JOBS.SEND_EMAIL, {
      to: target.email,
      subject: "Hak akses akun Facport Anda diubah",
      html: `<p>Halo ${escapeHtml(target.name)},</p><p>Hak akses akun Facport Anda diubah oleh Super Admin. Akses Anda sekarang: ${escapeHtml(labels)}. Silakan login ulang. Jika Anda tidak mengharapkan perubahan ini, hubungi tim Facport.</p>`,
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : "unknown" }, "Email perubahan role gagal diantrekan"); // tanpa PII
  }
}

export const adminUserRolesRoute = new Elysia({ prefix: "/admin/users" })
  .use(permissionPlugin)
  .post(
    "/:id/roles/preview",
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
      const plan = planRoleChange(target.roleNames, body.action, target.isInternal);
      if (!plan.ok) {
        set.status = 400;
        return { code: plan.code };
      }
      const statusChanges = plan.internalBefore !== plan.internalAfter;
      return {
        user: { id: target.id, name: target.name, email: target.email, disabled: target.disabled },
        action: body.action,
        noop: plan.noop,
        rolesBefore: plan.before,
        rolesAfter: plan.after,
        becomesInternal: !plan.noop && !plan.internalBefore && plan.internalAfter,
        becomesCommercial: !plan.noop && plan.internalBefore && !plan.internalAfter,
        impact: !plan.noop && statusChanges ? await internalChangeImpact([target.id]) : { paidInvoiceCount: 0, paidTotal: 0, unpaidInvoices: 0, activePaidSubscriptions: 0, scheduledRenewals: 0 },
      };
    },
    { permission: "users.manage", params: idParams, body: t.Object({ action: actionSchema }) },
  )
  .post(
    "/:id/roles",
    async ({ params, body, user, set }) => {
      if (params.id === user.id) {
        set.status = 400;
        return { code: "CANNOT_CHANGE_OWN_ROLE" };
      }
      const spec = ROLE_ACTIONS[body.action];
      // Satu transaksi dengan kunci baris target (dan Super Admin aktif saat mencabut `admin`) → tidak balapan dengan Super Admin lain.
      const outcome = await db.transaction(async (tx) => {
        const target = await loadTarget(params.id, tx, true);
        if (!target) return { status: 404, code: "USER_NOT_FOUND" } as const;
        if (isAnonymizedEmail(target.email)) return { status: 409, code: "ACCOUNT_ANONYMIZED" } as const;
        if (!confirmMatches(body.confirm, target.email)) return { status: 400, code: "CONFIRM_MISMATCH" } as const;
        if (target.disabled && spec.mode === "grant" && spec.role !== "customer") return { status: 409, code: "ACCOUNT_DISABLED" } as const;
        const plan = planRoleChange(target.roleNames, body.action, target.isInternal);
        if (!plan.ok) return { status: 400, code: plan.code } as const;
        if (plan.noop) return { status: 200, changed: false, target, after: plan.after } as const;

        if (spec.mode === "revoke" && spec.role === "admin" && !target.disabled) {
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

        const [role] = await tx.select().from(roles).where(eq(roles.name, spec.role));
        if (!role) return { status: 400, code: "ROLE_NOT_FOUND" } as const;
        if (spec.mode === "grant") await tx.insert(userRoles).values({ userId: target.id, roleId: role.id }).onConflictDoNothing();
        else await tx.delete(userRoles).where(and(eq(userRoles.userId, target.id), inArray(userRoles.roleId, [role.id])));
        await tx.insert(auditLogs).values({
          entityType: "user",
          entityId: target.id,
          action: "role_change",
          changes: { action: body.action, from: plan.before, to: plan.after },
          actorId: user.id,
        });
        return { status: 200, changed: true, target, after: plan.after } as const;
      });

      if (outcome.status !== 200) {
        set.status = outcome.status;
        return { code: outcome.code };
      }
      if (outcome.changed) {
        // hak berubah → paksa login ulang; cookie cache Better Auth (≤5 menit) tidak memberi hak baru karena role dibaca dari DB per permintaan
        await db.delete(session).where(eq(session.userId, outcome.target.id));
        await sendRoleChangedEmail(outcome.target, outcome.after);
      }
      return { ok: true, changed: outcome.changed, roles: outcome.after };
    },
    { permission: "users.manage", params: idParams, body: t.Object({ action: actionSchema, confirm: t.String({ maxLength: 320 }) }) },
  );
