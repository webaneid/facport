import { describe, test, expect, afterEach } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { session as sessionTable, settings, user as userTable } from "../db/schema";
import { evictOldestSessionsIfOverLimit, MAX_DEVICES_SETTING_KEY } from "./session-limit";

// § Fase 106, architecture-user-tambahan.md § Fase A — test logic murni
// eviction (bukan lewat HTTP sign-in sungguhan, itu domain
// `app.test.ts`/`subscription-gate.test.ts` — di sini fokus ke fungsi
// `evictOldestSessionsIfOverLimit` itu sendiri, insert baris `session`
// langsung ke DB pola sama test lain yang butuh data siap pakai).
const runId = Date.now();

async function makeUser(suffix: string) {
  const [row] = await db
    .insert(userTable)
    .values({
      id: randomUUID(),
      email: `session-limit-${suffix}-${runId}@test.local`,
      name: "Session Limit Test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return row!.id;
}

async function makeSession(userId: string, createdAt: Date) {
  const id = randomUUID();
  await db.insert(sessionTable).values({
    id,
    userId,
    token: randomUUID(),
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return id;
}

async function activeSessionIds(userId: string) {
  const rows = await db.select({ id: sessionTable.id }).from(sessionTable).where(eq(sessionTable.userId, userId));
  return rows.map((r) => r.id);
}

describe("evictOldestSessionsIfOverLimit", () => {
  afterEach(async () => {
    // § bersihkan setting supaya tidak bocor ke test lain di file
    // ini/file lain yang baca key yang sama (pola cleanup dev DB).
    await db.delete(settings).where(eq(settings.key, MAX_DEVICES_SETTING_KEY));
  });

  test("default (belum ada setting) = batas 1 — sesi lama dievict begitu ada 1 sesi existing", async () => {
    const userId = await makeUser("default");
    const old = await makeSession(userId, new Date(Date.now() - 10_000));

    await evictOldestSessionsIfOverLimit(userId);

    expect(await activeSessionIds(userId)).not.toContain(old);
  });

  test("belum ada sesi sama sekali — tidak error, tidak ada yang dievict", async () => {
    const userId = await makeUser("empty");
    await evictOldestSessionsIfOverLimit(userId);
    expect(await activeSessionIds(userId)).toEqual([]);
  });

  test("batas 3, sudah ada 2 sesi — belum ada yang dievict (masih di bawah batas)", async () => {
    const userId = await makeUser("under-limit");
    await db.insert(settings).values({ key: MAX_DEVICES_SETTING_KEY, value: 3, group: "security" });
    const a = await makeSession(userId, new Date(Date.now() - 20_000));
    const b = await makeSession(userId, new Date(Date.now() - 10_000));

    await evictOldestSessionsIfOverLimit(userId);

    const remaining = await activeSessionIds(userId);
    expect(remaining).toContain(a);
    expect(remaining).toContain(b);
  });

  test("batas 3, sudah ada 3 sesi — SATU yang paling lama dievict (sisakan slot buat sesi baru)", async () => {
    const userId = await makeUser("at-limit");
    await db.insert(settings).values({ key: MAX_DEVICES_SETTING_KEY, value: 3, group: "security" });
    const oldest = await makeSession(userId, new Date(Date.now() - 30_000));
    const middle = await makeSession(userId, new Date(Date.now() - 20_000));
    const newest = await makeSession(userId, new Date(Date.now() - 10_000));

    await evictOldestSessionsIfOverLimit(userId);

    const remaining = await activeSessionIds(userId);
    expect(remaining).not.toContain(oldest);
    expect(remaining).toContain(middle);
    expect(remaining).toContain(newest);
    expect(remaining.length).toBe(2);
  });

  test("batas 1, sudah ada 4 sesi (mis. sisa dari sebelum fitur ini ada) — SEMUA yang lama dievict, sisakan 0 slot", async () => {
    const userId = await makeUser("many-old");
    await db.insert(settings).values({ key: MAX_DEVICES_SETTING_KEY, value: 1, group: "security" });
    await makeSession(userId, new Date(Date.now() - 40_000));
    await makeSession(userId, new Date(Date.now() - 30_000));
    await makeSession(userId, new Date(Date.now() - 20_000));
    await makeSession(userId, new Date(Date.now() - 10_000));

    await evictOldestSessionsIfOverLimit(userId);

    expect(await activeSessionIds(userId)).toEqual([]);
  });

  test("nilai setting cacat (0, di luar rentang) — fallback ke default (1), bukan error/tanpa-batas", async () => {
    const userId = await makeUser("bad-setting");
    await db.insert(settings).values({ key: MAX_DEVICES_SETTING_KEY, value: 0, group: "security" });
    const old = await makeSession(userId, new Date(Date.now() - 10_000));

    await evictOldestSessionsIfOverLimit(userId);

    expect(await activeSessionIds(userId)).not.toContain(old);
  });

  test("sesi user LAIN tidak ikut kena evict", async () => {
    const userA = await makeUser("isolated-a");
    const userB = await makeUser("isolated-b");
    const sessionB = await makeSession(userB, new Date(Date.now() - 100_000));
    await makeSession(userA, new Date(Date.now() - 10_000));

    await evictOldestSessionsIfOverLimit(userA);

    expect(await activeSessionIds(userB)).toContain(sessionB);
  });
});
