// § Fase 189H, D17 — teks dan pemetaan galat aksi peran (UI). Aturan sebenarnya dipaksa server (`apps/api/src/lib/role-actions.ts`).
export type RoleAction = "grant_customer" | "grant_admin" | "grant_staff" | "revoke_customer" | "revoke_admin" | "revoke_staff";

export const ROLE_ACTION_TEXT: Record<RoleAction, { label: string; title: string; description: string; button: string; success: string }> = {
  grant_customer: { label: "Aktifkan akses pengguna", title: "Aktifkan akses pengguna", description: "Akun admin/staf ini juga dapat masuk ke aplikasi pelanggan (role ganda).", button: "Aktifkan akses", success: "Akses pengguna diaktifkan." },
  revoke_customer: { label: "Cabut akses pengguna", title: "Cabut akses pengguna", description: "Akun tidak lagi dapat masuk ke aplikasi pelanggan. Data pelanggan tidak dihapus.", button: "Cabut akses", success: "Akses pengguna dicabut." },
  grant_staff: { label: "Jadikan Admin", title: "Jadikan Admin", description: "Akun ini mendapat hak Admin (terbatas) tanpa membuat akun baru dan tanpa mengubah kata sandi.", button: "Jadikan Admin", success: "Akun kini ber-role Admin." },
  grant_admin: { label: "Jadikan Super Admin", title: "Jadikan Super Admin", description: "Akun ini mendapat hak penuh Super Admin. Pastikan benar-benar diperlukan.", button: "Jadikan Super Admin", success: "Akun kini ber-role Super Admin." },
  revoke_staff: { label: "Cabut role Admin", title: "Cabut role Admin", description: "Akun kehilangan hak Admin.", button: "Cabut role Admin", success: "Role Admin dicabut." },
  revoke_admin: { label: "Cabut role Super Admin", title: "Cabut role Super Admin", description: "Akun kehilangan hak Super Admin.", button: "Cabut role Super Admin", success: "Role Super Admin dicabut." },
};

const ERRORS: Record<string, string> = {
  CANNOT_CHANGE_OWN_ROLE: "Anda tidak dapat mengubah role akun Anda sendiri.",
  CANNOT_REMOVE_LAST_SUPER_ADMIN: "Tidak dapat mencabut Super Admin aktif terakhir.",
  WOULD_LEAVE_NO_ROLE: "Akun harus memiliki setidaknya satu role.",
  CONFIRM_MISMATCH: "Email konfirmasi tidak cocok.",
  ACCOUNT_DISABLED: "Akun nonaktif tidak dapat diangkat jadi Admin/Super Admin. Aktifkan akun dulu.",
  USER_NOT_FOUND: "Akun tidak ditemukan.",
};
export function roleActionError(code: string | undefined): string {
  return (code && ERRORS[code]) || "Gagal memproses perubahan role. Coba lagi.";
}

/** Aksi yang relevan untuk daftar role akun saat ini (tombol di detail user). */
export function availableRoleActions(roles: readonly string[]): RoleAction[] {
  const has = (r: string) => roles.includes(r);
  const out: RoleAction[] = [];
  if (!has("customer")) out.push("grant_customer");
  else if (roles.length > 1) out.push("revoke_customer");
  if (!has("staff") && !has("admin")) out.push("grant_staff", "grant_admin");
  if (has("staff")) out.push("revoke_staff");
  if (has("admin")) out.push("revoke_admin");
  return out;
}

// ---------- Fase 189H bagian 3: hapus permanen & anonimisasi ----------
export type EraseKind = "delete" | "anonymize";
export type EraseReasonInfo = { code: string; tables?: string[] };

const TABLE_LABELS: Record<string, string> = {
  invoices: "invoice", orders: "order", subscriptions: "langganan", import_batches: "riwayat import", member_seats: "User Tambahan/undangan",
  ownership_transfers: "transfer kepemilikan", accurate_connections: "koneksi Accurate", data_usaha: "Data Usaha berisi", conversion_logs: "log konversi",
};

export function eraseReasonText(reason: EraseReasonInfo): string {
  switch (reason.code) {
    case "SELF": return "akun Anda sendiri";
    case "STAFF_ACCOUNT": return "akun Admin/Super Admin (kelola lewat Tim Internal)";
    case "ALREADY_ANONYMIZED": return "sudah dianonimkan";
    case "IMPORT_RUNNING": return "ada import yang sedang berjalan";
    case "HAS_RECORDS": return `punya catatan bisnis: ${(reason.tables ?? []).map((t) => TABLE_LABELS[t] ?? t).join(", ")} — gunakan Anonimkan`;
    default: return reason.code;
  }
}

export const ERASE_TEXT: Record<EraseKind, { title: string; description: string; word: string; button: string; done: (n: number) => string }> = {
  delete: {
    title: "Hapus permanen akun",
    description: "Menghapus akun BERSIH dari database: hanya akun tanpa invoice, langganan, import, atau koneksi. Tidak dapat dibatalkan — pemulihan hanya dari backup.",
    word: "HAPUS",
    button: "Hapus permanen",
    done: (n) => `${n} akun dihapus permanen.`,
  },
  anonymize: {
    title: "Anonimkan akun",
    description: "Nama, email, telepon, WhatsApp, dan perusahaan diganti penanda anonim; akun dinonaktifkan dan login dibuang. Invoice, order, dan langganan TETAP (angka keuangan utuh). Tidak dapat dibatalkan.",
    word: "ANONIMKAN",
    button: "Anonimkan",
    done: (n) => `${n} akun dianonimkan.`,
  },
};
