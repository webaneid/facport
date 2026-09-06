// § Fase 29, ADR-0027 — nama role DB ("admin"/"staff"/"customer") BUKAN
// label yang enak dibaca user — "admin" (DB) = "Super Admin" (UI),
// "staff" (DB) = "Admin" (UI), sengaja beda supaya tidak perlu migrasi
// nama role existing yang sudah dipakai di mana-mana (§ ADR-0027 §
// Decision 1, alasan lengkap kenapa TIDAK rename role "admin"). Dipakai
// bersama `admin/users/page.tsx` & `admin/staff/page.tsx`.
export const ROLE_LABELS: Record<string, string> = { admin: "Super Admin", staff: "Admin", customer: "Pelanggan" };

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
