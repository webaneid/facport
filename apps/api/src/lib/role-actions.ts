import { deriveInternalReason } from "./internal-accounts";

// § Fase 189H, D17 (architecture-admin-insight.md § 4.4) — aturan MURNI aksi peran dua arah oleh Super Admin. Tanpa DB agar mudah diuji; rute (`routes/admin/user-roles.route.ts`)
// menangani kunci baris, transaksi, sesi, email, dan audit.

export type RoleAction = "grant_customer" | "grant_admin" | "grant_staff" | "revoke_customer" | "revoke_admin" | "revoke_staff";
export const ROLE_ACTIONS: Record<RoleAction, { role: "customer" | "admin" | "staff"; mode: "grant" | "revoke" }> = {
  grant_customer: { role: "customer", mode: "grant" },
  grant_admin: { role: "admin", mode: "grant" },
  grant_staff: { role: "staff", mode: "grant" },
  revoke_customer: { role: "customer", mode: "revoke" },
  revoke_admin: { role: "admin", mode: "revoke" },
  revoke_staff: { role: "staff", mode: "revoke" },
};

export type RolePlan =
  | { ok: true; noop: boolean; before: string[]; after: string[]; internalBefore: boolean; internalAfter: boolean }
  | { ok: false; code: "WOULD_LEAVE_NO_ROLE" };

/** Hasil aksi pada role akun. `flag` = penanda internal manual (`user.is_internal`); internal efektif = flag ATAU role admin/staf (D16). */
export function planRoleChange(current: readonly string[], action: RoleAction, flag = false): RolePlan {
  const { role, mode } = ROLE_ACTIONS[action];
  const has = current.includes(role);
  const before = [...current];
  const internalBefore = deriveInternalReason(flag, before) !== null;
  if (mode === "grant") {
    const after = has ? before : [...before, role];
    return { ok: true, noop: has, before, after, internalBefore, internalAfter: deriveInternalReason(flag, after) !== null };
  }
  if (!has) return { ok: true, noop: true, before, after: before, internalBefore, internalAfter: internalBefore };
  const after = before.filter((r) => r !== role);
  if (after.length === 0) return { ok: false, code: "WOULD_LEAVE_NO_ROLE" };
  return { ok: true, noop: false, before, after, internalBefore, internalAfter: deriveInternalReason(flag, after) !== null };
}

/** Konfirmasi ketik: harus sama dengan email akun target (tak peka huruf besar/kecil, spasi tepi diabaikan). Dicek di server, bukan hanya di UI. */
export function confirmMatches(typed: string, expected: string): boolean {
  const a = typed.trim().toLowerCase();
  return a.length > 0 && a === expected.trim().toLowerCase();
}

/** Mencabut role `admin` (Super Admin) hanya boleh bila setelahnya masih ada Super Admin AKTIF lain. */
export function canRemoveSuperAdmin(activeSuperAdminCount: number): boolean {
  return activeSuperAdminCount > 1;
}
