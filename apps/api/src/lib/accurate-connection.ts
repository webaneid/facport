// § Fase 143, ADR-0037 — SATU-SATUNYA jalan menemukan "koneksi Accurate mana + database mana" untuk sebuah
// Data Usaha/subscription/batch. Model baru: Data Usaha memegang pointer ke koneksi AKUN Accurate yang dibagi
// (`data_usaha.accurate_connection_id`) + database yang dipilih (`data_usaha.accurate_db_id`). JANGAN baca
// `subscriptions.accurate_connection_id` (dibekukan, cutover) atau `accurate_connections.accurate_db_id` (legacy).
import { eq } from "drizzle-orm";
import { db } from "./db";
import { accurateConnections, dataUsaha, subscriptions } from "../db/schema";

export type AccurateConnectionRow = typeof accurateConnections.$inferSelect;

export type ResolvedAccurateConnection = {
  dataUsahaId: string;
  /** null = Data Usaha belum terhubung / diputus. */
  connection: AccurateConnectionRow | null;
  /** null = database Accurate belum dipilih untuk Data Usaha ini. */
  accurateDbId: string | null;
  accurateDbAlias: string | null;
};

export async function resolveConnectionForDataUsaha(dataUsahaId: string): Promise<ResolvedAccurateConnection | null> {
  const [row] = await db
    .select({ du: dataUsaha, connection: accurateConnections })
    .from(dataUsaha)
    .leftJoin(accurateConnections, eq(accurateConnections.id, dataUsaha.accurateConnectionId))
    .where(eq(dataUsaha.id, dataUsahaId));
  if (!row) return null;
  return {
    dataUsahaId: row.du.id,
    // Cutover (ADR-0037 #1): koneksi tanpa identitas akun = koneksi LAMA per-subscription → tidak dipakai.
    connection: row.connection && row.connection.accurateUserId ? row.connection : null,
    accurateDbId: row.du.accurateDbId,
    accurateDbAlias: row.du.accurateDbAlias,
  };
}

/** Untuk subscription/batch: turunkan lewat Data Usaha-nya (`subscriptions.dataUsahaId` NOT NULL). */
export async function resolveConnectionForSubscription(subscriptionId: string): Promise<ResolvedAccurateConnection | null> {
  const [sub] = await db.select({ dataUsahaId: subscriptions.dataUsahaId }).from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!sub) return null;
  return resolveConnectionForDataUsaha(sub.dataUsahaId);
}
