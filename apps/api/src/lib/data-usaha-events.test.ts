import { describe, test, expect, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, user as userTable } from "../db/schema";
import { createTestDataUsaha } from "./test-fixtures";
import { logger } from "./logger";
import { DATA_USAHA_EVENT, DISCONNECT_REASON_CODES, insertDataUsahaEvent, listDataUsahaEvents, normalizeDisconnectReason, recordDataUsahaEvent } from "./data-usaha-events";

// § Fase 189B — satu aliran riwayat per Data Usaha (koneksi Accurate + akses seat) di `audit_logs` (entity_type='data_usaha').
const runId = Date.now();
let seq = 0;

async function makeUser(name: string) {
  const id = `du-events-${runId}-${seq++}`;
  await db.insert(userTable).values({ id, name, email: `${id}@test.local`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  return id;
}

describe("data-usaha-events", () => {
  test("semua nama aksi muat di kolom action (≤ 20 karakter)", () => {
    for (const action of Object.values(DATA_USAHA_EVENT)) expect(action.length).toBeLessThanOrEqual(20);
  });

  test("record + list: terbaru dulu, memuat pelaku, hanya Data Usaha itu dan hanya aksi riwayat", async () => {
    const actor = await makeUser("Pemilik Satu");
    const du = await createTestDataUsaha(actor);
    const other = await createTestDataUsaha(actor, "Data Usaha Lain");

    await recordDataUsahaEvent({ dataUsahaId: du, action: DATA_USAHA_EVENT.CONNECT, actorId: actor, changes: { via: "oauth", accountEmail: "a@accurate.test" } });
    await new Promise((r) => setTimeout(r, 5));
    await recordDataUsahaEvent({ dataUsahaId: du, action: DATA_USAHA_EVENT.SELECT_DATABASE, actorId: actor, changes: { accurateDbId: "7", alias: "PT Salah" } });
    await new Promise((r) => setTimeout(r, 5));
    await recordDataUsahaEvent({ dataUsahaId: du, action: DATA_USAHA_EVENT.RESET_DATABASE, actorId: actor, changes: { previousDbId: "7", previousAlias: "PT Salah" } });
    await recordDataUsahaEvent({ dataUsahaId: other, action: DATA_USAHA_EVENT.CONNECT, actorId: actor, changes: { via: "attach" } });
    // aksi audit lain pada entitas yang sama (mis. transfer/ubah) TIDAK termasuk riwayat koneksi/akses
    await db.insert(auditLogs).values({ entityType: "data_usaha", entityId: du, action: "update", changes: { name: "x" }, actorId: actor });

    const events = await listDataUsahaEvents(du);
    expect(events.map((e) => e.action)).toEqual(["reset_database", "select_database", "connect_accurate"]);
    expect(events[0]).toMatchObject({ actorId: actor, actorName: "Pemilik Satu", changes: { previousDbId: "7", previousAlias: "PT Salah" } });
    expect(events.every((e) => e.entityId === du)).toBe(true);
    expect(await listDataUsahaEvents(du, 2)).toHaveLength(2);
  });

  test("disconnect_accurate lama (pra-189B) ikut dalam riwayat", async () => {
    const actor = await makeUser("Admin");
    const du = await createTestDataUsaha(actor);
    await db.insert(auditLogs).values({ entityType: "data_usaha", entityId: du, action: "disconnect_accurate", changes: { previousAccurateDbAlias: "PT A" }, actorId: actor });
    const events = await listDataUsahaEvents(du);
    expect(events.map((e) => e.action)).toEqual(["disconnect_accurate"]);
  });

  test("recordDataUsahaEvent NON-FATAL: kegagalan tulis (aktor tak ada → FK) tidak melempar, dicatat tanpa PII", async () => {
    const actor = await makeUser("Pemilik");
    const du = await createTestDataUsaha(actor);
    const errorLog = spyOn(logger, "error");
    await expect(
      recordDataUsahaEvent({ dataUsahaId: du, action: DATA_USAHA_EVENT.CONNECT, actorId: "aktor-tidak-ada", changes: { accountEmail: "rahasia@accurate.test" } }),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("rahasia@accurate.test");
    errorLog.mockRestore();
    expect(await listDataUsahaEvents(du)).toHaveLength(0);
  });

  test("insertDataUsahaEvent (dalam transaksi) MELEMPAR bila gagal — agar transaksi pemanggil ikut batal", async () => {
    const actor = await makeUser("Pemilik");
    const du = await createTestDataUsaha(actor);
    await expect(
      db.transaction((tx) => insertDataUsahaEvent(tx, { dataUsahaId: du, action: DATA_USAHA_EVENT.REVOKE_SEAT, actorId: "aktor-tidak-ada", changes: {} })),
    ).rejects.toThrow();
    expect(await db.select().from(auditLogs).where(eq(auditLogs.entityId, du))).toHaveLength(0);
  });
});

describe("normalizeDisconnectReason", () => {
  test("kode+catatan dirapikan; kosong/spasi → null; daftar kode = yang dipakai skema route & UI", () => {
    expect(normalizeDisconnectReason({ code: "salah_akun", note: "  a  " })).toEqual({ code: "salah_akun", note: "a" });
    expect(normalizeDisconnectReason({ note: "saja" })).toEqual({ code: null, note: "saja" });
    expect(normalizeDisconnectReason({ code: "lainnya" })).toEqual({ code: "lainnya", note: null });
    expect(normalizeDisconnectReason({ note: "   " })).toBeNull();
    expect(normalizeDisconnectReason(undefined)).toBeNull();
    // skema Elysia di routes/admin/data-usaha.route.ts menulis literal yang sama secara eksplisit
    expect([...DISCONNECT_REASON_CODES]).toEqual(["salah_database", "salah_akun", "lainnya"]);
  });
});
