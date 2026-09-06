import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import { accurateRoute } from "./accurate.route";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { plans, subscriptions, accurateConnections, user as userTable } from "../db/schema";

// § Fase 14, ADR-0020 — mirror struktur test sebelumnya, disesuaikan ke
// API baru: `POST /accurate/connect` sekarang terima `{ subscriptionId }`
// (bukan implisit dari "1 subscription aktif user"), plus test baru
// `POST /accurate/reuse` (fitur BARU Fase 14 — pakai koneksi existing
// tanpa OAuth ulang).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(accurateRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Accurate Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

async function signIn(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return res.headers.get("set-cookie") ?? "";
}

async function postConnect(cookie: string, subscriptionId: string) {
  return testApp.handle(
    new Request("http://localhost/accurate/connect", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId }),
    }),
  );
}

describe("POST /accurate/connect", () => {
  test("401 kalau tidak login", async () => {
    const res = await postConnect("", "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  test("404 SUBSCRIPTION_NOT_FOUND kalau subscriptionId tidak ada/bukan milik user/tidak aktif", async () => {
    const email = `acc-nosub-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await postConnect(cookie, "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("503 ACCURATE_NOT_CONFIGURED kalau ACCURATE_CLIENT_ID kosong (kondisi dev sekarang)", async () => {
    const email = `acc-noclient-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Accurate ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const res = await postConnect(cookie, subscription!.id);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ACCURATE_NOT_CONFIGURED");
  });

  test("409 ALREADY_CONNECTED kalau subscription sudah punya accurateConnectionId", async () => {
    const email = `acc-already-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [connection] = await db
      .insert(accurateConnections)
      .values({
        userId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      })
      .returning();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Already ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        accurateConnectionId: connection!.id,
      })
      .returning();

    const res = await postConnect(cookie, subscription!.id);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ALREADY_CONNECTED");
  });
});

describe("GET /accurate/oauth/callback", () => {
  test("redirect dengan error=invalid_state kalau state tidak ada/salah", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/accurate/oauth/callback?code=abc&state=not-a-real-state", {
        redirect: "manual",
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("error=invalid_state");
  });
});

// § Fase 14, ADR-0020 — fitur BARU: pakai koneksi Accurate yang SUDAH
// ADA (Data Usaha yang sama dipakai modul lain) untuk subscription lain,
// TANPA OAuth ulang. Ownership WAJIB dicek 2 arah (subscription DAN
// connection sama-sama milik user yang request) — test khusus ownership
// di bawah, pola sama seperti test ownership modul import lain.
describe("POST /accurate/reuse", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/accurate/reuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: "00000000-0000-0000-0000-000000000000", connectionId: "00000000-0000-0000-0000-000000000000" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("berhasil assign koneksi existing milik user ke subscription lain (tanpa OAuth ulang)", async () => {
    const email = `acc-reuse-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [connection] = await db
      .insert(accurateConnections)
      .values({
        userId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        accurateDbId: "123",
        accurateDbAlias: "PT Demo",
      })
      .returning();

    const [planA] = await db
      .insert(plans)
      .values({ name: `Plan Reuse A ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: planA!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      accurateConnectionId: connection!.id,
    });

    const [planB] = await db
      .insert(plans)
      .values({ name: `Plan Reuse B ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const [subB] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: planB!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const res = await testApp.handle(
      new Request("http://localhost/accurate/reuse", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subB!.id, connectionId: connection!.id }),
      }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.id, subB!.id));
    expect(updated!.accurateConnectionId).toBe(connection!.id);
  });

  test("404 CONNECTION_NOT_FOUND kalau connectionId bukan milik user yang request (tidak bisa pinjam koneksi user lain)", async () => {
    const ownerEmail = `acc-reuse-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const [connection] = await db
      .insert(accurateConnections)
      .values({
        userId: ownerId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const attackerEmail = `acc-reuse-attacker-${runId}@test.local`;
    const attackerId = await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Reuse Attacker ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId: attackerId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const res = await testApp.handle(
      new Request("http://localhost/accurate/reuse", {
        method: "POST",
        headers: { cookie: attackerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: sub!.id, connectionId: connection!.id }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CONNECTION_NOT_FOUND");
  });

  // § security review 2026-09-04 (Low) — connection "expired"/"revoked"
  // TIDAK boleh bisa di-reuse (token-nya sudah tidak valid), walau masih
  // milik user yang sama.
  test("404 CONNECTION_NOT_FOUND kalau connection berstatus expired (bukan active)", async () => {
    const email = `acc-reuse-expired-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [connection] = await db
      .insert(accurateConnections)
      .values({
        userId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "expired",
      })
      .returning();
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Reuse Expired ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const res = await testApp.handle(
      new Request("http://localhost/accurate/reuse", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: sub!.id, connectionId: connection!.id }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CONNECTION_NOT_FOUND");
  });
});

// § security review 2026-09-04 (Medium) — koneksi Accurate BISA dipakai
// bersama beberapa subscription sejak Fase 14 (ADR-0020). Ganti
// accurateDbId pada connection yang sudah "ke-set" diam-diam ikut
// memindahkan tujuan import subscription LAIN yang share koneksi ini —
// endpoint ini WAJIB tolak, bukan izinkan timpa diam-diam.
describe("POST /accurate/databases/select", () => {
  test("400 DATABASE_ALREADY_SELECTED kalau connection sudah punya accurateDbId (cegah timpa diam-diam Data Usaha yang di-share subscription lain)", async () => {
    const email = `acc-select-already-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [connection] = await db
      .insert(accurateConnections)
      .values({
        userId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        accurateDbId: "111",
        accurateDbAlias: "PT Sudah Dipilih",
      })
      .returning();

    const res = await testApp.handle(
      new Request("http://localhost/accurate/databases/select", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection!.id, accurateDbId: 222, alias: "PT Lain" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("DATABASE_ALREADY_SELECTED");
  });

  test("400 NOT_CONNECTED kalau connectionId tidak ada/bukan milik user", async () => {
    const email = `acc-select-notconn-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/accurate/databases/select", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "00000000-0000-0000-0000-000000000000", accurateDbId: 222, alias: "PT Lain" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_CONNECTED");
  });
});
