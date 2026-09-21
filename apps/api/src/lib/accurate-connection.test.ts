import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { resolveConnectionForDataUsaha, resolveConnectionForSubscription } from "./accurate-connection";
import { dataUsaha, plans, subscriptions, user as userTable } from "../db/schema";
import { createTestAccurateConnection, createTestDataUsaha } from "./test-fixtures";

// § Fase 143, ADR-0037 — resolver tunggal: Data Usaha memegang koneksi (akun) + database.
const runId = Date.now();

async function makeUser(tag: string) {
  const now = new Date();
  const [row] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email: `acc-resolver-${tag}-${runId}@test.local`, name: "Resolver Test", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return row!.id;
}

describe("resolveConnectionForDataUsaha", () => {
  test("null kalau Data Usaha tidak ada", async () => {
    expect(await resolveConnectionForDataUsaha("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  test("koneksi & database dari Data Usaha; koneksi null bila belum terhubung", async () => {
    const userId = await makeUser("basic");
    const empty = await createTestDataUsaha(userId, "Kosong");
    expect(await resolveConnectionForDataUsaha(empty)).toEqual({ dataUsahaId: empty, connection: null, accurateDbId: null, accurateDbAlias: null });

    const du = await createTestDataUsaha(userId, "Terhubung");
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "42", accurateDbAlias: "PT 42" });
    const resolved = await resolveConnectionForDataUsaha(du);
    expect(resolved?.connection?.id).toBe(conn.id);
    expect(resolved).toMatchObject({ accurateDbId: "42", accurateDbAlias: "PT 42" });
  });

  test("koneksi LAMA (accurate_user_id NULL) diperlakukan tidak ada (cutover), database terakhir tetap dilaporkan", async () => {
    const userId = await makeUser("legacy");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateUserId: null, accurateDbId: "9", accurateDbAlias: "PT Lama" });
    const resolved = await resolveConnectionForDataUsaha(du);
    expect(resolved?.connection).toBeNull();
    expect(resolved?.accurateDbId).toBe("9");
  });

  test("2 Data Usaha berbagi 1 koneksi akun, masing-masing punya database sendiri", async () => {
    const userId = await makeUser("shared");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: duA, accurateDbId: "1", accurateDbAlias: "PT 1" });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id, accurateDbId: "2", accurateDbAlias: "PT 2" }).where(eq(dataUsaha.id, duB));
    const [a, b] = await Promise.all([resolveConnectionForDataUsaha(duA), resolveConnectionForDataUsaha(duB)]);
    expect(a?.connection?.id).toBe(conn.id);
    expect(b?.connection?.id).toBe(conn.id);
    expect([a?.accurateDbId, b?.accurateDbId]).toEqual(["1", "2"]);
  });
});

describe("resolveConnectionForSubscription", () => {
  test("diturunkan lewat Data Usaha subscription; null kalau subscription tidak ada", async () => {
    const userId = await makeUser("sub");
    const du = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "7" });
    const [plan] = await db.insert(plans).values({ name: `Plan Resolver ${runId}`, price: 1, durationDays: 30, modules: ["purchase_invoice"] }).returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), dataUsahaId: du })
      .returning();
    const resolved = await resolveConnectionForSubscription(sub!.id);
    expect(resolved?.connection?.id).toBe(conn.id);
    expect(resolved?.accurateDbId).toBe("7");
    expect(await resolveConnectionForSubscription("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  test("pointer lama subscriptions.accurateConnectionId DIABAIKAN (dibekukan)", async () => {
    const userId = await makeUser("frozen");
    const du = await createTestDataUsaha(userId);
    const legacy = await createTestAccurateConnection(userId, { accurateDbId: "3" }); // tidak dipasang ke Data Usaha
    const [plan] = await db.insert(plans).values({ name: `Plan Frozen ${runId}`, price: 1, durationDays: 30, modules: ["purchase_invoice"] }).returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), dataUsahaId: du, accurateConnectionId: legacy.id })
      .returning();
    expect((await resolveConnectionForSubscription(sub!.id))?.connection).toBeNull();
  });
});
