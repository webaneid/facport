import { and, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections, dataUsaha, subscriptions } from "../db/schema";
import { DEFAULT_DATA_USAHA_NAME } from "../lib/data-usaha";

// § Fase 107, architecture-user-tambahan.md § Fase B0 — migrasi data
// LAMA (SEBELUM `data_usaha` ada) supaya tidak ada subscription yang
// "kehilangan" Data Usaha. BAGIAN PALING BERISIKO dari seluruh rencana —
// WAJIB dry-run dulu (`--dry-run`) + review manual sebelum apply
// sungguhan, TIDAK sekali jalan langsung.
//
// Strategi (2 langkah, idempoten — aman dijalankan ulang berkali-kali):
// 1. 1 `data_usaha` row per `accurate_connections` row yang SUDAH ADA
//    (nama dari `accurateDbAlias`, fallback ke id kalau alias kosong) —
//    subscription yang `accurateConnectionId`-nya cocok ikut di-set
//    `dataUsahaId`-nya.
// 2. Subscription yang BELUM PERNAH connect Accurate sama sekali
//    (`accurateConnectionId` NULL) dikelompokkan ke 1 "Data Usaha Utama"
//    DEFAULT per user (dibuat kalau belum ada).
export type BackfillResult = {
  dataUsahaCreatedFromConnections: number;
  dataUsahaCreatedAsDefault: number;
  subscriptionsUpdated: number;
};

export async function backfillDataUsaha({ dryRun }: { dryRun: boolean }): Promise<BackfillResult> {
  let dataUsahaCreatedFromConnections = 0;
  let dataUsahaCreatedAsDefault = 0;
  let subscriptionsUpdated = 0;

  // § Langkah 1 — per koneksi Accurate yang sudah ada.
  const connections = await db.select().from(accurateConnections);
  for (const conn of connections) {
    let [duRow] = await db.select().from(dataUsaha).where(eq(dataUsaha.accurateConnectionId, conn.id));
    if (!duRow) {
      const name = conn.accurateDbAlias?.trim() || `Data Usaha (${conn.id.slice(0, 8)})`;
      dataUsahaCreatedFromConnections++;
      if (!dryRun) {
        [duRow] = await db.insert(dataUsaha).values({ userId: conn.userId, name, accurateConnectionId: conn.id }).returning();
      }
    }
    if (!dryRun && duRow) {
      const updated = await db
        .update(subscriptions)
        .set({ dataUsahaId: duRow.id })
        .where(and(eq(subscriptions.accurateConnectionId, conn.id), isNull(subscriptions.dataUsahaId)))
        .returning({ id: subscriptions.id });
      subscriptionsUpdated += updated.length;
    }
  }

  // § Langkah 2 — subscription yang belum pernah connect Accurate sama
  // sekali (trial murni, atau baru checkout belum sempat connect).
  const orphanSubs = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(and(isNull(subscriptions.accurateConnectionId), isNull(subscriptions.dataUsahaId)));
  const userIdsNeedingDefault = [...new Set(orphanSubs.map((s) => s.userId))];

  for (const userId of userIdsNeedingDefault) {
    let [duRow] = await db
      .select()
      .from(dataUsaha)
      .where(and(eq(dataUsaha.userId, userId), eq(dataUsaha.name, DEFAULT_DATA_USAHA_NAME), isNull(dataUsaha.accurateConnectionId)));
    if (!duRow) {
      dataUsahaCreatedAsDefault++;
      if (!dryRun) {
        [duRow] = await db.insert(dataUsaha).values({ userId, name: DEFAULT_DATA_USAHA_NAME }).returning();
      }
    }
    if (!dryRun && duRow) {
      const updated = await db
        .update(subscriptions)
        .set({ dataUsahaId: duRow.id })
        .where(and(eq(subscriptions.userId, userId), isNull(subscriptions.accurateConnectionId), isNull(subscriptions.dataUsahaId)))
        .returning({ id: subscriptions.id });
      subscriptionsUpdated += updated.length;
    }
  }

  return { dataUsahaCreatedFromConnections, dataUsahaCreatedAsDefault, subscriptionsUpdated };
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN — tidak ada perubahan ditulis ===" : "=== APPLY — perubahan akan ditulis ke DB ===");
  const result = await backfillDataUsaha({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
