import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "./auth";
import { subscriptionGatePlugin } from "./subscription-gate";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, user as userTable } from "../db/schema";

// § architecture-subscription.md — belum dipakai route manapun di Fase 01
// (Fase 02 yang pakai), tapi WAJIB ada test sendiri sesuai rencana eksekusi.
// Instance Elysia SENDIRI (bukan import `app` dari app.ts) — Elysia
// mengompilasi routing table di panggilan `.handle()` pertama, jadi nambah
// route ke instance `app` yang SUDAH dipakai test file lain (app.test.ts,
// jalan di process bun:test yang sama) tidak ke-pickup, ketemu sendiri pas
// nulis test ini (404 padahal route sudah "ditambahkan").

const runId = Date.now();
const testApp = new Elysia()
  .mount(auth.handler)
  .use(subscriptionGatePlugin)
  .get("/gate-test", () => ({ ok: true }), { moduleAccess: "purchase_invoice" });

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Gate Test" }),
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

describe("requireModuleAccess (subscriptionGatePlugin)", () => {
  test("403 SUBSCRIPTION_INACTIVE kalau tidak ada subscription aktif", async () => {
    const email = `gate-nosub-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("SUBSCRIPTION_INACTIVE");
  });

  test("403 MODULE_NOT_IN_PLAN kalau subscription aktif tapi modul tidak cocok", async () => {
    const email = `gate-wrongmodule-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan A ${runId}`, price: 1000, durationDays: 30, modules: ["penjualan"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MODULE_NOT_IN_PLAN");
  });

  test("200 kalau subscription aktif DAN modul cocok", async () => {
    const email = `gate-ok-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan B ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(200);
  });
});
