// § Fase 143, ADR-0036 #5 / ADR-0037 #8 — refresh token AMAN-ROTASI. Terbukti Fase 141 E4: refresh token
// sekali-pakai, access token lama langsung mati. Karena itu: (1) kunci baris koneksi (FOR UPDATE) supaya dua
// proses tidak memakai refresh token yang sama, (2) baca ulang `expiresAt` SETELAH dapat kunci (proses lain
// mungkin sudah memperbarui), (3) simpan token baru di transaksi yang sama dengan pemanggilan refresh.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { decrypt, encrypt } from "./encryption";
import { refreshAccessToken, parseGrantedScopes } from "./accurate";
import { accurateConnections, dataUsaha, importBatches, subscriptions } from "../db/schema";

export type RefreshOutcome = "refreshed" | "skipped_fresh" | "skipped_inactive" | "not_found";

/**
 * Perbarui token bila kedaluwarsa dalam `refreshWithinMs`. Melempar `AccurateTokenError` (invalid_grant = koneksi mati)
 * atau galat jaringan (sementara) — PEMANGGIL yang memutuskan: hanya `isInvalidGrant` yang menandai `expired`.
 */
export async function refreshConnectionToken(connectionId: string, refreshWithinMs: number): Promise<RefreshOutcome> {
  return db.transaction(async (tx) => {
    const [connection] = await tx.select().from(accurateConnections).where(eq(accurateConnections.id, connectionId)).for("update");
    if (!connection) return "not_found";
    if (connection.status !== "active") return "skipped_inactive";
    if (connection.expiresAt.getTime() > Date.now() + refreshWithinMs) return "skipped_fresh";

    const token = await refreshAccessToken(decrypt(connection.refreshTokenEncrypted));
    await tx
      .update(accurateConnections)
      .set({
        accessTokenEncrypted: encrypt(token.access_token),
        refreshTokenEncrypted: encrypt(token.refresh_token),
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        grantedScopes: parseGrantedScopes(token.scope) ?? connection.grantedScopes,
        updatedAt: new Date(),
      })
      .where(eq(accurateConnections.id, connection.id));
    return "refreshed";
  });
}

/**
 * Ada batch import/cancel yang sedang berjalan untuk Data Usaha pengguna koneksi ini? Memutar token saat itu membuat
 * access token yang dipegang worker langsung 401 di tengah batch — job refresh melewatinya (coba lagi esok hari;
 * ambang 2 hari memberi ≥2 kesempatan sebelum benar-benar kedaluwarsa).
 */
export async function hasRunningBatch(connectionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .innerJoin(subscriptions, eq(subscriptions.id, importBatches.subscriptionId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .where(and(eq(dataUsaha.accurateConnectionId, connectionId), inArray(importBatches.status, ["processing", "cancelling"])))
    .limit(1);
  return !!row;
}
