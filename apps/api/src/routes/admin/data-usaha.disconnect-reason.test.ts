import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, auditLogs, notifications, dataUsaha } from "../../db/schema";
import { adminDataUsahaRoute } from "./data-usaha.route";
import { createTestAccurateConnection, createTestDataUsaha } from "../../lib/test-fixtures";

// § Fase 189B, D10 — alasan putus koneksi oleh admin: saran cepat (kode) + catatan bebas, KEDUANYA opsional. Dicatat di riwayat Data Usaha (butir 9 client:
// berapa pelanggan salah database / salah akun). Catatan admin bersifat internal: TIDAK ditampilkan ke pelanggan di notifikasi.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminDataUsahaRoute);
let seq = 0;

async function makeUser(label: string, roleName?: string) {
  const email = `disc-reason-${label}-${runId}-${seq++}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Disc ${label}` }) }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  if (roleName) {
    const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
    await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  }
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  return { id: user.id, cookie: signIn.headers.get("set-cookie") ?? "" };
}

const disconnect = (cookie: string, id: string, body?: unknown) =>
  testApp.handle(
    new Request(`http://localhost/admin/data-usaha/${id}/disconnect-accurate`, {
      method: "POST",
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

async function setup() {
  const admin = await makeUser("admin", "admin");
  const owner = await makeUser("owner");
  const du = await createTestDataUsaha(owner.id, `DU Reason ${seq}`);
  await createTestAccurateConnection(owner.id, { dataUsahaId: du, accurateDbId: "9", accurateDbAlias: "PT Salah Database" });
  return { admin, owner, du };
}
const auditOf = async (du: string) =>
  (await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, du), eq(auditLogs.action, "disconnect_accurate"))))[0]!;

describe("alasan putus koneksi (disconnect-accurate)", () => {
  test("kode + catatan tersimpan di riwayat; catatan internal TIDAK bocor ke notifikasi pelanggan", async () => {
    const { admin, owner, du } = await setup();
    const res = await disconnect(admin.cookie, du, { reason: { code: "salah_database", note: "  Pak Budi salah pilih PT lain, dikonfirmasi via WA  " } });
    expect(res.status).toBe(200);
    const audit = await auditOf(du);
    expect(audit.changes).toMatchObject({ previousAccurateDbAlias: "PT Salah Database", reason: { code: "salah_database", note: "Pak Budi salah pilih PT lain, dikonfirmasi via WA" } });
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, owner.id), eq(notifications.entityId, du)));
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.stringify(notes)).not.toContain("Pak Budi");
  });

  test("tanpa alasan tetap 200 (opsional) dan reason = null; hanya catatan tanpa kode juga sah; kode+removeAccount salah_akun", async () => {
    const a = await setup();
    expect((await disconnect(a.admin.cookie, a.du)).status).toBe(200);
    expect((await auditOf(a.du)).changes).toMatchObject({ reason: null });

    const b = await setup();
    expect((await disconnect(b.admin.cookie, b.du, { reason: { note: "hanya catatan" } })).status).toBe(200);
    expect((await auditOf(b.du)).changes).toMatchObject({ reason: { code: null, note: "hanya catatan" } });

    const c = await setup();
    expect((await disconnect(c.admin.cookie, c.du, { removeAccount: true, reason: { code: "salah_akun" } })).status).toBe(200);
    expect((await auditOf(c.du)).changes).toMatchObject({ removedAccount: true, reason: { code: "salah_akun", note: null } });
  });

  test("alasan kosong/spasi saja dianggap tidak ada; kode di luar daftar atau catatan >500 → 422 dan koneksi TIDAK terputus", async () => {
    const a = await setup();
    expect((await disconnect(a.admin.cookie, a.du, { reason: { note: "   " } })).status).toBe(200);
    expect((await auditOf(a.du)).changes).toMatchObject({ reason: null });

    const b = await setup();
    expect((await disconnect(b.admin.cookie, b.du, { reason: { code: "sembarang" } })).status).toBe(422);
    expect((await disconnect(b.admin.cookie, b.du, { reason: { note: "x".repeat(501) } })).status).toBe(422);
    const rows = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, b.du), eq(auditLogs.action, "disconnect_accurate")));
    expect(rows).toHaveLength(0);
  });

  test("hapus akun Accurate yang dipakai >1 Data Usaha: SETIAP Data Usaha terdampak mendapat entri riwayat sendiri (bukan hanya yang diklik)", async () => {
    const admin = await makeUser("admin", "admin");
    const owner = await makeUser("owner");
    const duA = await createTestDataUsaha(owner.id, "DU A");
    const duB = await createTestDataUsaha(owner.id, "DU B");
    const conn = await createTestAccurateConnection(owner.id, { dataUsahaId: duA, accurateDbId: "1", accurateDbAlias: "PT Satu" });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id, accurateDbId: "2", accurateDbAlias: "PT Dua" }).where(eq(dataUsaha.id, duB));

    const res = await disconnect(admin.cookie, duA, { removeAccount: true, reason: { code: "salah_akun" } });
    expect(res.status).toBe(200);

    const main = await auditOf(duA);
    expect(main.changes).toMatchObject({ removedAccount: true, previousAccurateDbAlias: "PT Satu" });
    const [secondary] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, duB), eq(auditLogs.action, "disconnect_accurate")));
    expect(secondary).toBeTruthy();
    expect(secondary!.actorId).toBe(admin.id);
    expect(secondary!.changes).toMatchObject({ removedAccount: true, viaDataUsahaId: duA, previousAccurateDbAlias: "PT Dua", reason: { code: "salah_akun" } });
  });

  test("putus biasa (tanpa hapus akun): hanya Data Usaha itu yang tercatat", async () => {
    const { admin, owner, du } = await setup();
    const other = await createTestDataUsaha(owner.id, "DU Lain");
    expect((await disconnect(admin.cookie, du)).status).toBe(200);
    const rows = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, other), eq(auditLogs.action, "disconnect_accurate")));
    expect(rows).toHaveLength(0);
  });
});
