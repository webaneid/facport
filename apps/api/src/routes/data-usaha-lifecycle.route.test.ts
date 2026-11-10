import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { accurateConnections, auditLogs, dataUsaha, plans, subscriptions, importBatches, user as userTable } from "../db/schema";
import { meRoute } from "./me.route";
import { createTestAccurateConnection, createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { ownsDataUsaha, hasAccessToDataUsaha } from "../lib/data-usaha";
import { cleanupExpiredArchives, decideMode, confirmNameMatches, isArchiveExpired } from "../lib/data-usaha-lifecycle";

// § Fase 218, ADR-0055 — hapus (kosong) & arsip (punya riwayat) Data Usaha oleh PEMILIK; arsip/hapus memutus Accurate; pulihkan dalam 30 hari; pembersihan harian.
const runId = Date.now();
const app = new Elysia().mount(auth.handler).use(meRoute);
let seq = 0;

async function makeUser(label: string) {
  const email = `du-life-${label}-${runId}-${seq++}@test.local`;
  const res = await app.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `DU Life ${label}` }) }));
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const signIn = await app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return { id: user.id, cookie: signIn.headers.get("set-cookie") ?? "" };
}
const call = (cookie: string | null, method: string, path: string, body?: unknown) =>
  app.handle(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
const NAME = "PT Uji Siklus";
async function mkDu(userId: string, name = NAME) {
  return createTestDataUsaha(userId, name);
}
async function mkSub(userId: string, dataUsahaId: string, opts: { status?: string; endAt?: Date | null; isTrial?: boolean } = {}) {
  const [plan] = await db.insert(plans).values({ name: `DU Life test ${crypto.randomUUID()}`, price: 1000, durationDays: 30, modules: ["sales_receipt"] }).returning();
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status: opts.status ?? "expired", startAt: new Date(Date.now() - 40 * 864e5), endAt: opts.endAt === undefined ? new Date(Date.now() - 864e5) : opts.endAt, isTrial: opts.isTrial ?? false, dataUsahaId })
    .returning();
  return sub!.id;
}
const du = async (id: string) => (await db.select().from(dataUsaha).where(eq(dataUsaha.id, id)))[0];

describe("fungsi murni", () => {
  test("decideMode / confirmNameMatches / isArchiveExpired", () => {
    expect(decideMode([], [])).toBe("delete");
    expect(decideMode(["subscriptions"], [])).toBe("archive");
    expect(decideMode(["subscriptions"], [{ code: "ACTIVE_SUBSCRIPTION", count: 1 }])).toBe("blocked");
    expect(confirmNameMatches("  pt UJI siklus ", "PT Uji Siklus")).toBe(true);
    expect(confirmNameMatches("lain", "PT Uji Siklus")).toBe(false);
    expect(confirmNameMatches("", "")).toBe(false);
    const t = new Date("2026-01-01T00:00:00Z");
    expect(isArchiveExpired(t, new Date("2026-01-30T00:00:00Z"))).toBe(false);
    expect(isArchiveExpired(t, new Date("2026-02-01T00:00:00Z"))).toBe(true);
  });
});

describe("izin & kepemilikan", () => {
  test("tanpa login 401; bukan pemilik 404 untuk semua aksi", async () => {
    const owner = await makeUser("o1");
    const other = await makeUser("x1");
    const id = await mkDu(owner.id);
    for (const [m, p, b] of [["GET", `/me/data-usaha/${id}/lifecycle`, undefined], ["POST", `/me/data-usaha/${id}/archive`, { confirm: NAME }], ["POST", `/me/data-usaha/${id}/delete`, { confirm: NAME }], ["POST", `/me/data-usaha/${id}/restore`, undefined]] as const) {
      expect((await call(null, m, p, b)).status).toBe(401);
      expect((await call(other.cookie, m, p, b)).status).toBe(404);
    }
    expect((await du(id))?.archivedAt).toBeNull();
  });

  test("member seat aktif BUKAN pemilik: ditolak", async () => {
    const owner = await makeUser("o2");
    const member = await makeUser("m2");
    const id = await mkDu(owner.id);
    expect((await call(member.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: NAME })).status).toBe(404);
  });
});

describe("hapus (kosong)", () => {
  test("pratinjau mode delete; konfirmasi salah 400; hapus berhasil, koneksi Accurate terputus & dicabut, audit tercatat", async () => {
    const owner = await makeUser("o3");
    const id = await mkDu(owner.id);
    const conn = await createTestAccurateConnection(owner.id, { dataUsahaId: id, accurateDbId: `DUL-${runId}-a`, accurateDbAlias: "DB Uji" });
    const prev = (await (await call(owner.cookie, "GET", `/me/data-usaha/${id}/lifecycle`)).json()) as { mode: string };
    expect(prev.mode).toBe("delete");
    expect((await call(owner.cookie, "POST", `/me/data-usaha/${id}/delete`, { confirm: "salah" })).status).toBe(400);
    expect(await du(id)).toBeDefined();
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/delete`, { confirm: NAME });
    expect(res.status).toBe(200);
    expect(await du(id)).toBeUndefined();
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(0);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, "delete"))).orderBy(desc(auditLogs.createdAt)).limit(1);
    expect(audit?.actorId).toBe(owner.id);
  });

  test("koneksi akun yang masih dipakai Data Usaha lain TIDAK dicabut, hanya pointer Data Usaha ini dilepas", async () => {
    const owner = await makeUser("o4");
    const a = await mkDu(owner.id, "DU A");
    const b = await mkDu(owner.id, "DU B");
    const conn = await createTestAccurateConnection(owner.id, { dataUsahaId: a, accurateDbId: `DUL-${runId}-b1` });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id, accurateDbId: `DUL-${runId}-b2` }).where(eq(dataUsaha.id, b));
    expect((await call(owner.cookie, "POST", `/me/data-usaha/${a}/delete`, { confirm: "DU A" })).status).toBe(200);
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(1);
    expect((await du(b))?.accurateConnectionId).toBe(conn.id);
  });

  test("yang punya riwayat tidak bisa dihapus (NOT_EMPTY)", async () => {
    const owner = await makeUser("o5");
    const id = await mkDu(owner.id);
    await mkSub(owner.id, id);
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/delete`, { confirm: NAME });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "NOT_EMPTY" });
    expect(await du(id)).toBeDefined();
  });
});

describe("arsip & pulihkan", () => {
  test("punya riwayat → arsip: Accurate terputus (pointer & database kosong, koneksi dicabut), tersembunyi dari daftar, tak bisa dipakai, audit; lalu pulihkan", async () => {
    const owner = await makeUser("o6");
    const id = await mkDu(owner.id);
    await mkSub(owner.id, id);
    const conn = await createTestAccurateConnection(owner.id, { dataUsahaId: id, accurateDbId: `DUL-${runId}-c`, accurateDbAlias: "DB Arsip" });
    const prev = (await (await call(owner.cookie, "GET", `/me/data-usaha/${id}/lifecycle`)).json()) as { mode: string };
    expect(prev.mode).toBe("archive");
    expect((await call(owner.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: "salah" })).status).toBe(400);
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: NAME.toLowerCase() });
    expect(res.status).toBe(200);
    const row = await du(id);
    expect(row?.archivedAt).not.toBeNull();
    expect(row).toMatchObject({ accurateConnectionId: null, accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null });
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(0);
    expect(await ownsDataUsaha(owner.id, id)).toBe(false);
    expect(await hasAccessToDataUsaha(owner.id, id)).toBe(false);
    const list = (await (await call(owner.cookie, "GET", "/me/data-usaha")).json()) as { dataUsaha: { id: string }[] };
    expect(list.dataUsaha.map((d) => d.id)).not.toContain(id);
    const arch = (await (await call(owner.cookie, "GET", "/me/data-usaha/archived")).json()) as { archived: { id: string; canRestore: boolean }[] };
    expect(arch.archived).toEqual([expect.objectContaining({ id, canRestore: true })]);
    const again = await call(owner.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: NAME });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ code: "ALREADY_ARCHIVED" });
    const restored = await call(owner.cookie, "POST", `/me/data-usaha/${id}/restore`);
    expect(restored.status).toBe(200);
    expect((await du(id))?.archivedAt).toBeNull();
    expect(await ownsDataUsaha(owner.id, id)).toBe(true);
    expect((await du(id))?.accurateConnectionId).toBeNull(); // pulihkan TIDAK menyambung Accurate lagi
    expect((await call(owner.cookie, "POST", `/me/data-usaha/${id}/restore`)).status).toBe(409); // NOT_ARCHIVED
  });

  test("Data Usaha kosong tidak bisa diarsipkan (IS_EMPTY: pakai hapus)", async () => {
    const owner = await makeUser("o7");
    const id = await mkDu(owner.id);
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: NAME });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "IS_EMPTY" });
  });

  test.each([
    ["langganan aktif", "ACTIVE_SUBSCRIPTION", async (o: string, id: string): Promise<void> => void (await mkSub(o, id, { status: "active", endAt: new Date(Date.now() + 5 * 864e5) }))],
    ["langganan menunggu bayar", "PENDING_ORDER", async (o: string, id: string): Promise<void> => void (await mkSub(o, id, { status: "pending_payment", endAt: null }))],
    ["User Tambahan aktif", "ACTIVE_SEAT", async (o: string, id: string) => {
      const seatId = await createTestSeat(o, id);
      const { memberSeats } = await import("../db/schema");
      await db.update(memberSeats).set({ status: "active", memberUserId: o }).where(eq(memberSeats.id, seatId));
    }],
  ] as const)("penghalang %s → 409 HAS_BLOCKERS dan tidak ada yang berubah", async (_label, code, setup) => {
    const owner = await makeUser(`b-${code}`);
    const id = await mkDu(owner.id);
    await mkSub(owner.id, id); // riwayat agar bukan 'kosong'
    await setup(owner.id, id);
    await createTestAccurateConnection(owner.id, { dataUsahaId: id, accurateDbId: `DUL-${runId}-${code}` });
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: NAME });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; blockers: { code: string }[] };
    expect(body.code).toBe("HAS_BLOCKERS");
    expect(body.blockers.map((b) => b.code)).toContain(code);
    const row = await du(id);
    expect(row?.archivedAt).toBeNull();
    expect(row?.accurateConnectionId).not.toBeNull(); // transaksi dibatalkan: Accurate tetap terhubung
  });

  test("import berjalan menghalangi arsip", async () => {
    const owner = await makeUser("o8");
    const id = await mkDu(owner.id);
    const subId = await mkSub(owner.id, id);
    await db.insert(importBatches).values({ userId: owner.id, subscriptionId: subId, module: "sales_receipt", fileName: "x.xlsx", totalRows: 1, status: "processing" });
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/archive`, { confirm: NAME });
    expect(((await res.json()) as { blockers: { code: string }[] }).blockers.map((b) => b.code)).toContain("IMPORT_RUNNING");
  });

  test("pulihkan setelah lewat 30 hari → ARCHIVE_EXPIRED", async () => {
    const owner = await makeUser("o9");
    const id = await mkDu(owner.id);
    await mkSub(owner.id, id);
    await db.update(dataUsaha).set({ archivedAt: new Date(Date.now() - 31 * 864e5) }).where(eq(dataUsaha.id, id));
    const res = await call(owner.cookie, "POST", `/me/data-usaha/${id}/restore`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "ARCHIVE_EXPIRED" });
    const arch = (await (await call(owner.cookie, "GET", "/me/data-usaha/archived")).json()) as { archived: { id: string; canRestore: boolean }[] };
    expect(arch.archived[0]?.canRestore).toBe(false);
  });
});

describe("pembersihan harian (cleanupExpiredArchives)", () => {
  test("Data Usaha arsip > 30 hari: cangkang dipertahankan bila ada catatan keuangan; tidak diproses dua kali; yang belum lewat 30 hari tidak disentuh", async () => {
    const owner = await makeUser("c1");
    const keep = await mkDu(owner.id, "Cangkang");
    await mkSub(owner.id, keep);
    const fresh = await mkDu(owner.id, "Baru");
    await mkSub(owner.id, fresh);
    await db.update(dataUsaha).set({ archivedAt: new Date(Date.now() - 31 * 864e5) }).where(eq(dataUsaha.id, keep));
    await db.update(dataUsaha).set({ archivedAt: new Date(Date.now() - 5 * 864e5) }).where(eq(dataUsaha.id, fresh));
    const first = await cleanupExpiredArchives();
    expect(first.processed).toBeGreaterThanOrEqual(1);
    const shell = await du(keep);
    expect(shell).toBeDefined(); // masih dirujuk langganan → cangkang
    expect(shell?.archiveCleanedAt).not.toBeNull();
    expect((await du(fresh))?.archiveCleanedAt).toBeNull();
    const again = await cleanupExpiredArchives();
    expect(again.processed).toBe(0);
    expect((await call(owner.cookie, "POST", `/me/data-usaha/${keep}/restore`)).status).toBe(409); // tak bisa dipulihkan lagi
  });
});
