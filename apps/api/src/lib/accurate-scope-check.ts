// § architecture-accurate-scope-engine.md, ADR-0036 #4 — SATU fungsi verifikasi scope. Dipakai
// di `/accurate/reuse`, sebelum import dijadwalkan (route import), awal worker import, dan status
// koneksi untuk UI. Jangan bikin pengecekan scope lain di tempat lain.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { logger } from "./logger";
import { decrypt } from "./encryption";
import { getApprovedScopes } from "./accurate";
import { scopesForModules } from "./accurate-scopes";
import { accurateConnections } from "../db/schema";
import { resolveConnectionForSubscription } from "./accurate-connection";

type Connection = typeof accurateConnections.$inferSelect;

/** Inti murni: scope yang dibutuhkan modul (+ baseline) dikurangi scope yang sudah diberikan. */
export function missingScopes(granted: readonly string[], moduleKeys: string[]): string[] {
  const have = new Set(granted);
  return scopesForModules(moduleKeys).filter((scope) => !have.has(scope));
}

/**
 * Scope yang diberikan ke koneksi. Baris pra-Fase 142 punya `grantedScopes` NULL ("belum diketahui") —
 * diisi malas lewat `approved-scope.do` lalu disimpan. Gagal (token mati/jaringan) → `null` = TETAP
 * tidak diketahui; pemanggil TIDAK boleh menganggapnya "scope kosong" (jangan memblokir karena ini).
 */
export async function resolveGrantedScopes(connection: Connection): Promise<string[] | null> {
  if (connection.grantedScopes) return connection.grantedScopes;
  try {
    const scopes = (await getApprovedScopes(decrypt(connection.accessTokenEncrypted))).slice().sort();
    await db.update(accurateConnections).set({ grantedScopes: scopes }).where(eq(accurateConnections.id, connection.id));
    return scopes;
  } catch (err) {
    logger.warn({ err, connectionId: connection.id }, "Gagal ambil approved-scope.do — scope koneksi tetap tidak diketahui");
    return null;
  }
}

export type ScopeCheck = { ok: true } | { ok: false; missing: string[] };

export async function checkConnectionScopes(connection: Connection, moduleKeys: string[]): Promise<ScopeCheck> {
  const granted = await resolveGrantedScopes(connection);
  if (!granted) return { ok: true }; // tidak diketahui → jangan blokir; 403 runtime tetap ditangkap AccurateScopeError
  const missing = missingScopes(granted, moduleKeys);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** Cek untuk subscription: koneksi milik Data Usaha-nya (ADR-0037). Belum terhubung → ok (bukan urusan scope). */
export async function checkSubscriptionScopes(subscriptionId: string, moduleKey: string): Promise<ScopeCheck> {
  const resolved = await resolveConnectionForSubscription(subscriptionId);
  if (!resolved?.connection) return { ok: true };
  return checkConnectionScopes(resolved.connection, [moduleKey]);
}
