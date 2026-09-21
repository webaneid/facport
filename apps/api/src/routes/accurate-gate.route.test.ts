import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { accurateRoute } from "./accurate.route";
import { db } from "../lib/db";
import { dataUsaha, importBatches, importBatchRows, memberSeats, plans, subscriptions, user as userTable } from "../db/schema";
import { createTestAccurateConnection, createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { ALL_ACCURATE_SCOPES, scopesForModules } from "../lib/accurate-scopes";
import type { AccurateGate } from "../lib/accurate-gate";

// § Fase 144, architecture-accurate-connect-gate.md — mesin status koneksi per Data Usaha + confirm/reset database.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(accurateRoute);

async function newUser(tag: string) {
  const email = `gate144-${tag}-${runId}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Gate Test" }),
    }),
  );
  const userId = ((await res.json()) as { user: { id: string } }).user.id;
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, userId));
  const login = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return { userId, cookie: login.headers.get("set-cookie") ?? "" };
}

async function subscribe(userId: string, dataUsahaId: string, moduleKey: string, tag: string) {
  const [plan] = await db.insert(plans).values({ name: `Plan Gate ${tag} ${runId}`, price: 1, durationDays: 30, modules: [moduleKey] }).returning();
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 86_400_000), dataUsahaId })
    .returning();
  return sub!;
}

const gateOf = async (cookie: string, dataUsahaId: string) =>
  (await (await testApp.handle(new Request(`http://localhost/accurate/gate?dataUsahaId=${dataUsahaId}`, { headers: { cookie } }))).json()) as AccurateGate;
const postJson = (cookie: string, path: string, body: unknown) =>
  testApp.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("GET /accurate/gate — mesin status", () => {
  test("401 tanpa login; 422 tanpa dataUsahaId; 404 tanpa akses", async () => {
    expect((await testApp.handle(new Request("http://localhost/accurate/gate?dataUsahaId=00000000-0000-0000-0000-000000000000"))).status).toBe(401);
    const a = await newUser("auth-a");
    expect((await testApp.handle(new Request("http://localhost/accurate/gate", { headers: { cookie: a.cookie } }))).status).toBe(422);
    const b = await newUser("auth-b");
    const du = await createTestDataUsaha(a.userId);
    expect((await testApp.handle(new Request(`http://localhost/accurate/gate?dataUsahaId=${du}`, { headers: { cookie: b.cookie } }))).status).toBe(404);
  });

  test("Data Usaha BARU (belum beli apa pun) → not_connected, memerlukan Accurate, pemilik", async () => {
    const { userId, cookie } = await newUser("fresh");
    const du = await createTestDataUsaha(userId);
    expect(await gateOf(cookie, du)).toMatchObject({ state: "not_connected", migrated: false, requiresAccurate: true, isOwner: true, accounts: [] });
  });

  test("Data Usaha yang hanya memakai produk NON-Accurate → ok, requiresAccurate false (tidak ada gerbang)", async () => {
    const { userId, cookie } = await newUser("nonaccurate");
    const du = await createTestDataUsaha(userId);
    await subscribe(userId, du, "modul_non_accurate", "na");
    expect(await gateOf(cookie, du)).toMatchObject({ state: "ok", requiresAccurate: false });
  });

  test("not_connected varian `migrated`: database terakhir hasil backfill belum dikonfirmasi & tanpa koneksi", async () => {
    const { userId, cookie } = await newUser("migrated");
    const du = await createTestDataUsaha(userId);
    await db.update(dataUsaha).set({ accurateDbId: "9", accurateDbAlias: "PT Lama" }).where(eq(dataUsaha.id, du));
    await subscribe(userId, du, "purchase_invoice", "mig");
    expect(await gateOf(cookie, du)).toMatchObject({ state: "not_connected", migrated: true, lastKnownDbAlias: "PT Lama" });
  });

  test("terputus SETELAH dikonfirmasi (admin/transfer) → not_connected TANPA migrated, tetap menyebut database terakhir", async () => {
    const { userId, cookie } = await newUser("disconnected");
    const du = await createTestDataUsaha(userId);
    await db.update(dataUsaha).set({ accurateDbId: "9", accurateDbAlias: "PT Lama", accurateDbConfirmedAt: new Date() }).where(eq(dataUsaha.id, du));
    expect(await gateOf(cookie, du)).toMatchObject({ state: "not_connected", migrated: false, lastKnownDbAlias: "PT Lama" });
  });

  test("koneksi LAMA (tanpa accurate_user_id) dianggap belum terhubung", async () => {
    const { userId, cookie } = await newUser("legacy");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateUserId: null });
    expect((await gateOf(cookie, du)).state).toBe("not_connected");
  });

  test("not_connected menyertakan `accounts` milik pemilik (untuk 'pakai akun yang sama'), bukan milik orang lain", async () => {
    const me = await newUser("accounts-me");
    const other = await newUser("accounts-other");
    const du = await createTestDataUsaha(me.userId);
    const mine = await createTestAccurateConnection(me.userId, { accurateUserEmail: "saya@accurate.test" });
    await createTestAccurateConnection(other.userId, { accurateUserEmail: "lain@accurate.test" });
    expect((await gateOf(me.cookie, du)).accounts).toEqual([{ id: mine.id, accountEmail: "saya@accurate.test" }]);
  });

  test("reconnect: koneksi expired; importRunning true bila ada batch berjalan", async () => {
    const { userId, cookie } = await newUser("reconnect");
    const du = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: du, status: "expired", accurateDbId: "1", accurateDbAlias: "PT 1" });
    const sub = await subscribe(userId, du, "purchase_invoice", "rec");
    expect(await gateOf(cookie, du)).toMatchObject({ state: "reconnect", importRunning: false });
    await db.insert(importBatches).values({ userId, subscriptionId: sub.id, module: "purchase_invoice", fileName: "x.xlsx", totalRows: 1, status: "processing" });
    expect(await gateOf(cookie, du)).toMatchObject({ state: "reconnect", importRunning: true });
    void conn;
  });

  test("update_permissions HANYA untuk fitur yang DIBELI; menyebut nama fitur; catalogMissingScopes informatif", async () => {
    const { userId, cookie } = await newUser("perms");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "1", accurateDbAlias: "PT 1", grantedScopes: scopesForModules(["purchase_invoice"]) });
    await subscribe(userId, du, "purchase_invoice", "perms-pi");
    // beli hanya PI, izin PI lengkap → tidak dinag soal fitur lain
    const before = await gateOf(cookie, du);
    expect(before.state).toBe("ok");
    expect(before.missingScopes).toEqual([]);
    expect(before.catalogMissingScopes).toContain("sales_invoice_save");
    // beli fitur BARU (Sales Invoice) → butuh izin baru
    await subscribe(userId, du, "sales_invoice", "perms-si");
    const after = await gateOf(cookie, du);
    expect(after.state).toBe("update_permissions");
    expect(after.missingModules).toEqual([{ key: "sales_invoice", label: "Sales Invoice" }]);
    expect(after.missingScopes).toContain("sales_invoice_save");
  });

  test("select_database: koneksi aktif berizin lengkap tanpa database", async () => {
    const { userId, cookie } = await newUser("selectdb");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, grantedScopes: ALL_ACCURATE_SCOPES, accurateUserEmail: "pemilik@accurate.test" });
    await subscribe(userId, du, "purchase_invoice", "sel");
    expect(await gateOf(cookie, du)).toMatchObject({ state: "select_database", accountEmail: "pemilik@accurate.test" });
  });

  test("confirm_database lalu ok setelah dikonfirmasi", async () => {
    const { userId, cookie } = await newUser("confirm");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "5", accurateDbAlias: "PT 5", grantedScopes: ALL_ACCURATE_SCOPES, dbConfirmed: false });
    await subscribe(userId, du, "purchase_invoice", "conf");
    expect(await gateOf(cookie, du)).toMatchObject({ state: "confirm_database", accurateDbAlias: "PT 5" });
    expect((await postJson(cookie, "/accurate/databases/confirm", { dataUsahaId: du })).status).toBe(200);
    expect((await gateOf(cookie, du)).state).toBe("ok");
  });

  test("prioritas: reconnect > select_database; update_permissions > select_database", async () => {
    const a = await newUser("prio-a");
    const duA = await createTestDataUsaha(a.userId);
    await createTestAccurateConnection(a.userId, { dataUsahaId: duA, status: "expired", grantedScopes: ALL_ACCURATE_SCOPES });
    expect((await gateOf(a.cookie, duA)).state).toBe("reconnect");

    const b = await newUser("prio-b");
    const duB = await createTestDataUsaha(b.userId);
    await createTestAccurateConnection(b.userId, { dataUsahaId: duB, grantedScopes: scopesForModules(["purchase_invoice"]) });
    await subscribe(b.userId, duB, "sales_invoice", "prio");
    expect((await gateOf(b.cookie, duB)).state).toBe("update_permissions"); // tanpa database, tapi izin dulu
  });

  test("ok: koneksi aktif + izin lengkap + database dikonfirmasi", async () => {
    const { userId, cookie } = await newUser("ok");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "1", accurateDbAlias: "PT 1", grantedScopes: ALL_ACCURATE_SCOPES });
    await subscribe(userId, du, "purchase_invoice", "ok");
    expect(await gateOf(cookie, du)).toMatchObject({ state: "ok", accurateDbAlias: "PT 1", importRunning: false, catalogMissingScopes: [] });
  });

  test("scope belum diketahui (baris tanpa granted_scopes & Accurate tak terjangkau) → TIDAK menuduh update_permissions", async () => {
    const { userId, cookie } = await newUser("unknown-scope");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "1", accurateDbAlias: "PT 1", grantedScopes: null });
    await subscribe(userId, du, "sales_invoice", "unk");
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 })) as unknown as typeof fetch;
    try {
      expect((await gateOf(cookie, du)).state).toBe("ok");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("member seat: melihat status, TANPA accountEmail & accounts, isOwner false", async () => {
    const owner = await newUser("member-owner");
    const member = await newUser("member-member");
    const du = await createTestDataUsaha(owner.userId);
    await createTestAccurateConnection(owner.userId, { dataUsahaId: du, status: "expired", accurateUserEmail: "rahasia@accurate.test" });
    await createTestAccurateConnection(owner.userId, { accurateUserEmail: "akun-lain@accurate.test" });
    await subscribe(owner.userId, du, "purchase_invoice", "mem");
    const seatId = await createTestSeat(owner.userId, du);
    await db.update(memberSeats).set({ memberUserId: member.userId, status: "active" }).where(eq(memberSeats.id, seatId));

    const asMember = await gateOf(member.cookie, du);
    expect(asMember).toMatchObject({ state: "reconnect", isOwner: false, accountEmail: null, accounts: [] });
    expect(JSON.stringify(asMember)).not.toContain("rahasia@accurate.test");
    const asOwner = await gateOf(owner.cookie, du);
    expect(asOwner).toMatchObject({ isOwner: true, accountEmail: "rahasia@accurate.test" });
    expect(asOwner.accounts.length).toBeGreaterThan(0);
  });
});

describe("POST /accurate/databases/confirm & /reset", () => {
  test("confirm: owner-only; 400 NOT_CONNECTED / DATABASE_NOT_SELECTED", async () => {
    const owner = await newUser("cf-owner");
    const intruder = await newUser("cf-intruder");
    const du = await createTestDataUsaha(owner.userId);
    expect((await postJson(intruder.cookie, "/accurate/databases/confirm", { dataUsahaId: du })).status).toBe(404);
    expect(((await (await postJson(owner.cookie, "/accurate/databases/confirm", { dataUsahaId: du })).json()) as { code: string }).code).toBe("NOT_CONNECTED");
    await createTestAccurateConnection(owner.userId, { dataUsahaId: du });
    expect(((await (await postJson(owner.cookie, "/accurate/databases/confirm", { dataUsahaId: du })).json()) as { code: string }).code).toBe("DATABASE_NOT_SELECTED");
  });

  test("reset: mengosongkan database (& konfirmasi) bila BELUM ada riwayat import sukses", async () => {
    const { userId, cookie } = await newUser("reset-ok");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "7", accurateDbAlias: "PT 7" });
    const res = await postJson(cookie, "/accurate/databases/reset", { dataUsahaId: du });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null });
    expect(row!.accurateConnectionId).not.toBeNull(); // koneksi tetap; tinggal pilih database lagi
  });

  test("reset: 409 DATABASE_HAS_IMPORT_HISTORY bila ada baris import sukses; database tidak berubah", async () => {
    const { userId, cookie } = await newUser("reset-history");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "7", accurateDbAlias: "PT 7" });
    const sub = await subscribe(userId, du, "purchase_invoice", "hist");
    const [batch] = await db.insert(importBatches).values({ userId, subscriptionId: sub.id, module: "purchase_invoice", fileName: "x.xlsx", totalRows: 1, status: "completed" }).returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success" });
    const res = await postJson(cookie, "/accurate/databases/reset", { dataUsahaId: du });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("DATABASE_HAS_IMPORT_HISTORY");
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateDbId).toBe("7");
  });

  test("reset: baris import GAGAL saja tidak menghalangi; bukan pemilik → 404", async () => {
    const owner = await newUser("reset-failed");
    const intruder = await newUser("reset-intruder");
    const du = await createTestDataUsaha(owner.userId);
    await createTestAccurateConnection(owner.userId, { dataUsahaId: du, accurateDbId: "7", accurateDbAlias: "PT 7" });
    const sub = await subscribe(owner.userId, du, "purchase_invoice", "failed");
    const [batch] = await db.insert(importBatches).values({ userId: owner.userId, subscriptionId: sub.id, module: "purchase_invoice", fileName: "x.xlsx", totalRows: 1, status: "failed" }).returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed" });
    expect((await postJson(intruder.cookie, "/accurate/databases/reset", { dataUsahaId: du })).status).toBe(404);
    expect((await postJson(owner.cookie, "/accurate/databases/reset", { dataUsahaId: du })).status).toBe(200);
  });
});
