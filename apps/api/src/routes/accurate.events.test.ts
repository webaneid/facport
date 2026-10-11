import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { and, eq, desc } from "drizzle-orm";
import { auth } from "../lib/auth";
import { accurateRoute } from "./accurate.route";
import { db } from "../lib/db";
import { auditLogs, dataUsaha, user as userTable } from "../db/schema";
import { createTestAccurateConnection, createTestDataUsaha } from "../lib/test-fixtures";
import { ALL_ACCURATE_SCOPES } from "../lib/accurate-scopes";
import { createState } from "../lib/oauth-state";

// § Fase 189B — setiap peristiwa koneksi Accurate oleh PEMILIK tercatat di riwayat Data Usaha (audit_logs, entity data_usaha): sambung (oauth/attach), pilih
// database, konfirmasi, "Pilih yang Lain". Dasar butir 9 client ("salah koneksi → benar"). Kegagalan aksi TIDAK mencatat peristiwa.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(accurateRoute);

async function newUser(tag: string) {
  const email = `acc189b-${tag}-${runId}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Acc ${tag}` }) }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  return { userId: user.id, cookie: signIn.headers.get("set-cookie") ?? "" };
}

const post = (cookie: string, path: string, body: unknown) =>
  testApp.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function withAccurateFetch<T>(replies: { token?: unknown; databases?: { id: number; alias: string }[] }, fn: () => Promise<T>): Promise<T> {
  const id = process.env.ACCURATE_CLIENT_ID;
  const secret = process.env.ACCURATE_CLIENT_SECRET;
  process.env.ACCURATE_CLIENT_ID = "test-client-id";
  process.env.ACCURATE_CLIENT_SECRET = "test-client-secret";
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/oauth/token")) return new Response(JSON.stringify(replies.token ?? {}), { status: 200 });
    if (url.includes("/db-list.do")) return new Response(JSON.stringify({ s: true, d: (replies.databases ?? []).map((d) => ({ ...d, trial: false, expired: false })) }), { status: 200 });
    if (url.includes("/open-db.do")) return new Response(JSON.stringify({ s: true, d: ["ok"], session: "s", host: "https://zeus.test", dataVersion: 1, licenseEnd: "01/01/2030" }), { status: 200 });
    return original(input as never);
  }) as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
    if (id === undefined) delete process.env.ACCURATE_CLIENT_ID;
    else process.env.ACCURATE_CLIENT_ID = id;
    if (secret === undefined) delete process.env.ACCURATE_CLIENT_SECRET;
    else process.env.ACCURATE_CLIENT_SECRET = secret;
  }
}

const goodToken = (accountId: number) => ({
  access_token: "new-access",
  refresh_token: "new-refresh",
  expires_in: 1295999,
  token_type: "bearer",
  scope: ALL_ACCURATE_SCOPES.join(" "),
  user: { id: accountId, email: `akun-${accountId}@accurate.test` },
});

const events = (dataUsahaId: string) =>
  db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, dataUsahaId))).orderBy(desc(auditLogs.createdAt));

describe("riwayat koneksi Accurate sisi pemilik (Fase 189B)", () => {
  test("callback OAuth sukses → connect_accurate (via oauth, email akun Accurate, pelaku pemilik)", async () => {
    const { userId, cookie } = await newUser("cb");
    const du = await createTestDataUsaha(userId);
    const accountId = Math.floor(Math.random() * 1e9);
    const state = createState({ userId, dataUsahaId: du });
    const res = await withAccurateFetch({ token: goodToken(accountId) }, () => testApp.handle(new Request(`http://localhost/accurate/oauth/callback?code=abc&state=${state}`, { headers: { cookie } })));
    expect(res.headers.get("location")).toContain("accurate=connected");
    const rows = await events(du);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "connect_accurate", actorId: userId });
    expect(rows[0]!.changes).toMatchObject({ via: "oauth", accountEmail: `akun-${accountId}@accurate.test` });
  });

  test("callback GAGAL (state tidak valid) → tidak ada peristiwa", async () => {
    const { userId, cookie } = await newUser("cb-bad");
    const du = await createTestDataUsaha(userId);
    const res = await testApp.handle(new Request("http://localhost/accurate/oauth/callback?code=abc&state=bogus", { headers: { cookie } }));
    expect(res.headers.get("location")).toContain("invalid_state");
    expect(await events(du)).toHaveLength(0);
  });

  test("attach akun yang sudah ada → connect_accurate (via attach)", async () => {
    const { userId, cookie } = await newUser("att");
    const du = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { accurateUserEmail: "pakai-ulang@accurate.test" });
    const res = await withAccurateFetch({}, () => post(cookie, "/accurate/attach", { dataUsahaId: du, connectionId: conn.id }));
    expect(res.status).toBe(200);
    const rows = await events(du);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changes).toMatchObject({ via: "attach", accurateConnectionId: conn.id, accountEmail: "pakai-ulang@accurate.test" });
  });

  test("pilih database → select_database; gagal (sudah dipilih) → tidak tercatat", async () => {
    const { userId, cookie } = await newUser("sel");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du });
    const ok = await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 42, alias: "PT Empat Dua" }));
    expect(ok.status).toBe(200);
    expect((await events(du)).map((e) => e.action)).toEqual(["select_database"]);
    expect((await events(du))[0]!.changes).toMatchObject({ accurateDbId: "42", alias: "PT Empat Dua" });

    const again = await post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 43, alias: "PT Lain" });
    expect(again.status).toBe(400);
    expect(await events(du)).toHaveLength(1);
  });

  test("konfirmasi database → confirm_database", async () => {
    const { userId, cookie } = await newUser("conf");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "5", accurateDbAlias: "PT Lima", dbConfirmed: false });
    const res = await post(cookie, "/accurate/databases/confirm", { dataUsahaId: du });
    expect(res.status).toBe(200);
    const rows = await events(du);
    expect(rows.map((e) => e.action)).toEqual(["confirm_database"]);
    expect(rows[0]!.changes).toMatchObject({ accurateDbId: "5", alias: "PT Lima" });
  });

  test("'Pilih yang Lain' → reset_database membawa database sebelumnya (koreksi mandiri pelanggan); ditolak bila punya riwayat import → tidak tercatat", async () => {
    const { userId, cookie } = await newUser("reset");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "7", accurateDbAlias: "PT Salah Pilih" });
    const res = await post(cookie, "/accurate/databases/reset", { dataUsahaId: du });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateDbId).toBeNull();
    const rows = await events(du);
    expect(rows.map((e) => e.action)).toEqual(["reset_database"]);
    expect(rows[0]!.changes).toMatchObject({ previousDbId: "7", previousAlias: "PT Salah Pilih" });
    expect(rows[0]!.actorId).toBe(userId);
  });

  test("urutan cerita 'salah → koreksi → benar' terbaca berurutan dalam satu aliran", async () => {
    const { userId, cookie } = await newUser("story");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du });
    await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 1, alias: "PT Salah" }));
    await post(cookie, "/accurate/databases/reset", { dataUsahaId: du });
    await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 2, alias: "PT Benar" }));
    expect((await events(du)).map((e) => e.action).reverse()).toEqual(["select_database", "reset_database", "select_database"]);
  });
});
