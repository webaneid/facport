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
  .get("/gate-test", () => ({ ok: true }), { moduleAccess: "purchase_invoice" })
  .get("/gate-which", ({ subscription }) => ({ dataUsahaId: subscription.dataUsahaId }), { moduleAccess: "purchase_invoice" })
  .get("/gate-mod/import/template", () => ({ ok: true }), { moduleAccess: "purchase_invoice" })
  .post("/gate-mod/import/upload", () => ({ ok: true }), { moduleAccess: "purchase_invoice" });

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

// § Fase 140, ADR-0035 — REGRESI insiden production 2026-09-21: user punya
// modul yang SAMA di 2 Data Usaha; gerbang dulu selalu ambil subscription
// TERBARU (perusahaan yang salah), tidak tahu Data Usaha aktif.
describe("moduleAccess — konteks Data Usaha aktif (header X-Data-Usaha-Id)", () => {
  async function subInDataUsaha(userId: string, dataUsahaId: string, planId: string, createdAt: Date) {
    await db.insert(subscriptions).values({
      userId,
      planId,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
      createdAt,
    });
  }

  async function setupTwoDataUsaha(tag: string) {
    const email = `gate-du-${tag}-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan DU ${tag} ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const older = await createTestDataUsaha(userId, "Perusahaan Lama");
    const newer = await createTestDataUsaha(userId, "Perusahaan Baru");
    await subInDataUsaha(userId, older, plan!.id, new Date(Date.now() - 24 * 60 * 60 * 1000));
    await subInDataUsaha(userId, newer, plan!.id, new Date());
    return { userId, cookie, older, newer };
  }

  const get = (path: string, cookie: string, dataUsahaId?: string) =>
    testApp.handle(
      new Request(`http://localhost${path}`, {
        headers: dataUsahaId ? { cookie, "x-data-usaha-id": dataUsahaId } : { cookie },
      }),
    );

  test("header memilih Data Usaha LAMA → subscription Data Usaha lama (BUKAN yang terbaru)", async () => {
    const { cookie, older } = await setupTwoDataUsaha("pilih-lama");
    const res = await get("/gate-which", cookie, older);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dataUsahaId: string }).dataUsahaId).toBe(older);
  });

  test("header memilih Data Usaha BARU → subscription Data Usaha baru", async () => {
    const { cookie, newer } = await setupTwoDataUsaha("pilih-baru");
    const res = await get("/gate-which", cookie, newer);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dataUsahaId: string }).dataUsahaId).toBe(newer);
  });

  test("tanpa header + modul ada di 2 Data Usaha → 409 DATA_USAHA_REQUIRED (fail closed, tidak menebak)", async () => {
    const { cookie } = await setupTwoDataUsaha("ambigu");
    const res = await get("/gate-which", cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_REQUIRED");
  });

  test("tanpa header + modul cuma di 1 Data Usaha → tetap 200 (klien lama / user 1 Data Usaha aman)", async () => {
    const email = `gate-du-single-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan DU single ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const du = await createTestDataUsaha(userId);
    await subInDataUsaha(userId, du, plan!.id, new Date());
    const res = await get("/gate-which", cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dataUsahaId: string }).dataUsahaId).toBe(du);
  });

  test("header Data Usaha MILIK ORANG LAIN → 403 DATA_USAHA_FORBIDDEN", async () => {
    const { cookie } = await setupTwoDataUsaha("milik-sendiri");
    const otherUserId = await signUp(`gate-du-other-${runId}@test.local`);
    const foreign = await createTestDataUsaha(otherUserId, "Punya Orang Lain");
    const res = await get("/gate-which", cookie, foreign);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_FORBIDDEN");
  });

  test("header bukan UUID valid → 403 DATA_USAHA_FORBIDDEN (bukan 500)", async () => {
    const { cookie } = await setupTwoDataUsaha("bukan-uuid");
    const res = await get("/gate-which", cookie, "bukan-uuid'; DROP TABLE users;--");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_FORBIDDEN");
  });

  test("header Data Usaha milik sendiri TAPI modul tidak dilanggan di sana → 403 MODULE_NOT_SUBSCRIBED", async () => {
    const { userId, cookie } = await setupTwoDataUsaha("tanpa-modul");
    const kosong = await createTestDataUsaha(userId, "Tanpa Langganan");
    const res = await get("/gate-which", cookie, kosong);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("MODULE_NOT_SUBSCRIBED");
  });

  test("member seat: header Data Usaha tempat dia numpang → 200; Data Usaha lain milik pemilik yang sama (bukan seat-nya) → 403", async () => {
    const ownerId = await signUp(`gate-du-owner-${runId}@test.local`);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan DU seat ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const duSeat = await createTestDataUsaha(ownerId, "Tempat Numpang");
    const duLain = await createTestDataUsaha(ownerId, "Bukan Tempat Numpang");
    await subInDataUsaha(ownerId, duSeat, plan!.id, new Date());
    await subInDataUsaha(ownerId, duLain, plan!.id, new Date());

    const memberEmail = `gate-du-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, await createTestSeat(ownerId, duSeat)));

    const ok = await get("/gate-which", memberCookie, duSeat);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { dataUsahaId: string }).dataUsahaId).toBe(duSeat);

    const denied = await get("/gate-which", memberCookie, duLain);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("DATA_USAHA_FORBIDDEN");
  });
});

// § Fase 140 (temuan security review) — tambahan.
describe("moduleAccess — kasus tepi Data Usaha aktif", () => {
  async function twoDU(tag: string) {
    const email = `gate-edge-${tag}-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Edge ${tag} ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const a = await createTestDataUsaha(userId, "A");
    const b = await createTestDataUsaha(userId, "B");
    for (const du of [a, b]) {
      await db.insert(subscriptions).values({
        userId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        dataUsahaId: du,
      });
    }
    return { userId, cookie, a, b, planId: plan!.id };
  }

  test("unduh template (GET .../import/template) TIDAK ditolak 409 untuk user multi-Data-Usaha", async () => {
    const { cookie } = await twoDU("template");
    const res = await testApp.handle(new Request("http://localhost/gate-mod/import/template", { headers: { cookie } }));
    expect(res.status).toBe(200);
  });

  test("template hanya dikecualikan untuk GET; POST upload tanpa header tetap 409", async () => {
    const { cookie } = await twoDU("upload-post");
    const res = await testApp.handle(new Request("http://localhost/gate-mod/import/upload", { method: "POST", headers: { cookie } }));
    expect(res.status).toBe(409);
  });

  test("template tetap butuh langganan modul (bukan bypass): user tanpa langganan → 403", async () => {
    const email = `gate-edge-tpl-nosub-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/gate-mod/import/template", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  test("UUID huruf BESAR di header dinormalisasi → 200 ke Data Usaha yang benar (bukan 403 MODULE_NOT_SUBSCRIBED)", async () => {
    const { cookie, a } = await twoDU("uppercase");
    const res = await testApp.handle(
      new Request("http://localhost/gate-which", { headers: { cookie, "x-data-usaha-id": a.toUpperCase() } }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dataUsahaId: string }).dataUsahaId).toBe(a);
  });

  test("seat berstatus BUKAN active (available/revoked) + header ke Data Usaha itu → 403 DATA_USAHA_FORBIDDEN", async () => {
    const ownerId = await signUp(`gate-edge-seat-owner-${runId}@test.local`);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Edge seat ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const du = await createTestDataUsaha(ownerId, "Seat Bukan Aktif");
    await db.insert(subscriptions).values({
      userId: ownerId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId: du,
    });
    const memberEmail = `gate-edge-seat-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(ownerId, du);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "revoked" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(
      new Request("http://localhost/gate-which", { headers: { cookie: memberCookie, "x-data-usaha-id": du } }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_FORBIDDEN");
  });
});
