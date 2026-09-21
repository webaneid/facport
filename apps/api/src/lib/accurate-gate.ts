// § Fase 144, architecture-accurate-connect-gate.md — SATU mesin status koneksi Accurate per Data Usaha. Dipakai popup
// (gerbang), banner, kartu dashboard, halaman /accurate dan penghalang halaman import. Jangan bikin turunan status lain di tempat lain.
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { accurateConnections, dataUsaha } from "../db/schema";
import { getAccessibleSubscriptionsWithPlans } from "./subscription-gate";
import { hasAccessToDataUsaha, ownsDataUsaha } from "./data-usaha";
import { resolveConnectionForDataUsaha } from "./accurate-connection";
import { missingScopes, resolveGrantedScopes } from "./accurate-scope-check";
import { ALL_ACCURATE_SCOPES, MODULE_ACCURATE_SCOPES } from "./accurate-scopes";
import { hasRunningBatch } from "./accurate-token";
import { MODULE_CATALOG } from "./module-catalog";

export type GateState = "ok" | "not_connected" | "reconnect" | "update_permissions" | "select_database" | "confirm_database";

export type AccurateGate = {
  state: GateState;
  /** true = "database terakhir diketahui" hasil backfill migrasi (belum dikonfirmasi) & belum terhubung: koneksi lama sebelum cutover. */
  migrated: boolean;
  isOwner: boolean;
  /** false = Data Usaha ini hanya memakai produk yang tidak butuh Accurate (Konverter/AutoProduksi) → tidak ada gerbang. */
  requiresAccurate: boolean;
  accountEmail: string | null;
  accurateDbAlias: string | null;
  /** Database terakhir diketahui saat koneksi diputus (transfer/admin/cutover) — untuk narasi "sebelumnya terhubung ke …". */
  lastKnownDbAlias: string | null;
  /** Fitur yang DIBELI Data Usaha ini yang scope-nya belum diberikan (sumber narasi "izin baru"). */
  missingModules: { key: string; label: string }[];
  missingScopes: string[];
  /** Scope katalog yang belum diberikan (informasi saja, TANPA popup: customer tidak dinag soal fitur yang tidak dipakai). */
  catalogMissingScopes: string[];
  /** Ada batch import/cancel berjalan — otorisasi ulang mematikan token yang dipakainya (Fase 141 E2), jadi ditahan. */
  importRunning: boolean;
  /** Akun Accurate milik pemilik yang sudah terhubung (untuk "pakai akun yang sama"). HANYA pemilik. */
  accounts: { id: string; accountEmail: string | null }[];
};

const LABELS = new Map<string, string>(MODULE_CATALOG.map((m) => [m.key, m.label]));
const FACPORT_MODULES = new Set<string>(MODULE_CATALOG.filter((m) => m.productLine === "facport").map((m) => m.key));

/** `null` = user tidak punya akses ke Data Usaha ini (pemanggil balas 404). */
export async function computeAccurateGate(userId: string, dataUsahaId: string): Promise<AccurateGate | null> {
  if (!(await hasAccessToDataUsaha(userId, dataUsahaId))) return null;
  const isOwner = await ownsDataUsaha(userId, dataUsahaId);

  const resolved = await resolveConnectionForDataUsaha(dataUsahaId);
  if (!resolved) return null;
  const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));

  // Modul yang DIBELI Data Usaha ini (bukan seluruh katalog).
  const activeSubs = (await getAccessibleSubscriptionsWithPlans(userId)).filter((s) => s.subscription.dataUsahaId === dataUsahaId);
  const boughtModules = [...new Set(activeSubs.flatMap((s) => s.plan.modules))];
  const accurateModules = boughtModules.filter((m) => FACPORT_MODULES.has(m) && m in MODULE_ACCURATE_SCOPES);
  // Data Usaha baru (belum beli apa pun) tetap diarahkan menghubungkan; yang hanya memakai produk non-Accurate tidak.
  const requiresAccurate = boughtModules.length === 0 || accurateModules.length > 0;

  const connection = resolved.connection;
  const base: AccurateGate = {
    state: "ok",
    migrated: false,
    isOwner,
    requiresAccurate,
    accountEmail: isOwner ? (connection?.accurateUserEmail ?? null) : null,
    accurateDbAlias: resolved.accurateDbId ? resolved.accurateDbAlias : null,
    lastKnownDbAlias: !connection ? resolved.accurateDbAlias : null,
    missingModules: [],
    missingScopes: [],
    catalogMissingScopes: [],
    importRunning: false,
    accounts: [],
  };
  if (!requiresAccurate) return base;

  const withAccounts = async (gate: AccurateGate): Promise<AccurateGate> => {
    if (!isOwner) return gate;
    const rows = await db
      .select()
      .from(accurateConnections)
      .where(and(eq(accurateConnections.userId, userId), eq(accurateConnections.status, "active"), isNotNull(accurateConnections.accurateUserId)));
    return { ...gate, accounts: rows.map((c) => ({ id: c.id, accountEmail: c.accurateUserEmail })) };
  };

  // 1. belum terhubung (atau hanya koneksi lama sebelum cutover)
  if (!connection) {
    return withAccounts({ ...base, state: "not_connected", migrated: !!resolved.accurateDbId && !du?.accurateDbConfirmedAt });
  }
  // 2. koneksi ada tapi mati
  if (connection.status !== "active") {
    return withAccounts({ ...base, state: "reconnect", importRunning: await hasRunningBatch(connection.id) });
  }

  const importRunning = await hasRunningBatch(connection.id);
  // 3. izin kurang untuk fitur yang DIBELI (scope tidak diketahui = tidak menuduh)
  const granted = await resolveGrantedScopes(connection);
  let missing: string[] = [];
  let missingModules: { key: string; label: string }[] = [];
  let catalogMissing: string[] = [];
  if (granted) {
    missing = missingScopes(granted, accurateModules);
    missingModules = accurateModules
      .filter((m) => missingScopes(granted, [m]).length > 0)
      .map((m) => ({ key: m, label: LABELS.get(m) ?? m }));
    const have = new Set(granted);
    catalogMissing = ALL_ACCURATE_SCOPES.filter((s) => !have.has(s));
  }
  const withScopes: AccurateGate = { ...base, importRunning, missingModules, missingScopes: missing, catalogMissingScopes: catalogMissing };
  if (missing.length > 0) return { ...withScopes, state: "update_permissions" };
  // 4. database belum dipilih
  if (!resolved.accurateDbId) return { ...withScopes, state: "select_database" };
  // 5. database belum dikonfirmasi (hasil backfill)
  if (!du?.accurateDbConfirmedAt) return { ...withScopes, state: "confirm_database" };
  return withScopes;
}
