import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import { accurateRoute } from "./accurate.route";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { plans, subscriptions, accurateConnections, user as userTable } from "../db/schema";

// Pola sama dengan subscription-gate.test.ts — instance Elysia SENDIRI
// (bukan import `app` dari app.ts), lihat catatan Elysia route-compilation
// gotcha di docs/phases/phase-01-fondasi-produk.md § Keputusan Kecil.
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
  // Self-service WAJIB verifikasi email (§ lib/auth.ts) — test langsung
  // set emailVerified=true, bukan test alur email (bukan fokus test ini).
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

describe("POST /accurate/connect", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/accurate/connect", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  test("400 NO_ACTIVE_SUBSCRIPTION kalau user belum punya subscription aktif", async () => {
    const email = `acc-nosub-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/accurate/connect", { method: "POST", headers: { cookie } }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NO_ACTIVE_SUBSCRIPTION");
  });

  test("503 ACCURATE_NOT_CONFIGURED kalau ACCURATE_CLIENT_ID kosong (kondisi dev sekarang)", async () => {
    const email = `acc-noclient-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Accurate ${runId}`, price: 1000, durationDays: 30, modules: ["pembelian"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await testApp.handle(
      new Request("http://localhost/accurate/connect", { method: "POST", headers: { cookie } }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ACCURATE_NOT_CONFIGURED");
  });

  test("409 ALREADY_CONNECTED kalau subscription sudah punya accurate_connections", async () => {
    const email = `acc-already-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Already ${runId}`, price: 1000, durationDays: 30, modules: ["pembelian"] })
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
    await db.insert(accurateConnections).values({
      subscriptionId: subscription!.id,
      accessTokenEncrypted: "dummy",
      refreshTokenEncrypted: "dummy",
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    });

    const res = await testApp.handle(
      new Request("http://localhost/accurate/connect", { method: "POST", headers: { cookie } }),
    );
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
