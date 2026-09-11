import { eq, and, gt, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import { session as sessionTable, settings } from "../db/schema";

// § Fase 106, architecture-user-tambahan.md § Fase A — satu sumber
// kebenaran, pola sama `lib/import-retention.ts`/`lib/trial.ts`. Dipakai
// validasi `PUT /settings` (settings.route.ts) dan hook pembatasan sesi
// (`databaseHooks.session.create.before`, lib/auth.ts).
export const MAX_DEVICES_SETTING_KEY = "security.maxDevicesPerUser";
export const MIN_MAX_DEVICES_PER_USER = 1;
export const MAX_MAX_DEVICES_PER_USER = 10;
export const DEFAULT_MAX_DEVICES_PER_USER = 1;

async function getMaxDevicesPerUser(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, MAX_DEVICES_SETTING_KEY));
  const raw = Number(row?.value ?? DEFAULT_MAX_DEVICES_PER_USER);
  return Number.isInteger(raw) && raw >= MIN_MAX_DEVICES_PER_USER && raw <= MAX_MAX_DEVICES_PER_USER
    ? raw
    : DEFAULT_MAX_DEVICES_PER_USER;
}

// § "Device" = sesi login (§ architecture-user-tambahan.md Keputusan #2),
// BUKAN fingerprint perangkat fisik — tabel `session` cuma punya
// ipAddress/userAgent, tidak ada identitas device asli. Dipanggil dari
// `databaseHooks.session.create.before` SEBELUM sesi baru benar-benar
// di-insert Better Auth, jadi query di sini BELUM menghitung sesi baru
// itu — sisakan slot (max-1) dari sesi yang SUDAH ADA supaya total
// SETELAH sesi baru dibuat tidak pernah melebihi batas. Evict yang
// PALING LAMA dulu (`orderBy(asc(createdAt))`), bukan random — user yang
// login di device baru TIDAK PERNAH gagal login karena batas ini, yang
// ke-logout adalah device lain yang paling lama tidak dipakai untuk
// login ulang.
export async function evictOldestSessionsIfOverLimit(userId: string): Promise<void> {
  const max = await getMaxDevicesPerUser();
  const now = new Date();
  const activeSessions = await db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, now)))
    .orderBy(asc(sessionTable.createdAt));

  const keepCount = Math.max(max - 1, 0);
  if (activeSessions.length > keepCount) {
    const toEvict = activeSessions.slice(0, activeSessions.length - keepCount).map((s) => s.id);
    await db.delete(sessionTable).where(inArray(sessionTable.id, toEvict));
  }
}
