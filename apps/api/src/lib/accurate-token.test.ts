import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { decrypt } from "./encryption";
import { AccurateTokenError } from "./accurate";
import { hasRunningBatch, refreshConnectionToken } from "./accurate-token";
import { accurateConnections, dataUsaha, importBatches, plans, subscriptions, user as userTable } from "../db/schema";
import { createTestAccurateConnection, createTestDataUsaha } from "./test-fixtures";

// § Fase 143, ADR-0036 #5 — refresh AMAN-ROTASI. Fakta Accurate terbukti Fase 141 E4: refresh token sekali-pakai,
// access token lama langsung mati → dua refresh bersamaan = koneksi mati permanen. Test memakai mock fetch.
const runId = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.ACCURATE_CLIENT_ID = "test-client-id";
  process.env.ACCURATE_CLIENT_SECRET = "test-client-secret";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ACCURATE_CLIENT_ID;
  delete process.env.ACCURATE_CLIENT_SECRET;
});

async function makeUser(tag: string) {
  const now = new Date();
  const [row] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email: `acc-token-${tag}-${runId}@test.local`, name: "Token Test", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return row!.id;
}

function mockToken(handler: () => Promise<Response> | Response) {
  const calls: number[] = [];
  globalThis.fetch = (async () => {
    calls.push(Date.now());
    return handler();
  }) as unknown as typeof fetch;
  return calls;
}
const okToken = () =>
  new Response(JSON.stringify({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 1295999, token_type: "bearer", scope: "item_view vendor_view" }), { status: 200 });

describe("refreshConnectionToken", () => {
  test("refreshed: token & expiresAt & grantedScopes diganti dalam satu transaksi", async () => {
    const userId = await makeUser("ok");
    const conn = await createTestAccurateConnection(userId, { expiresAt: new Date(Date.now() + DAY) });
    mockToken(okToken);
    expect(await refreshConnectionToken(conn.id, 2 * DAY)).toBe("refreshed");
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id));
    expect(decrypt(after!.accessTokenEncrypted)).toBe("rotated-access");
    expect(decrypt(after!.refreshTokenEncrypted)).toBe("rotated-refresh");
    expect(after!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * DAY);
    expect(after!.grantedScopes).toEqual(["item_view", "vendor_view"]);
  });

  test("skipped_fresh: TIDAK memanggil Accurate kalau token masih jauh dari kedaluwarsa (refresh token tak terbuang)", async () => {
    const userId = await makeUser("fresh");
    const conn = await createTestAccurateConnection(userId, { expiresAt: new Date(Date.now() + 10 * DAY) });
    const calls = mockToken(okToken);
    expect(await refreshConnectionToken(conn.id, 2 * DAY)).toBe("skipped_fresh");
    expect(calls).toHaveLength(0);
  });

  test("skipped_inactive (expired) dan not_found tidak memanggil Accurate", async () => {
    const userId = await makeUser("inactive");
    const conn = await createTestAccurateConnection(userId, { status: "expired", expiresAt: new Date(Date.now() - DAY) });
    const calls = mockToken(okToken);
    expect(await refreshConnectionToken(conn.id, 2 * DAY)).toBe("skipped_inactive");
    expect(await refreshConnectionToken("00000000-0000-0000-0000-000000000000", 2 * DAY)).toBe("not_found");
    expect(calls).toHaveLength(0);
  });

  test("DUA refresh bersamaan pada koneksi yang sama → Accurate dipanggil SEKALI (kunci FOR UPDATE + baca ulang), bukan dua kali", async () => {
    const userId = await makeUser("race");
    const conn = await createTestAccurateConnection(userId, { expiresAt: new Date(Date.now() + DAY) });
    const calls = mockToken(async () => {
      await new Promise((r) => setTimeout(r, 150)); // proses kedua sempat masuk selagi yang pertama menahan kunci
      return okToken();
    });
    const outcomes = await Promise.all([refreshConnectionToken(conn.id, 2 * DAY), refreshConnectionToken(conn.id, 2 * DAY)]);
    expect(calls).toHaveLength(1);
    expect(outcomes.sort()).toEqual(["refreshed", "skipped_fresh"]);
  });

  test("invalid_grant → AccurateTokenError.isInvalidGrant; pesan TIDAK memuat nilai token dari body; baris tidak berubah", async () => {
    const userId = await makeUser("grant");
    const conn = await createTestAccurateConnection(userId, { expiresAt: new Date(Date.now() + DAY) });
    mockToken(() => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid refresh token: NOT-A-REAL-TOKEN-VALUE" }), { status: 400 }));
    const err = await refreshConnectionToken(conn.id, 2 * DAY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccurateTokenError);
    expect((err as AccurateTokenError).isInvalidGrant).toBe(true);
    expect((err as AccurateTokenError).message).not.toContain("NOT-A-REAL-TOKEN-VALUE");
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id));
    expect(decrypt(after!.refreshTokenEncrypted)).toBe("test-refresh-token");
    expect(after!.status).toBe("active"); // fungsi ini TIDAK menandai expired — itu keputusan pemanggil
  });

  test("galat SEMENTARA (jaringan/5xx) BUKAN invalid_grant — pemanggil tidak boleh menandai expired", async () => {
    const userId = await makeUser("transient");
    const conn = await createTestAccurateConnection(userId, { expiresAt: new Date(Date.now() + DAY) });
    mockToken(() => new Response("upstream down", { status: 503 }));
    const err5xx = await refreshConnectionToken(conn.id, 2 * DAY).catch((e: unknown) => e);
    expect(err5xx).toBeInstanceOf(AccurateTokenError);
    expect((err5xx as AccurateTokenError).isInvalidGrant).toBe(false);

    mockToken(() => {
      throw new TypeError("fetch failed");
    });
    const errNet = await refreshConnectionToken(conn.id, 2 * DAY).catch((e: unknown) => e);
    expect(errNet).not.toBeInstanceOf(AccurateTokenError);
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id));
    expect(decrypt(after!.refreshTokenEncrypted)).toBe("test-refresh-token");
  });
});

describe("hasRunningBatch", () => {
  async function seed(tag: string, batchStatus: string) {
    const userId = await makeUser(`batch-${tag}`);
    const dataUsahaId = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { dataUsahaId, accurateDbId: "1" });
    const [plan] = await db.insert(plans).values({ name: `Plan Batch ${tag} ${runId}`, price: 1, durationDays: 30, modules: ["purchase_invoice"] }).returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * DAY), dataUsahaId })
      .returning();
    await db.insert(importBatches).values({ userId, subscriptionId: sub!.id, module: "purchase_invoice", fileName: "x.xlsx", totalRows: 1, status: batchStatus });
    return conn.id;
  }

  test("true untuk batch processing dan cancelling milik Data Usaha yang memakai koneksi itu", async () => {
    expect(await hasRunningBatch(await seed("proc", "processing"))).toBe(true);
    expect(await hasRunningBatch(await seed("canc", "cancelling"))).toBe(true);
  });

  test("false untuk batch selesai/gagal dan untuk koneksi tanpa batch", async () => {
    expect(await hasRunningBatch(await seed("done", "completed"))).toBe(false);
    expect(await hasRunningBatch(await seed("fail", "failed"))).toBe(false);
    const userId = await makeUser("nobatch");
    const dataUsahaId = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { dataUsahaId });
    expect(await hasRunningBatch(conn.id)).toBe(false);
  });
});

// dataUsaha diimpor supaya jelas tabel yang dipakai fixture; tidak ada asersi langsung di sini.
void dataUsaha;
