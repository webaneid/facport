// § Fase 218, ADR-0055 — teks & pemetaan galat hapus/arsip/pulihkan Data Usaha. Aturan sebenarnya dipaksa server (`apps/api/src/lib/data-usaha-lifecycle.ts`).
export type LifecycleMode = "delete" | "archive" | "blocked";
export type BlockerCode = "ACTIVE_SUBSCRIPTION" | "PENDING_ORDER" | "PENDING_TRANSFER" | "IMPORT_RUNNING" | "ACTIVE_SEAT";
export type Blocker = { code: BlockerCode; count: number };

const BLOCKER_TEXT: Record<BlockerCode, (n: number) => string> = {
  ACTIVE_SUBSCRIPTION: (n) => `${n} langganan masih aktif. Tunggu hingga berakhir.`,
  PENDING_ORDER: (n) => `${n} pesanan/pembayaran belum selesai. Selesaikan atau batalkan dulu.`,
  PENDING_TRANSFER: (n) => `${n} transfer kepemilikan masih menunggu. Batalkan dulu.`,
  IMPORT_RUNNING: (n) => `${n} import sedang berjalan. Tunggu hingga selesai.`,
  ACTIVE_SEAT: (n) => `${n} User Tambahan masih aktif. Cabut aksesnya dulu di menu User Tambahan.`,
};

export function blockerText(b: Blocker): string {
  return BLOCKER_TEXT[b.code](b.count);
}

export const ARCHIVE_NOTE =
  "Data Usaha diarsipkan selama 30 hari lalu dibersihkan. Riwayat invoice dan langganan tetap tersimpan. Koneksi ke Accurate diputus. Untuk memakainya lagi, pulihkan lalu hubungkan Accurate dari awal.";
export const DELETE_NOTE = "Data Usaha ini kosong (belum ada langganan atau riwayat) dan akan dihapus permanen. Koneksi ke Accurate, bila ada, diputus.";

const ERRORS: Record<string, string> = {
  DATA_USAHA_NOT_FOUND: "Data Usaha tidak ditemukan atau bukan milik Anda.",
  CONFIRM_MISMATCH: "Nama yang diketik tidak cocok.",
  ALREADY_ARCHIVED: "Data Usaha ini sudah diarsipkan.",
  NOT_ARCHIVED: "Data Usaha ini tidak sedang diarsipkan.",
  NOT_EMPTY: "Data Usaha ini punya riwayat, jadi tidak bisa dihapus. Arsipkan saja.",
  IS_EMPTY: "Data Usaha ini kosong, jadi hapus saja (tidak perlu diarsipkan).",
  ARCHIVE_EXPIRED: "Masa simpan arsip (30 hari) sudah lewat, Data Usaha tidak bisa dipulihkan lagi.",
  HAS_BLOCKERS: "Belum bisa diarsipkan, selesaikan dulu hal-hal di atas.",
  TOO_MANY_REQUESTS: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
};

export function lifecycleError(code: string | undefined): string {
  return (code && ERRORS[code]) || "Gagal memproses. Coba lagi.";
}

/** Sisa hari sebelum arsip dibersihkan (0 bila sudah lewat). */
export function archiveDaysLeft(archivedAt: string | Date, now: Date = new Date(), retentionDays = 30): number {
  const left = retentionDays - (now.getTime() - new Date(archivedAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(left));
}
