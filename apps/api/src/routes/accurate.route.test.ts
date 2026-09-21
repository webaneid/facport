import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "../lib/auth";
import { accurateRoute } from "./accurate.route";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { plans, subscriptions, accurateConnections, memberSeats, dataUsaha, user as userTable } from "../db/schema";
import { decrypt } from "../lib/encryption";
import { createTestAccurateConnection, createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { ALL_ACCURATE_SCOPES, scopesForModules } from "../lib/accurate-scopes";
import { createState } from "../lib/oauth-state";

// § Fase 143, ADR-0036/ADR-0037 — MODEL KONEKSI BARU: 1 koneksi = 1 akun Accurate (kunci `accurate_user_id`),
// dipegang Data Usaha (pointer + database). Menggantikan tes model per-subscription/`reuse` (Fase 14-142).
// `accurate_user_id` UNIK global → fixture `createTestAccurateConnection` membuat id acak per koneksi.
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

async function newUser(tag: string) {
  const email = `acc143-${tag}-${runId}@test.local`;
  const userId = await signUp(email);
  const cookie = await signIn(email);
  return { userId, cookie, email };
}

async function newSubscription(userId: string, dataUsahaId: string, moduleKey: string, tag: string, status = "active") {
  const [plan] = await db
    .insert(plans)
    .values({ name: `Plan 143 ${tag} ${runId}`, price: 1000, durationDays: 30, modules: [moduleKey] })
    .returning();
  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status, startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
    .returning();
  return { plan: plan!, subscription: subscription! };
}

function post(cookie: string, path: string, body: unknown) {
  return testApp.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function get(cookie: string, path: string) {
  return testApp.handle(new Request(`http://localhost${path}`, { headers: { cookie } }));
}

// Isi kredensial Accurate sementara (dev .env bisa berisi kredensial asli / kosong) lalu pulihkan.
async function withAccurateEnv<T>(fn: () => Promise<T>): Promise<T> {
  const id = process.env.ACCURATE_CLIENT_ID;
  const secret = process.env.ACCURATE_CLIENT_SECRET;
  process.env.ACCURATE_CLIENT_ID = "test-client-id";
  process.env.ACCURATE_CLIENT_SECRET = "test-client-secret";
  try {
    return await fn();
  } finally {
    if (id === undefined) delete process.env.ACCURATE_CLIENT_ID;
    else process.env.ACCURATE_CLIENT_ID = id;
    if (secret === undefined) delete process.env.ACCURATE_CLIENT_SECRET;
    else process.env.ACCURATE_CLIENT_SECRET = secret;
  }
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; user?: { id?: number; email?: string } };
// Mock fetch ke Accurate berdasarkan URL: token endpoint, db-list.do, open-db.do.
async function withAccurateFetch<T>(
  replies: { token?: TokenReply; databases?: { id: number; alias: string }[]; openDbOk?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/oauth/token")) return new Response(JSON.stringify(replies.token ?? {}), { status: 200 });
    if (url.includes("/db-list.do")) return new Response(JSON.stringify({ s: true, d: (replies.databases ?? []).map((d) => ({ ...d, trial: false, expired: false })) }), { status: 200 });
    if (url.includes("/open-db.do")) {
      return replies.openDbOk === false
        ? new Response(JSON.stringify({ s: false, d: ["Gagal"] }), { status: 500 })
        : new Response(JSON.stringify({ s: true, d: ["ok"], session: "s", host: "https://zeus.test", dataVersion: 1, licenseEnd: "01/01/2030" }), { status: 200 });
    }
    return original(input as never);
  }) as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const goodToken = (userId: number, scope = ALL_ACCURATE_SCOPES.join(" ")): TokenReply => ({
  access_token: "new-access",
  refresh_token: "new-refresh",
  expires_in: 1295999,
  token_type: "bearer",
  scope,
  user: { id: userId, email: `akun-${userId}@accurate.test` },
});

// Callback KINI wajib membawa cookie sesi pemulai flow (§ security review Fase 143, HIGH: login CSRF/account-linking).
async function callback(dataUsahaId: string, userId: string, cookie: string) {
  const state = createState({ userId, dataUsahaId });
  const res = await testApp.handle(new Request(`http://localhost/accurate/oauth/callback?code=abc&state=${state}`, { headers: { cookie } }));
  return res.headers.get("location") ?? "";
}

describe("POST /accurate/connect", () => {
  test("401 kalau tidak login", async () => {
    const res = await post("", "/accurate/connect", { dataUsahaId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(401);
  });

  test("404 DATA_USAHA_NOT_FOUND untuk Data Usaha milik user LAIN (tidak bisa menghubungkan perusahaan orang)", async () => {
    const owner = await newUser("conn-idor-owner");
    const intruder = await newUser("conn-idor-intruder");
    const dataUsahaId = await createTestDataUsaha(owner.userId);
    const res = await post(intruder.cookie, "/accurate/connect", { dataUsahaId });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_NOT_FOUND");
  });

  test("503 ACCURATE_NOT_CONFIGURED kalau ACCURATE_CLIENT_ID kosong", async () => {
    const { userId, cookie } = await newUser("conn-503");
    const dataUsahaId = await createTestDataUsaha(userId);
    const original = process.env.ACCURATE_CLIENT_ID;
    delete process.env.ACCURATE_CLIENT_ID;
    try {
      const res = await post(cookie, "/accurate/connect", { dataUsahaId });
      expect(res.status).toBe(503);
      expect(((await res.json()) as { code: string }).code).toBe("ACCURATE_NOT_CONFIGURED");
    } finally {
      if (original !== undefined) process.env.ACCURATE_CLIENT_ID = original;
    }
  });

  test("200 authorizeUrl meminta SEMUA scope katalog (ADR-0036 #2), walau Data Usaha hanya membeli 1 modul", async () => {
    const { userId, cookie } = await newUser("conn-200");
    const dataUsahaId = await createTestDataUsaha(userId);
    await newSubscription(userId, dataUsahaId, "receive_item", "conn-200");
    await withAccurateEnv(async () => {
      const res = await post(cookie, "/accurate/connect", { dataUsahaId });
      expect(res.status).toBe(200);
      const { authorizeUrl } = (await res.json()) as { authorizeUrl: string };
      const requested = new URL(authorizeUrl).searchParams.get("scope")!.split(" ");
      expect(new Set(requested)).toEqual(new Set(ALL_ACCURATE_SCOPES));
      expect(requested.length).toBeGreaterThan(scopesForModules(["receive_item"]).length);
    });
  });

  test("409 ALREADY_CONNECTED kalau Data Usaha sudah punya koneksi; reconnect:true melewatinya", async () => {
    const { userId, cookie } = await newUser("conn-409");
    const dataUsahaId = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId });
    await withAccurateEnv(async () => {
      const blocked = await post(cookie, "/accurate/connect", { dataUsahaId });
      expect(blocked.status).toBe(409);
      expect(((await blocked.json()) as { code: string }).code).toBe("ALREADY_CONNECTED");
      const allowed = await post(cookie, "/accurate/connect", { dataUsahaId, reconnect: true });
      expect(allowed.status).toBe(200);
    });
  });

  test("koneksi LAMA (tanpa accurate_user_id) tidak dihitung terhubung — cutover, connect tidak diblokir 409", async () => {
    const { userId, cookie } = await newUser("conn-legacy");
    const dataUsahaId = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId, accurateUserId: null });
    await withAccurateEnv(async () => {
      expect((await post(cookie, "/accurate/connect", { dataUsahaId })).status).toBe(200);
    });
  });

  test("member seat TIDAK bisa connect (owner-only, regresi Fase 110)", async () => {
    const primary = await newUser("conn-mem-primary");
    const member = await newUser("conn-mem-member");
    const dataUsahaId = await createTestDataUsaha(primary.userId);
    const { subscription } = await newSubscription(primary.userId, dataUsahaId, "purchase_invoice", "conn-mem");
    const seatId = await createTestSeat(primary.userId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: member.userId, status: "active" }).where(eq(memberSeats.id, seatId));

    const list = (await (await get(member.cookie, "/accurate/subscriptions")).json()) as { subscriptions: { subscriptionId: string }[] };
    expect(list.subscriptions.some((s) => s.subscriptionId === subscription.id)).toBe(true); // baca-saja boleh
    expect((await post(member.cookie, "/accurate/connect", { dataUsahaId })).status).toBe(404);
  });
});

describe("POST /accurate/reuse — DIHAPUS (Fase 143)", () => {
  test("404: berbagi koneksi kini otomatis per akun Accurate, tidak ada endpoint reuse lagi", async () => {
    const { cookie } = await newUser("reuse-gone");
    const res = await post(cookie, "/accurate/reuse", { subscriptionId: "00000000-0000-0000-0000-000000000000", connectionId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });
});

describe("GET /accurate/subscriptions (status diturunkan dari Data Usaha)", () => {
  test("connected:true HANYA kalau koneksi Data Usaha berstatus active; database dari Data Usaha", async () => {
    const { userId, cookie } = await newUser("subs-status");
    const duHealthy = await createTestDataUsaha(userId, "Sehat");
    const duBroken = await createTestDataUsaha(userId, "Bermasalah");
    await createTestAccurateConnection(userId, { dataUsahaId: duHealthy, accurateDbId: "111", accurateDbAlias: "PT Sehat" });
    await createTestAccurateConnection(userId, { dataUsahaId: duBroken, accurateDbId: "222", accurateDbAlias: "PT Bermasalah", status: "expired" });
    await newSubscription(userId, duHealthy, "purchase_invoice", "subs-h");
    await newSubscription(userId, duBroken, "sales_invoice", "subs-b");

    const body = (await (await get(cookie, "/accurate/subscriptions")).json()) as {
      subscriptions: { planName: string; connected: boolean; connectionStatus: string | null; accurateDbAlias: string | null; accurateDbId: string | null }[];
    };
    const healthy = body.subscriptions.find((s) => s.planName === `Plan 143 subs-h ${runId}`);
    const broken = body.subscriptions.find((s) => s.planName === `Plan 143 subs-b ${runId}`);
    expect(healthy).toMatchObject({ connected: true, connectionStatus: "active", accurateDbAlias: "PT Sehat", accurateDbId: "111" });
    expect(broken).toMatchObject({ connected: false, connectionStatus: "expired", accurateDbAlias: "PT Bermasalah" });
  });

  test("semua modul di 1 Data Usaha menampilkan koneksi & database yang SAMA", async () => {
    const { userId, cookie } = await newUser("subs-shared");
    const du = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "5", accurateDbAlias: "PT Bersama" });
    await newSubscription(userId, du, "purchase_invoice", "subs-s1");
    await newSubscription(userId, du, "sales_invoice", "subs-s2");
    const body = (await (await get(cookie, `/accurate/subscriptions?dataUsahaId=${du}`)).json()) as { subscriptions: { accurateConnectionId: string | null; accurateDbAlias: string | null }[] };
    expect(body.subscriptions).toHaveLength(2);
    for (const s of body.subscriptions) expect(s).toMatchObject({ accurateConnectionId: conn.id, accurateDbAlias: "PT Bersama" });
  });

  test("koneksi LAMA (accurate_user_id NULL) dilaporkan belum terhubung (cutover)", async () => {
    const { userId, cookie } = await newUser("subs-legacy");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateUserId: null });
    await newSubscription(userId, du, "purchase_invoice", "subs-l");
    const body = (await (await get(cookie, "/accurate/subscriptions")).json()) as { subscriptions: { connected: boolean; connectionStatus: string | null }[] };
    expect(body.subscriptions[0]).toMatchObject({ connected: false, connectionStatus: null });
  });

  test("missingScopes: null (scope belum diketahui), daftar (kurang), [] (lengkap)", async () => {
    const { userId, cookie } = await newUser("subs-scopes");
    const duUnknown = await createTestDataUsaha(userId, "U");
    const duShort = await createTestDataUsaha(userId, "S");
    const duFull = await createTestDataUsaha(userId, "F");
    await createTestAccurateConnection(userId, { dataUsahaId: duUnknown, grantedScopes: null });
    await createTestAccurateConnection(userId, { dataUsahaId: duShort, grantedScopes: scopesForModules(["purchase_invoice"]) });
    await createTestAccurateConnection(userId, { dataUsahaId: duFull, grantedScopes: ALL_ACCURATE_SCOPES });
    await newSubscription(userId, duUnknown, "sales_invoice", "sc-u");
    await newSubscription(userId, duShort, "sales_invoice", "sc-s");
    await newSubscription(userId, duFull, "sales_invoice", "sc-f");
    const body = (await (await get(cookie, "/accurate/subscriptions")).json()) as { subscriptions: { planName: string; missingScopes: string[] | null }[] };
    const by = (tag: string) => body.subscriptions.find((s) => s.planName === `Plan 143 ${tag} ${runId}`)!.missingScopes;
    expect(by("sc-u")).toBeNull();
    expect(by("sc-s")).toContain("sales_invoice_save");
    expect(by("sc-f")).toEqual([]);
  });

  test("dataUsahaId mempersempit ke 1 Data Usaha", async () => {
    const { userId, cookie } = await newUser("subs-narrow");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    await newSubscription(userId, duA, "purchase_invoice", "nr-a");
    await newSubscription(userId, duB, "sales_invoice", "nr-b");
    const body = (await (await get(cookie, `/accurate/subscriptions?dataUsahaId=${duA}`)).json()) as { subscriptions: { planName: string }[] };
    expect(body.subscriptions.map((s) => s.planName)).toEqual([`Plan 143 nr-a ${runId}`]);
  });
});

describe("GET /accurate/connections", () => {
  test("401 kalau tidak login; 422 kalau dataUsahaId tidak dikirim", async () => {
    expect((await get("", "/accurate/connections?dataUsahaId=00000000-0000-0000-0000-000000000000")).status).toBe(401);
    const { cookie } = await newUser("cons-422");
    expect((await get(cookie, "/accurate/connections")).status).toBe(422);
  });

  test("hanya koneksi milik Data Usaha yang diminta, dengan database dari Data Usaha", async () => {
    const { userId, cookie } = await newUser("cons-ok");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    const connA = await createTestAccurateConnection(userId, { dataUsahaId: duA, accurateDbId: "1", accurateDbAlias: "PT A" });
    await createTestAccurateConnection(userId, { dataUsahaId: duB, accurateDbId: "2", accurateDbAlias: "PT B" });
    const body = (await (await get(cookie, `/accurate/connections?dataUsahaId=${duA}`)).json()) as { connections: { id: string; accurateDbId: string | null; accurateDbAlias: string | null }[] };
    expect(body.connections).toEqual([{ id: connA.id, accurateDbId: "1", accurateDbAlias: "PT A" }]);
  });

  test("kosong untuk koneksi expired atau LAMA (tanpa accurate_user_id)", async () => {
    const { userId, cookie } = await newUser("cons-empty");
    const duExpired = await createTestDataUsaha(userId, "E");
    const duLegacy = await createTestDataUsaha(userId, "L");
    await createTestAccurateConnection(userId, { dataUsahaId: duExpired, status: "expired" });
    await createTestAccurateConnection(userId, { dataUsahaId: duLegacy, accurateUserId: null });
    for (const du of [duExpired, duLegacy]) {
      const body = (await (await get(cookie, `/accurate/connections?dataUsahaId=${du}`)).json()) as { connections: unknown[] };
      expect(body.connections).toEqual([]);
    }
  });

  test("404 kalau user tidak punya akses Data Usaha itu (mantan pemilik pasca-transfer)", async () => {
    const owner = await newUser("cons-owner");
    const other = await newUser("cons-other");
    const du = await createTestDataUsaha(owner.userId);
    await createTestAccurateConnection(owner.userId, { dataUsahaId: du });
    expect((await get(other.cookie, `/accurate/connections?dataUsahaId=${du}`)).status).toBe(404);
  });
});

describe("GET /accurate/oauth/callback — upsert per akun Accurate", () => {
  test("redirect error=invalid_state kalau state tidak ada/salah/dipakai ulang", async () => {
    const res = await testApp.handle(new Request("http://localhost/accurate/oauth/callback?code=abc&state=bogus"));
    expect(res.headers.get("location")).toContain("accurate_error=invalid_state");
  });

  test("berhasil: baris koneksi baru berisi akun+scope; Data Usaha menunjuk koneksi itu", async () => {
    const { userId, cookie } = await newUser("cb-ok");
    const du = await createTestDataUsaha(userId);
    const accountId = Math.floor(Math.random() * 1e9);
    const location = await withAccurateEnv(() =>
      withAccurateFetch({ token: goodToken(accountId, "item_view receive_item_save") }, () => callback(du, userId, cookie)),
    );
    expect(location).toContain("accurate=connected");
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    const [conn] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, row!.accurateConnectionId!));
    expect(conn).toMatchObject({ userId, accurateUserId: String(accountId), accurateUserEmail: `akun-${accountId}@accurate.test`, status: "active" });
    expect(conn!.grantedScopes).toEqual(["item_view", "receive_item_save"]);
    expect(decrypt(conn!.accessTokenEncrypted)).toBe("new-access");
  });

  test("akun SAMA dihubungkan ke 2 Data Usaha → tetap 1 baris koneksi, keduanya menunjuknya (tidak ada INSERT kedua)", async () => {
    const { userId, cookie } = await newUser("cb-shared");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    const accountId = Math.floor(Math.random() * 1e9);
    await withAccurateEnv(() =>
      withAccurateFetch({ token: goodToken(accountId) }, async () => {
        await callback(duA, userId, cookie);
        await callback(duB, userId, cookie);
      }),
    );
    const conns = await db.select().from(accurateConnections).where(eq(accurateConnections.accurateUserId, String(accountId)));
    expect(conns).toHaveLength(1);
    const rows = await db.select().from(dataUsaha).where(eq(dataUsaha.userId, userId));
    expect(new Set(rows.map((r) => r.accurateConnectionId))).toEqual(new Set([conns[0]!.id]));
  });

  test("otorisasi ulang akun yang sama memperbarui token & mengaktifkan kembali koneksi expired (in-place)", async () => {
    const { userId, cookie } = await newUser("cb-reauth");
    const du = await createTestDataUsaha(userId);
    const accountId = String(Math.floor(Math.random() * 1e9));
    const old = await createTestAccurateConnection(userId, { dataUsahaId: du, status: "expired", accurateUserId: accountId });
    await withAccurateEnv(() => withAccurateFetch({ token: goodToken(Number(accountId)) }, () => callback(du, userId, cookie)));
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, old.id));
    expect(after!.status).toBe("active");
    expect(decrypt(after!.accessTokenEncrypted)).toBe("new-access");
    expect(await db.select().from(accurateConnections).where(eq(accurateConnections.accurateUserId, accountId))).toHaveLength(1);
  });

  test("akun Accurate milik pemilik Facport LAIN → ditolak (accurate_account_in_use), koneksi pemilik lama tidak tersentuh", async () => {
    const a = await newUser("cb-own-a");
    const b = await newUser("cb-own-b");
    const duA = await createTestDataUsaha(a.userId);
    const duB = await createTestDataUsaha(b.userId);
    const accountId = String(Math.floor(Math.random() * 1e9));
    const connA = await createTestAccurateConnection(a.userId, { dataUsahaId: duA, accurateUserId: accountId });
    const location = await withAccurateEnv(() => withAccurateFetch({ token: goodToken(Number(accountId)) }, () => callback(duB, b.userId, b.cookie)));
    expect(location).toContain("accurate_error=accurate_account_in_use");
    const [rowB] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duB));
    expect(rowB!.accurateConnectionId).toBeNull();
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, connA.id));
    expect(after!.userId).toBe(a.userId);
    expect(decrypt(after!.accessTokenEncrypted)).toBe("test-access-token"); // token pemilik lama tidak ditimpa
  });

  test("respons token tanpa user.id → ditolak (missing_account), tidak ada baris yatim", async () => {
    const { userId, cookie } = await newUser("cb-noid");
    const du = await createTestDataUsaha(userId);
    const token: TokenReply = { ...goodToken(1), user: undefined };
    const location = await withAccurateEnv(() => withAccurateFetch({ token }, () => callback(du, userId, cookie)));
    expect(location).toContain("accurate_error=missing_account");
    expect(await db.select().from(accurateConnections).where(eq(accurateConnections.userId, userId))).toHaveLength(0);
  });

  test("Data Usaha ditransfer SETELAH OAuth dimulai → invalid_state (bukan menyambungkan Data Usaha orang lain)", async () => {
    const original = await newUser("cb-xfer-old");
    const next = await newUser("cb-xfer-new");
    const du = await createTestDataUsaha(original.userId);
    const state = createState({ userId: original.userId, dataUsahaId: du });
    await db.update(dataUsaha).set({ userId: next.userId }).where(eq(dataUsaha.id, du));
    const res = await withAccurateEnv(() =>
      withAccurateFetch({ token: goodToken(Math.floor(Math.random() * 1e9)) }, () =>
        testApp.handle(new Request(`http://localhost/accurate/oauth/callback?code=abc&state=${state}`, { headers: { cookie: original.cookie } })),
      ),
    );
    expect(res.headers.get("location")).toContain("accurate_error=invalid_state");
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateConnectionId).toBeNull();
  });

  test("database tersimpan di Data Usaha DIPERTAHANKAN kalau ada di akun baru, DIKOSONGKAN kalau tidak ada", async () => {
    const { userId, cookie } = await newUser("cb-db");
    const duKeep = await createTestDataUsaha(userId, "Keep");
    const duDrop = await createTestDataUsaha(userId, "Drop");
    await db.update(dataUsaha).set({ accurateDbId: "777", accurateDbAlias: "PT Ada" }).where(eq(dataUsaha.id, duKeep));
    await db.update(dataUsaha).set({ accurateDbId: "888", accurateDbAlias: "PT Hilang" }).where(eq(dataUsaha.id, duDrop));
    const accountId = Math.floor(Math.random() * 1e9);
    await withAccurateEnv(() =>
      withAccurateFetch({ token: goodToken(accountId), databases: [{ id: 777, alias: "PT Ada" }] }, async () => {
        await callback(duKeep, userId, cookie);
        await callback(duDrop, userId, cookie);
      }),
    );
    const [keep] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duKeep));
    const [drop] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duDrop));
    expect(keep).toMatchObject({ accurateDbId: "777", accurateDbAlias: "PT Ada" });
    expect(drop).toMatchObject({ accurateDbId: null, accurateDbAlias: null });
  });

  // § security review Fase 143 (HIGH) — login CSRF / account-linking: penyerang menyodorkan authorizeUrl-nya ke korban.
  test("HIGH: callback dibuka di sesi user LAIN (korban) → invalid_state, TIDAK menukar kode, TIDAK menyambungkan akun korban ke Data Usaha penyerang", async () => {
    const attacker = await newUser("cb-csrf-attacker");
    const victim = await newUser("cb-csrf-victim");
    const duAttacker = await createTestDataUsaha(attacker.userId);
    let exchanged = 0;
    const original = globalThis.fetch;
    const location = await withAccurateEnv(async () => {
      globalThis.fetch = (async (input: string | URL | Request) => {
        if (String(input instanceof Request ? input.url : input).includes("/oauth/token")) exchanged++;
        return new Response(JSON.stringify(goodToken(Math.floor(Math.random() * 1e9))), { status: 200 });
      }) as unknown as typeof fetch;
      try {
        return await callback(duAttacker, attacker.userId, victim.cookie); // state penyerang, browser KORBAN
      } finally {
        globalThis.fetch = original;
      }
    });
    expect(location).toContain("accurate_error=invalid_state");
    expect(exchanged).toBe(0); // kode TIDAK ditukar (penukaran mematikan token lama akun korban, Fase 141 E2)
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duAttacker));
    expect(row!.accurateConnectionId).toBeNull();
  });

  test("HIGH: callback TANPA sesi login → invalid_state (state valid saja tidak cukup)", async () => {
    const { userId } = await newUser("cb-nosession");
    const du = await createTestDataUsaha(userId);
    const location = await withAccurateEnv(() => withAccurateFetch({ token: goodToken(Math.floor(Math.random() * 1e9)) }, () => callback(du, userId, "")));
    expect(location).toContain("accurate_error=invalid_state");
    expect(await db.select().from(accurateConnections).where(eq(accurateConnections.userId, userId))).toHaveLength(0);
  });

  test("Low: TOCTOU — kepemilikan berpindah setelah cek awal → pointer TIDAK dipasang untuk pemilik baru", async () => {
    // Simulasi jendela sempit: Data Usaha ditransfer SETELAH state dibuat & sesi cocok tetapi sebelum UPDATE. Diuji lewat
    // callback dengan sesi pemulai yang sudah BUKAN pemilik (ownsDataUsaha di awal callback menolak) — dan UPDATE punya guard userId.
    const original = await newUser("cb-toctou-old");
    const next = await newUser("cb-toctou-new");
    const du = await createTestDataUsaha(original.userId);
    await db.update(dataUsaha).set({ userId: next.userId }).where(eq(dataUsaha.id, du));
    const location = await withAccurateEnv(() => withAccurateFetch({ token: goodToken(Math.floor(Math.random() * 1e9)) }, () => callback(du, original.userId, original.cookie)));
    expect(location).toContain("accurate_error=invalid_state");
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateConnectionId).toBeNull();
  });
});

describe("GET /accurate/databases", () => {
  test("404 bukan pemilik; 400 NOT_CONNECTED kalau belum/tidak aktif", async () => {
    const owner = await newUser("db-owner");
    const intruder = await newUser("db-intruder");
    const du = await createTestDataUsaha(owner.userId);
    expect((await get(intruder.cookie, `/accurate/databases?dataUsahaId=${du}`)).status).toBe(404);
    const res = await get(owner.cookie, `/accurate/databases?dataUsahaId=${du}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_CONNECTED");
  });

  test("daftar database akun, `used` menandai yang sudah dipakai Data Usaha LAIN pada koneksi yang sama", async () => {
    const { userId, cookie } = await newUser("db-list");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: duA, accurateDbId: "10", accurateDbAlias: "PT 10" });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id }).where(eq(dataUsaha.id, duB));
    const res = await withAccurateFetch({ databases: [{ id: 10, alias: "PT 10" }, { id: 11, alias: "PT 11" }] }, () =>
      get(cookie, `/accurate/databases?dataUsahaId=${duB}`),
    );
    const body = (await res.json()) as { databases: { id: number; used: boolean }[] };
    expect(body.databases.find((d) => d.id === 10)?.used).toBe(true);
    expect(body.databases.find((d) => d.id === 11)?.used).toBe(false);
  });
});

describe("POST /accurate/databases/select", () => {
  test("berhasil: menyimpan database di DATA USAHA (bukan di koneksi)", async () => {
    const { userId, cookie } = await newUser("sel-ok");
    const du = await createTestDataUsaha(userId);
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: du });
    const res = await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 42, alias: "PT Empat Dua" }));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateDbId: "42", accurateDbAlias: "PT Empat Dua" });
    const [c] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id));
    expect(c!.accurateDbId).toBeNull(); // kolom legacy tidak ditulis lagi
  });

  test("400 DATABASE_ALREADY_SELECTED kalau Data Usaha sudah punya database (tidak bisa ganti diam-diam)", async () => {
    const { userId, cookie } = await newUser("sel-already");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du, accurateDbId: "1", accurateDbAlias: "PT Satu" });
    const res = await post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 2, alias: "PT Dua" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("DATABASE_ALREADY_SELECTED");
  });

  test("409 DATABASE_ALREADY_USED kalau database itu sudah dipakai Data Usaha LAIN pada koneksi yang sama", async () => {
    const { userId, cookie } = await newUser("sel-used");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: duA, accurateDbId: "9", accurateDbAlias: "PT 9" });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id }).where(eq(dataUsaha.id, duB));
    const res = await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: duB, accurateDbId: 9, alias: "PT 9" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("DATABASE_ALREADY_USED");
    const [rowB] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duB));
    expect(rowB!.accurateDbId).toBeNull();
  });

  test("502 kalau Accurate menolak membuka database; Data Usaha tidak berubah", async () => {
    const { userId, cookie } = await newUser("sel-502");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du });
    const res = await withAccurateFetch({ openDbOk: false }, () => post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 5, alias: "X" }));
    expect(res.status).toBe(502);
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateDbId).toBeNull();
  });

  test("404 bukan pemilik; 400 NOT_CONNECTED kalau belum terhubung; 422 alias kepanjangan", async () => {
    const owner = await newUser("sel-owner");
    const intruder = await newUser("sel-intruder");
    const du = await createTestDataUsaha(owner.userId);
    expect((await post(intruder.cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 1, alias: "X" })).status).toBe(404);
    const notConnected = await post(owner.cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 1, alias: "X" });
    expect(notConnected.status).toBe(400);
    expect(((await notConnected.json()) as { code: string }).code).toBe("NOT_CONNECTED");
    expect((await post(owner.cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: 1, alias: "x".repeat(256) })).status).toBe(422);
  });
});

describe("GET /accurate/accounts & POST /accurate/attach — pakai koneksi akun yang ada tanpa OAuth ulang", () => {
  test("accounts: hanya koneksi AKTIF berakun milik user; koneksi lama/expired/milik orang lain tidak muncul", async () => {
    const me = await newUser("acct-me");
    const other = await newUser("acct-other");
    const good = await createTestAccurateConnection(me.userId);
    await createTestAccurateConnection(me.userId, { status: "expired" });
    await createTestAccurateConnection(me.userId, { accurateUserId: null });
    await createTestAccurateConnection(other.userId);
    const body = (await (await get(me.cookie, "/accurate/accounts")).json()) as { accounts: { id: string; accountEmail: string | null }[] };
    expect(body.accounts.map((a) => a.id)).toEqual([good.id]);
    expect((await get("", "/accurate/accounts")).status).toBe(401);
  });

  test("attach: Data Usaha B menunjuk koneksi yang SAMA dengan A (tanpa baris baru), lalu memilih database sendiri", async () => {
    const { userId, cookie } = await newUser("att-ok");
    const duA = await createTestDataUsaha(userId, "A");
    const duB = await createTestDataUsaha(userId, "B");
    const conn = await createTestAccurateConnection(userId, { dataUsahaId: duA, accurateDbId: "1", accurateDbAlias: "PT 1" });
    const before = await db.select().from(accurateConnections).where(eq(accurateConnections.userId, userId));
    const res = await post(cookie, "/accurate/attach", { dataUsahaId: duB, connectionId: conn.id });
    expect(res.status).toBe(200);
    expect(await db.select().from(accurateConnections).where(eq(accurateConnections.userId, userId))).toHaveLength(before.length);
    const [rowB] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duB));
    expect(rowB!.accurateConnectionId).toBe(conn.id);
    const sel = await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: duB, accurateDbId: 2, alias: "PT 2" }));
    expect(sel.status).toBe(200);
    // database yang sudah dipakai A ditolak untuk B
    const dup = await withAccurateFetch({}, () => post(cookie, "/accurate/databases/select", { dataUsahaId: duB, accurateDbId: 1, alias: "PT 1" }));
    expect([400, 409]).toContain(dup.status); // B sudah punya database → ALREADY_SELECTED (400); DB milik A tetap dilindungi indeks unik
  });

  test("attach: 404 untuk Data Usaha bukan milik user; 404 CONNECTION_NOT_FOUND untuk koneksi orang lain/expired/LAMA", async () => {
    const me = await newUser("att-guard-me");
    const other = await newUser("att-guard-other");
    const du = await createTestDataUsaha(me.userId);
    const otherDu = await createTestDataUsaha(other.userId);
    const others = await createTestAccurateConnection(other.userId);
    const expired = await createTestAccurateConnection(me.userId, { status: "expired" });
    const legacy = await createTestAccurateConnection(me.userId, { accurateUserId: null });
    expect((await post(me.cookie, "/accurate/attach", { dataUsahaId: otherDu, connectionId: others.id })).status).toBe(404);
    for (const conn of [others, expired, legacy]) {
      const res = await post(me.cookie, "/accurate/attach", { dataUsahaId: du, connectionId: conn.id });
      expect(res.status).toBe(404);
      expect(((await res.json()) as { code: string }).code).toBe("CONNECTION_NOT_FOUND");
    }
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateConnectionId).toBeNull();
  });

  test("attach: 409 ALREADY_CONNECTED kalau Data Usaha sudah punya koneksi; reconnect:true menggantinya", async () => {
    const { userId, cookie } = await newUser("att-409");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du });
    const other = await createTestAccurateConnection(userId);
    expect((await post(cookie, "/accurate/attach", { dataUsahaId: du, connectionId: other.id })).status).toBe(409);
    expect((await post(cookie, "/accurate/attach", { dataUsahaId: du, connectionId: other.id, reconnect: true })).status).toBe(200);
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateConnectionId).toBe(other.id);
  });

  test("attach: database tersimpan yang TIDAK ada di akun itu dikosongkan; yang ada dipertahankan", async () => {
    const { userId, cookie } = await newUser("att-db");
    const duKeep = await createTestDataUsaha(userId, "Keep");
    const duDrop = await createTestDataUsaha(userId, "Drop");
    await db.update(dataUsaha).set({ accurateDbId: "777", accurateDbAlias: "PT Ada" }).where(eq(dataUsaha.id, duKeep));
    await db.update(dataUsaha).set({ accurateDbId: "888", accurateDbAlias: "PT Hilang" }).where(eq(dataUsaha.id, duDrop));
    const conn = await createTestAccurateConnection(userId);
    await withAccurateFetch({ databases: [{ id: 777, alias: "PT Ada" }] }, async () => {
      await post(cookie, "/accurate/attach", { dataUsahaId: duKeep, connectionId: conn.id });
      await post(cookie, "/accurate/attach", { dataUsahaId: duDrop, connectionId: conn.id });
    });
    const [keep] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duKeep));
    const [drop] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duDrop));
    expect(keep).toMatchObject({ accurateDbId: "777" });
    expect(drop).toMatchObject({ accurateDbId: null, accurateDbAlias: null });
  });
});

describe("validasi input (security review Fase 143)", () => {
  test("databases/select menolak accurateDbId pecahan/nol/negatif (422)", async () => {
    const { userId, cookie } = await newUser("val-int");
    const du = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId: du });
    for (const bad of [1.5, 0, -3]) {
      expect((await post(cookie, "/accurate/databases/select", { dataUsahaId: du, accurateDbId: bad, alias: "X" })).status).toBe(422);
    }
  });

  test("callback menolak query kepanjangan (422)", async () => {
    const res = await testApp.handle(new Request(`http://localhost/accurate/oauth/callback?code=${"a".repeat(600)}&state=x`));
    expect(res.status).toBe(422);
  });
});
