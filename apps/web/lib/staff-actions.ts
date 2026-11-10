// § Fase 216, ADR-0053 — teks & pemetaan galat aksi atas akun staf internal (Tim Internal). Aturan sebenarnya dipaksa server (`apps/api/src/routes/admin/staff.route.ts`).
export type StaffTier = "admin" | "staff";

export const TIER_LABEL: Record<StaffTier, string> = { admin: "Super Admin", staff: "Admin" };

/** Tingkat lawan dari role sekarang (`admin` ↔ `staff`); `null` bila bukan akun staf. */
export function otherTier(role: string): StaffTier | null {
  if (role === "admin") return "staff";
  if (role === "staff") return "admin";
  return null;
}

const COMMON: Record<string, string> = {
  CONFIRM_MISMATCH: "Email konfirmasi tidak cocok.",
  USER_NOT_FOUND: "Akun tidak ditemukan.",
  ACCOUNT_ANONYMIZED: "Akun ini sudah dianonimkan, tidak dapat diubah.",
  NOT_STAFF: "Akun ini bukan akun Tim Internal.",
  TOO_MANY_REQUESTS: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
};

const ROLE_ERRORS: Record<string, string> = {
  ...COMMON,
  CANNOT_CHANGE_OWN_ROLE: "Anda tidak dapat mengubah role akun Anda sendiri.",
  CANNOT_REMOVE_LAST_SUPER_ADMIN: "Tidak dapat menurunkan Super Admin aktif terakhir.",
  ACCOUNT_DISABLED: "Akun nonaktif tidak dapat dinaikkan menjadi Super Admin. Aktifkan akun dulu.",
  ROLE_NOT_FOUND: "Role tidak ditemukan.",
};
export function staffRoleError(code: string | undefined): string {
  return (code && ROLE_ERRORS[code]) || "Gagal mengubah role. Coba lagi.";
}

const RESET_ERRORS: Record<string, string> = {
  ...COMMON,
  CANNOT_RESET_OWN_PASSWORD: "Untuk akun Anda sendiri, gunakan fitur ganti kata sandi.",
  ACCOUNT_DISABLED: "Akun nonaktif. Aktifkan akun dulu sebelum mereset kata sandi.",
  NO_PASSWORD_LOGIN: "Akun ini tidak memakai kata sandi (masuk lewat Google), jadi tidak ada kata sandi yang bisa direset.",
};
export function staffResetError(code: string | undefined): string {
  return (code && RESET_ERRORS[code]) || "Gagal mereset kata sandi. Coba lagi.";
}
