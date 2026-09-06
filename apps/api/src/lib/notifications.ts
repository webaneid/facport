import { db } from "./db";
import { notifications } from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// § Fase 45 — SEMUA teks notifikasi yang menyebut tanggal (mis. "berlaku
// sampai...") WAJIB lewat sini, BUKAN `.toLocaleDateString()` langsung
// (itu baca timezone PROSES SERVER, bukan timezone perusahaan — persis
// kelas bug yang diperbaiki Fase 44/ADR-0028). Terima `timezone` dari
// `getCompanyTimezone()` (§ lib/company-timezone.ts) — dipanggil SEKALI
// oleh caller, bukan di sini, supaya tidak query settings berulang kalau
// satu handler perlu format beberapa tanggal.
export function formatNotificationDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: timezone }).format(date);
}

// § Fase 45, ADR-0029 — daftar LENGKAP tipe notifikasi yang valid, satu
// sumber kebenaran (dipakai backend saat insert DAN referensi untuk
// frontend `lib/notification-routes.ts` resolve link tujuan). Lihat
// `docs/architecture/architecture-notifications.md` § "Katalog Tipe"
// untuk penjelasan tiap tipe (trigger, penerima, link).
export const NOTIFICATION_TYPES = {
  ORDER_CREATED: "order_created",
  PAYMENT_PROOF_SUBMITTED: "payment_proof_submitted",
  PAYMENT_VERIFIED: "payment_verified",
  PAYMENT_REJECTED: "payment_rejected",
  TRIAL_STARTED: "trial_started",
  TRIAL_ENDING_SOON: "trial_ending_soon",
  TRIAL_EXPIRED: "trial_expired",
  SUBSCRIPTION_ENDING_SOON: "subscription_ending_soon",
  SUBSCRIPTION_EXPIRED: "subscription_expired",
  ACCURATE_CONNECTION_EXPIRED: "accurate_connection_expired",
  ANNOUNCEMENT: "announcement",
  ADMIN_PAYMENT_PROOF_SUBMITTED: "admin_payment_proof_submitted",
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  sourceAnnouncementId?: string;
};

// § notifikasi = 1 INSERT ringan, BUKAN "tugas berat" (§ architecture-jobs.md)
// — dibuat SINKRON inline di titik kejadian (pola sama `audit_logs`),
// TIDAK lewat job queue. Terima `tx` opsional supaya bisa ikut
// transaction yang sudah berjalan di pemanggil (mis. checkout, confirm
// order) — kalau tidak diberi, pakai `db` langsung.
export async function createNotification(input: NotificationInput, tx: Tx | typeof db = db) {
  const [row] = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceAnnouncementId: input.sourceAnnouncementId,
    })
    .returning();
  return row!;
}

// § dipakai fan-out broadcast (§ JOBS.SEND_ANNOUNCEMENT) — 1 bulk INSERT
// untuk N penerima, BUKAN N query terpisah (cepat untuk ratusan/ribuan
// baris, § ADR-0029 "Konsekuensi").
export async function createNotificationsBulk(inputs: NotificationInput[], tx: Tx | typeof db = db) {
  if (inputs.length === 0) return [];
  return tx
    .insert(notifications)
    .values(
      inputs.map((input) => ({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        sourceAnnouncementId: input.sourceAnnouncementId,
      })),
    )
    .returning();
}
