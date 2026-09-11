import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "./auth";
import { subscriptionGatePlugin, getOwnedSubscriptionsWithPlans, getAccessibleSubscriptionsWithPlans } from "./subscription-gate";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, memberSeats, dataUsaha, user as userTable } from "../db/schema";
import { createTestDataUsaha, createTestSeat } from "./test-fixtures";

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

// § Fase 14, ADR-0019 — 2 kode error lama (SUBSCRIPTION_INACTIVE +
// MODULE_NOT_IN_PLAN) digabung jadi 1 (MODULE_NOT_SUBSCRIBED) — beda-in
// "tidak ada subscription" vs "ada tapi bukan modul ini" sudah tidak
// relevan begitu 1 user bisa punya banyak subscription independen.
describe("requireModuleAccess (subscriptionGatePlugin)", () => {
  test("403 MODULE_NOT_SUBSCRIBED kalau tidak ada subscription aktif sama sekali", async () => {
    const email = `gate-nosub-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MODULE_NOT_SUBSCRIBED");
  });

  test("403 MODULE_NOT_SUBSCRIBED kalau ADA subscription aktif tapi modulnya tidak cocok", async () => {
    const email = `gate-wrongmodule-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan A ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    await db.insert(subscriptions).values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MODULE_NOT_SUBSCRIBED");
  });

  test("200 kalau ADA subscription aktif yang modulnya cocok", async () => {
    const email = `gate-ok-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan B ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    await db.insert(subscriptions).values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(200);
  });

  // § Fase 14 — TEST BARU: skenario UTAMA yang memicu restrukturisasi
  // ini. 1 user punya 2 subscription aktif BERSAMAAN (modul beda-beda) —
  // gate WAJIB tembus untuk modul yang cocok dari SALAH SATU subscription,
  // bukan cuma yang "terbaru" (perilaku lama sebelum Fase 14 akan gagal
  // di sini kalau subscription purchase_invoice bukan yang terbaru).
  test("200 kalau user punya BANYAK subscription aktif, modul yang dicari ada di SALAH SATU (bukan cuma yang terbaru)", async () => {
    const email = `gate-multi-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const [planOlder] = await db
      .insert(plans)
      .values({ name: `Plan Multi Older ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    await db.insert(subscriptions).values({
      userId,
      planId: planOlder!.id,
      status: "active",
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    // § subscription KEDUA (lebih baru createdAt) untuk modul LAIN —
    // sebelum Fase 14, gate cuma lihat baris TERBARU ini (sales_invoice),
    // jadi modul purchase_invoice di atas jadi tidak kebaca sama sekali.
    const [planNewer] = await db
      .insert(plans)
      .values({ name: `Plan Multi Newer ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: planNewer!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie } }));
    expect(res.status).toBe(200); // gate-test minta "purchase_invoice" — ada di subscription LAMA, bukan yang terbaru
  });

  // § Fase 110, architecture-user-tambahan.md — moduleAccess macro pakai
  // getAccessibleSubscriptionsWithPlans (union), jadi MEMBER (akses lewat
  // seat) WAJIB tembus gate modul yang aktif di Data Usaha tempat dia
  // numpang, walau bukan pemilik Data Usaha itu.
  test("200 kalau user MEMBER (seat aktif) di Data Usaha yang punya subscription modul terkait", async () => {
    const primaryEmail = `gate-member-primary-${runId}@test.local`;
    const primaryId = await signUp(primaryEmail);
    const dataUsahaId = await createTestDataUsaha(primaryId);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Member ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId: primaryId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const memberEmail = `gate-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(primaryId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie: memberCookie } }));
    expect(res.status).toBe(200);
  });

  test("403 kalau seat member statusnya BUKAN active (mis. sudah di-revoke)", async () => {
    const primaryEmail = `gate-revoked-primary-${runId}@test.local`;
    const primaryId = await signUp(primaryEmail);
    const dataUsahaId = await createTestDataUsaha(primaryId);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Revoked ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId: primaryId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const memberEmail = `gate-revoked-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(primaryId, dataUsahaId);
    // § seat DIBUAT tapi TIDAK di-set active (default "available", belum
    // pernah accept) — member ini TIDAK BOLEH dapat akses apa pun.
    await db.update(memberSeats).set({ memberUserId: memberId }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(new Request("http://localhost/gate-test", { headers: { cookie: memberCookie } }));
    expect(res.status).toBe(403);
  });
});

describe("getOwnedSubscriptionsWithPlans vs getAccessibleSubscriptionsWithPlans", () => {
  // § Fase 110 "Temuan Kritis" #2 — regression test: Owned WAJIB TIDAK
  // ikut akses lewat seat (dipakai `accurate.route.ts` connect/reuse,
  // member tidak boleh pernah ubah konfigurasi integrasi).
  test("Owned TIDAK mencakup subscription yang cuma diakses lewat seat", async () => {
    const primaryEmail = `owned-vs-accessible-primary-${runId}@test.local`;
    const primaryId = await signUp(primaryEmail);
    const dataUsahaId = await createTestDataUsaha(primaryId);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan OwnedVsAccessible ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId: primaryId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        dataUsahaId,
      })
      .returning();

    const memberEmail = `owned-vs-accessible-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const seatId = await createTestSeat(primaryId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const memberOwned = await getOwnedSubscriptionsWithPlans(memberId);
    expect(memberOwned.some((s) => s.subscription.id === sub!.id)).toBe(false);

    const memberAccessible = await getAccessibleSubscriptionsWithPlans(memberId);
    expect(memberAccessible.some((s) => s.subscription.id === sub!.id)).toBe(true);

    const primaryOwned = await getOwnedSubscriptionsWithPlans(primaryId);
    expect(primaryOwned.some((s) => s.subscription.id === sub!.id)).toBe(true);
  });

  // § Temuan Kritis #1 — akses HARUS ikut kepemilikan Data Usaha SAAT INI
  // (data_usaha.userId), BUKAN subscriptions.userId yang dibekukan saat
  // beli. Simulasikan transfer manual (update data_usaha.userId langsung,
  // tanpa lewat endpoint Fase 111 yang belum ada) — Owned utk pembeli asli
  // WAJIB hilang, Owned utk pemilik baru WAJIB muncul.
  test("Owned ikut kepemilikan data_usaha.userId SAAT INI, bukan subscriptions.userId historis", async () => {
    const originalOwnerEmail = `owned-transfer-original-${runId}@test.local`;
    const originalOwnerId = await signUp(originalOwnerEmail);
    const dataUsahaId = await createTestDataUsaha(originalOwnerId);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Transfer ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId: originalOwnerId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        dataUsahaId,
      })
      .returning();

    const newOwnerEmail = `owned-transfer-new-${runId}@test.local`;
    const newOwnerId = await signUp(newOwnerEmail);

    // § simulasi transfer kepemilikan (Fase 111 belum dibangun) — cuma
    // data_usaha.userId yang berubah, subscriptions.userId TETAP pembeli asli.
    await db.update(dataUsaha).set({ userId: newOwnerId }).where(eq(dataUsaha.id, dataUsahaId));

    const originalOwnerAccess = await getOwnedSubscriptionsWithPlans(originalOwnerId);
    expect(originalOwnerAccess.some((s) => s.subscription.id === sub!.id)).toBe(false);

    const newOwnerAccess = await getOwnedSubscriptionsWithPlans(newOwnerId);
    expect(newOwnerAccess.some((s) => s.subscription.id === sub!.id)).toBe(true);

    const [refreshedSub] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub!.id));
    expect(refreshedSub!.userId).toBe(originalOwnerId); // riwayat pembelian TIDAK ditulis ulang
  });
});
