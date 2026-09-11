import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, plans, subscriptions, memberSeats, importBatches, importBatchRows, settings, ownershipTransfers } from "../db/schema";
import { meRoute } from "./me.route";
import { MANUAL_INPUT_SECONDS_SETTING_KEY } from "../lib/manual-input-estimate";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § diminta user 2026-09-06 — "efisiensi waktu kerja" di dashboard
// customer dihitung DI SINI (server), jadi angkanya harus benar: total
// baris SUKSES milik user ini (lintas modul) × setting admin.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(meRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Me Stats Test" }),
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

// § Fase 109, architecture-user-tambahan.md § Fase B2 — gerbang "Pilih
// Data Usaha": list Data Usaha MILIK user yang login, + bikin baru.
describe("GET & POST /me/data-usaha", () => {
  test("401 kalau tidak login (GET)", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/data-usaha"));
    expect(res.status).toBe(401);
  });

  test("401 kalau tidak login (POST)", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/me/data-usaha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "PT Test" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("GET hanya balikin Data Usaha MILIK user ini, bukan milik user lain", async () => {
    const ownerId = await signUp(`me-data-usaha-owner-${runId}@test.local`);
    const ownerCookie = await signIn(`me-data-usaha-owner-${runId}@test.local`);
    const otherId = await signUp(`me-data-usaha-other-${runId}@test.local`);

    await createTestDataUsaha(ownerId, `Punya Owner ${runId}`);
    await createTestDataUsaha(otherId, `Punya Other ${runId}`);

    const res = await testApp.handle(new Request("http://localhost/me/data-usaha", { headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataUsaha: { name: string }[] };
    const names = body.dataUsaha.map((d) => d.name);
    expect(names).toContain(`Punya Owner ${runId}`);
    expect(names).not.toContain(`Punya Other ${runId}`);
  });

  test("POST bikin Data Usaha baru milik user yang login, trim nama", async () => {
    const userId = await signUp(`me-data-usaha-create-${runId}@test.local`);
    const cookie = await signIn(`me-data-usaha-create-${runId}@test.local`);

    const res = await testApp.handle(
      new Request("http://localhost/me/data-usaha", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `  PT Baru ${runId}  ` }),
      }),
    );
    expect(res.status).toBe(200);
    const created = (await res.json()) as { id: string; name: string; userId: string };
    expect(created.name).toBe(`PT Baru ${runId}`);
    expect(created.userId).toBe(userId);

    const listRes = await testApp.handle(new Request("http://localhost/me/data-usaha", { headers: { cookie } }));
    const listBody = (await listRes.json()) as { dataUsaha: { id: string }[] };
    expect(listBody.dataUsaha.some((d) => d.id === created.id)).toBe(true);
  });

  test("422 kalau name kosong", async () => {
    await signUp(`me-data-usaha-empty-${runId}@test.local`);
    const cookie = await signIn(`me-data-usaha-empty-${runId}@test.local`);
    const res = await testApp.handle(
      new Request("http://localhost/me/data-usaha", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  // § Fase 110, architecture-user-tambahan.md — regression PENTING: member
  // PURE (tidak punya Data Usaha sendiri) WAJIB tetap lihat Data Usaha
  // tempat dia numpang (seat aktif) di gerbang "Pilih Data Usaha" —
  // TANPA ini, member terjebak (list kosong, tidak bisa masuk dashboard
  // yang seharusnya bisa dia akses).
  test("list mencakup Data Usaha tempat user cuma py seat AKTIF (bukan pemilik), ditandai isOwner:false", async () => {
    const ownerId = await signUp(`me-data-usaha-seatowner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Seat ${runId}`);
    const seatId = await createTestSeat(ownerId, dataUsahaId);

    const memberEmail = `me-data-usaha-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(new Request("http://localhost/me/data-usaha", { headers: { cookie: memberCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataUsaha: { id: string; isOwner: boolean }[] };
    const found = body.dataUsaha.find((d) => d.id === dataUsahaId);
    expect(found).toBeTruthy();
    expect(found!.isOwner).toBe(false);
  });

  test("list TIDAK mencakup Data Usaha tempat seat-nya BELUM/TIDAK aktif (available/invited)", async () => {
    const ownerId = await signUp(`me-data-usaha-inactive-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Inactive Seat ${runId}`);
    // § seat DIBUAT ("available", belum pernah di-invite ke siapa pun) —
    // user LAIN (belum diundang) TIDAK BOLEH kebocoran akses.
    await createTestSeat(ownerId, dataUsahaId);

    const memberEmail = `me-data-usaha-inactive-member-${runId}@test.local`;
    await signUp(memberEmail);
    const memberCookie = await signIn(memberEmail);

    const res = await testApp.handle(new Request("http://localhost/me/data-usaha", { headers: { cookie: memberCookie } }));
    const body = (await res.json()) as { dataUsaha: { id: string }[] };
    expect(body.dataUsaha.some((d) => d.id === dataUsahaId)).toBe(false);
  });
});

// § Fase 111, architecture-user-tambahan.md — inisiasi & batal transfer
// kepemilikan Data Usaha (self-service).
describe("POST /me/data-usaha/:id/transfer-ownership", () => {
  test("404 kalau Data Usaha bukan milik user", async () => {
    const ownerId = await signUp(`transfer-init-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Init ${runId}`);
    const attackerEmail = `transfer-init-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: attackerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: "target@test.local" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("400 CANNOT_TRANSFER_TO_SELF kalau toEmail = email sendiri", async () => {
    const ownerEmail = `transfer-init-self-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Self ${runId}`);

    const res = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: ownerEmail.toUpperCase() }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CANNOT_TRANSFER_TO_SELF");
  });

  test("200 — bikin baris ownership_transfers pending, lalu 409 kalau initiate lagi selagi masih pending", async () => {
    const ownerEmail = `transfer-init-ok-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer OK ${runId}`);

    const res = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: `transfer-init-target-${runId}@test.local` }),
      }),
    );
    expect(res.status).toBe(200);

    const [row] = await db.select().from(ownershipTransfers).where(eq(ownershipTransfers.dataUsahaId, dataUsahaId));
    expect(row!.status).toBe("pending");
    expect(row!.toEmail).toBe(`transfer-init-target-${runId}@test.local`);
    expect(row!.tokenHash).toBeTruthy();

    const secondRes = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: `transfer-init-other-${runId}@test.local` }),
      }),
    );
    expect(secondRes.status).toBe(409);
  });
});

describe("POST /me/data-usaha/:id/transfer-ownership/cancel", () => {
  test("200 — batal transfer pending, initiate baru sesudahnya berhasil lagi", async () => {
    const ownerEmail = `transfer-cancel-ok-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Cancel ${runId}`);

    await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: `transfer-cancel-target1-${runId}@test.local` }),
      }),
    );

    const cancelRes = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership/cancel`, {
        method: "POST",
        headers: { cookie: ownerCookie },
      }),
    );
    expect(cancelRes.status).toBe(200);

    const retryRes = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: `transfer-cancel-target2-${runId}@test.local` }),
      }),
    );
    expect(retryRes.status).toBe(200);

    const rows = await db.select().from(ownershipTransfers).where(eq(ownershipTransfers.dataUsahaId, dataUsahaId));
    expect(rows.find((r) => r.toEmail === `transfer-cancel-target1-${runId}@test.local`)?.status).toBe("cancelled");
    expect(rows.find((r) => r.toEmail === `transfer-cancel-target2-${runId}@test.local`)?.status).toBe("pending");
  });

  test("404 TRANSFER_NOT_FOUND kalau tidak ada transfer pending", async () => {
    const ownerEmail = `transfer-cancel-none-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Cancel None ${runId}`);

    const res = await testApp.handle(
      new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership/cancel`, {
        method: "POST",
        headers: { cookie: ownerCookie },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /me/stats", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/stats"));
    expect(res.status).toBe(401);
  });

  test("hitung total baris sukses lintas modul × setting admin, abaikan baris failed/cancelled dan batch user lain", async () => {
    await db
      .insert(settings)
      .values({ key: MANUAL_INPUT_SECONDS_SETTING_KEY, value: 45, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: 45 } });

    const userId = await signUp(`me-stats-owner-${runId}@test.local`);
    const cookie = await signIn(`me-stats-owner-${runId}@test.local`);
    const otherUserId = await signUp(`me-stats-other-${runId}@test.local`);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Me Stats Test Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice", "sales_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();

    // § 2 batch modul BEDA (purchase_invoice + sales_invoice) untuk
    // konfirmasi query ini GABUNGAN lintas modul, bukan 1 modul saja.
    const [batchPI] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: sub!.id, module: "purchase_invoice", fileName: "pi.xlsx", totalRows: 3, status: "completed" })
      .returning();
    const [batchSI] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: sub!.id, module: "sales_invoice", fileName: "si.xlsx", totalRows: 2, status: "completed" })
      .returning();

    await db.insert(importBatchRows).values([
      { batchId: batchPI!.id, rowNumber: 1, rawData: {}, status: "success" },
      { batchId: batchPI!.id, rowNumber: 2, rawData: {}, status: "success" },
      { batchId: batchPI!.id, rowNumber: 3, rawData: {}, status: "failed" }, // TIDAK dihitung
      { batchId: batchSI!.id, rowNumber: 1, rawData: {}, status: "success" },
      { batchId: batchSI!.id, rowNumber: 2, rawData: {}, status: "cancelled" }, // TIDAK dihitung (Batal Import)
    ]);

    // § batch milik user LAIN — TIDAK BOLEH ikut ke-hitung.
    const [otherPlan] = await db
      .insert(plans)
      .values({ name: `Me Stats Other Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const otherDataUsahaId = await createTestDataUsaha(otherUserId);
    const [otherSub] = await db
      .insert(subscriptions)
      .values({ userId: otherUserId, planId: otherPlan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId: otherDataUsahaId })
      .returning();
    const [otherBatch] = await db
      .insert(importBatches)
      .values({ userId: otherUserId, subscriptionId: otherSub!.id, module: "purchase_invoice", fileName: "other.xlsx", totalRows: 10, status: "completed" })
      .returning();
    await db.insert(importBatchRows).values([{ batchId: otherBatch!.id, rowNumber: 1, rawData: {}, status: "success" }]);

    const res = await testApp.handle(new Request("http://localhost/me/stats", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { successfulRowCount: number; estimatedTimeSavedSeconds: number };
    expect(body.successfulRowCount).toBe(3); // 2 (PI success) + 1 (SI success), TIDAK termasuk failed/cancelled/user lain
    expect(body.estimatedTimeSavedSeconds).toBe(3 * 45);
  });
});

describe("GET /me/import-batches", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/import-batches"));
    expect(res.status).toBe(401);
  });

  test("gabungan lintas modul, urut terbaru dulu, TIDAK termasuk batch user lain, `total` hitungan penuh", async () => {
    const userId = await signUp(`me-batches-owner-${runId}@test.local`);
    const cookie = await signIn(`me-batches-owner-${runId}@test.local`);
    const otherUserId = await signUp(`me-batches-other-${runId}@test.local`);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Me Batches Test Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice", "journal_voucher"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();

    // § 3 batch, modul BEDA (purchase_invoice + journal_voucher), untuk
    // konfirmasi endpoint ini GABUNGAN lintas modul, bukan 1 modul.
    for (const [module, fileName] of [
      ["purchase_invoice", "batch-1-pi.xlsx"],
      ["journal_voucher", "batch-2-jv.xlsx"],
      ["purchase_invoice", "batch-3-pi.xlsx"],
    ] as const) {
      await db.insert(importBatches).values({ userId, subscriptionId: sub!.id, module, fileName, totalRows: 1, status: "completed" });
    }

    const [otherPlan] = await db
      .insert(plans)
      .values({ name: `Me Batches Other Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const otherDataUsahaId = await createTestDataUsaha(otherUserId);
    const [otherSub] = await db
      .insert(subscriptions)
      .values({ userId: otherUserId, planId: otherPlan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId: otherDataUsahaId })
      .returning();
    await db.insert(importBatches).values({ userId: otherUserId, subscriptionId: otherSub!.id, module: "purchase_invoice", fileName: "punya-orang-lain.xlsx", totalRows: 1, status: "completed" });

    const res = await testApp.handle(new Request("http://localhost/me/import-batches?limit=2", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string; module: string }[]; total: number };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3-pi.xlsx", "batch-2-jv.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
    expect(body.total).toBe(3);
  });
});
