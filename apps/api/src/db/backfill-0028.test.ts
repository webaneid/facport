import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections, dataUsaha, plans, subscriptions, user as userTable } from "../db/schema";
import { createTestAccurateConnection, createTestDataUsaha } from "../lib/test-fixtures";

// § Fase 143, ADR-0037 #7 — backfill di migrasi 0028: "database terakhir diketahui" per Data Usaha dari koneksi LAMA
// yang dipakai subscription-nya (koneksi TERBARU menang). Test menjalankan pernyataan UPDATE ASLI dari file migrasi
// (bukan salinan) supaya tidak bisa menyimpang dari yang dideploy.
const runId = Date.now();
const migrationsDir = join(import.meta.dir, "../../drizzle");
const file = readdirSync(migrationsDir).find((f) => f.startsWith("0028_") && f.endsWith(".sql"))!;
const statements = readFileSync(join(migrationsDir, file), "utf8").split("--> statement-breakpoint");
const backfill = statements.find((s) => s.includes('UPDATE "data_usaha"'))!;

async function makeUser(tag: string) {
  const now = new Date();
  const [row] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email: `backfill-${tag}-${runId}@test.local`, name: "Backfill", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return row!.id;
}

async function subscribe(userId: string, dataUsahaId: string, connectionId: string | null, tag: string) {
  const [plan] = await db.insert(plans).values({ name: `Plan Backfill ${tag} ${runId}`, price: 1, durationDays: 30, modules: ["purchase_invoice"] }).returning();
  await db.insert(subscriptions).values({
    userId,
    planId: plan!.id,
    status: "active",
    startAt: new Date(),
    endAt: new Date(Date.now() + 86_400_000),
    dataUsahaId,
    accurateConnectionId: connectionId,
  });
}

async function legacyConnection(userId: string, dbId: string, alias: string, connectedAt: Date) {
  const conn = await createTestAccurateConnection(userId, { accurateUserId: null, status: "expired" });
  await db.update(accurateConnections).set({ accurateDbId: dbId, accurateDbAlias: alias, connectedAt }).where(eq(accurateConnections.id, conn.id));
  return conn;
}

describe("migrasi 0028 — backfill data_usaha.accurate_db_*", () => {
  test("pernyataan backfill ada di file migrasi", () => {
    expect(backfill).toBeTruthy();
  });

  test("menyalin database dari koneksi lama; koneksi TERBARU menang; pointer koneksi TIDAK di-backfill", async () => {
    const userId = await makeUser("newest");
    const du = await createTestDataUsaha(userId);
    const older = await legacyConnection(userId, "100", "PT Lama", new Date("2026-09-01"));
    const newer = await legacyConnection(userId, "200", "PT Baru", new Date("2026-09-10"));
    await subscribe(userId, du, older.id, "old");
    await subscribe(userId, du, newer.id, "new");

    await db.execute(sql.raw(backfill));
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateDbId: "200", accurateDbAlias: "PT Baru", accurateConnectionId: null });
  });

  test("idempotent & tidak menimpa database yang sudah terisi", async () => {
    const userId = await makeUser("keep");
    const du = await createTestDataUsaha(userId);
    await db.update(dataUsaha).set({ accurateDbId: "999", accurateDbAlias: "PT Sudah Ada" }).where(eq(dataUsaha.id, du));
    const conn = await legacyConnection(userId, "300", "PT Lain", new Date());
    await subscribe(userId, du, conn.id, "keep");

    await db.execute(sql.raw(backfill));
    await db.execute(sql.raw(backfill)); // kedua kali: tidak berubah
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateDbId: "999", accurateDbAlias: "PT Sudah Ada" });
  });

  test("Data Usaha tanpa subscription berkoneksi / koneksi tanpa database tetap NULL", async () => {
    const userId = await makeUser("none");
    const duNoSub = await createTestDataUsaha(userId, "Tanpa Sub");
    const duNoDb = await createTestDataUsaha(userId, "Tanpa DB");
    const noDb = await createTestAccurateConnection(userId, { accurateUserId: null });
    await subscribe(userId, duNoDb, noDb.id, "nodb");

    await db.execute(sql.raw(backfill));
    for (const id of [duNoSub, duNoDb]) {
      const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, id));
      expect(row).toMatchObject({ accurateDbId: null, accurateDbAlias: null });
    }
  });
});
