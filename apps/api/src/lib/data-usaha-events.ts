import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, user as userTable } from "../db/schema";
import { logger } from "./logger";

// § Fase 189B — SATU aliran riwayat per Data Usaha di `audit_logs` (`entity_type='data_usaha'`, `entity_id`=id Data Usaha): peristiwa koneksi Accurate dan akses
// seat (User Tambahan). Dipakai halaman admin (riwayat per Data Usaha) sekarang dan laporan "Riwayat Koneksi" lintas pelanggan (189C–D). `action` ≤ 20 karakter
// (kolom varchar(20)). Rincian: docs/phases/phase-189b-riwayat-koneksi-dan-akses-seat.md.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const DATA_USAHA_ENTITY = "data_usaha";

export const DATA_USAHA_EVENT = {
  CONNECT: "connect_accurate", // pemilik menyambungkan akun Accurate (via oauth / attach akun yang sudah ada)
  SELECT_DATABASE: "select_database", // pemilik memilih database Accurate
  CONFIRM_DATABASE: "confirm_database", // pemilik mengonfirmasi database tersimpan
  RESET_DATABASE: "reset_database", // pemilik "Pilih yang Lain" — koreksi mandiri
  DISCONNECT: "disconnect_accurate", // admin memutus koneksi (sudah ada sejak Fase 144; kini membawa `reason`)
  INVITE_SEAT: "invite_seat", // undang User Tambahan (pemilik atau admin)
  REVOKE_SEAT: "revoke_seat", // cabut akses User Tambahan (pemilik atau admin; admin WAJIB beralasan)
} as const;
export type DataUsahaEventAction = (typeof DATA_USAHA_EVENT)[keyof typeof DATA_USAHA_EVENT];
const ALL_ACTIONS = Object.values(DATA_USAHA_EVENT);

export type DataUsahaEventInput = { dataUsahaId: string; action: DataUsahaEventAction; actorId: string; changes: Record<string, unknown> };

/** Untuk DI DALAM transaksi: melempar bila gagal, supaya transaksi pemanggil ikut batal (jejak dan aksinya selalu bersama). */
export async function insertDataUsahaEvent(executor: Tx | typeof db, input: DataUsahaEventInput): Promise<void> {
  await executor.insert(auditLogs).values({ entityType: DATA_USAHA_ENTITY, entityId: input.dataUsahaId, action: input.action, changes: input.changes, actorId: input.actorId });
}

/**
 * NON-FATAL, untuk alur pelanggan yang tidak boleh gagal hanya karena pencatatan riwayat (callback OAuth, pilih database, dst). Kegagalan dicatat tanpa PII
 * (hanya nama galat, aksi, id Data Usaha) dan ditelan. Jangan dipakai di dalam transaksi (galat SQL membuat transaksi tidak bisa dilanjutkan) — pakai `insertDataUsahaEvent`.
 */
export async function recordDataUsahaEvent(input: DataUsahaEventInput): Promise<void> {
  try {
    await insertDataUsahaEvent(db, input);
  } catch (err) {
    logger.error({ err: (err as Error).name, action: input.action, dataUsahaId: input.dataUsahaId }, "Gagal mencatat riwayat Data Usaha");
  }
}

export async function listDataUsahaEvents(dataUsahaId: string, limit = 50) {
  return db
    .select({
      id: auditLogs.id,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      changes: auditLogs.changes,
      actorId: auditLogs.actorId,
      actorName: userTable.name,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(userTable, eq(userTable.id, auditLogs.actorId))
    .where(and(eq(auditLogs.entityType, DATA_USAHA_ENTITY), eq(auditLogs.entityId, dataUsahaId), inArray(auditLogs.action, ALL_ACTIONS)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// § Fase 189B, D10 — alasan putus koneksi oleh admin: saran cepat (kode) + catatan bebas, KEDUANYA opsional. Kode di luar daftar ditolak validasi skema di route;
// di sini hanya merapikan (trim, kosong → tidak ada). Catatan bersifat INTERNAL admin: jangan tampilkan ke pelanggan.
export const DISCONNECT_REASON_CODES = ["salah_database", "salah_akun", "lainnya"] as const;
export type DisconnectReasonCode = (typeof DISCONNECT_REASON_CODES)[number];
export const REASON_NOTE_MAX_LENGTH = 500;

export function normalizeDisconnectReason(reason: { code?: DisconnectReasonCode; note?: string } | undefined): { code: DisconnectReasonCode | null; note: string | null } | null {
  const code = reason?.code ?? null;
  const note = reason?.note?.trim() || null;
  return code || note ? { code, note } : null;
}
