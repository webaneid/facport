import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { accurateConnections, dataUsaha, user as userTable } from "../db/schema";
import { createTestAccurateConnection, createTestDataUsaha } from "../lib/test-fixtures";

// § Fase 145 (keputusan user 2026-09-22) — migrasi 0030 "putus total": kosongkan pointer/database Data Usaha yang belum menunjuk koneksi
// model BARU (termasuk hasil backfill 0028) dan cabut semua koneksi LAMA. Test menjalankan pernyataan ASLI dari file migrasi.
const runId = Date.now();
const dir = join(import.meta.dir, "../../drizzle");
const file = readdirSync(dir).find((f) => f.startsWith("0030_") && f.endsWith(".sql"))!;
const statements = readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint");

async function makeUser(tag: string) {
  const now = new Date();
  const [row] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email: `putus0030-${tag}-${runId}@test.local`, name: "Putus Total", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return row!.id;
}
const run = async () => {
  for (const st of statements) await db.execute(sql.raw(st));
};

describe("migrasi 0030 — putus total koneksi lama", () => {
  test("mengosongkan pointer+database Data Usaha berhasil-backfill dan yang menunjuk koneksi LAMA; koneksi lama → revoked (tidak dihapus)", async () => {
    const userId = await makeUser("legacy");
    const legacy = await createTestAccurateConnection(userId, { accurateUserId: null, status: "active" });
    const duLegacy = await createTestDataUsaha(userId, "Menunjuk lama");
    await db.update(dataUsaha).set({ accurateConnectionId: legacy.id, accurateDbId: "5", accurateDbAlias: "PT Lama", accurateDbConfirmedAt: new Date() }).where(eq(dataUsaha.id, duLegacy));
    const duBackfill = await createTestDataUsaha(userId, "Hasil backfill 0028");
    await db.update(dataUsaha).set({ accurateDbId: "9", accurateDbAlias: "PT Backfill" }).where(eq(dataUsaha.id, duBackfill));

    await run();

    for (const id of [duLegacy, duBackfill]) {
      const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, id));
      expect(row).toMatchObject({ accurateConnectionId: null, accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null });
    }
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, legacy.id));
    expect(after!.status).toBe("revoked");
  });

  test("koneksi model BARU dan Data Usaha yang menunjuknya TIDAK tersentuh (aman bila terjalankan ulang)", async () => {
    const userId = await makeUser("new");
    const du = await createTestDataUsaha(userId, "Model baru");
    const fresh = await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "7", accurateDbAlias: "PT Baru" });

    await run();

    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateConnectionId: fresh.id, accurateDbId: "7", accurateDbAlias: "PT Baru" });
    expect(row!.accurateDbConfirmedAt).not.toBeNull();
    const [conn] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, fresh.id));
    expect(conn!.status).toBe("active");
  });

  test("idempotent", async () => {
    const userId = await makeUser("idem");
    await createTestAccurateConnection(userId, { accurateUserId: null });
    await run();
    await run();
  });
});
