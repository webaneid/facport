import { describe, test, expect, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, plans, subscriptions, dataUsaha, importBatches, importBatchRows, settings, trialClaims } from "../db/schema";
import { checkTrialRowBudget, TRIAL_MAX_ROWS_SETTING_KEY } from "./trial";
import { releaseTrialClaim, settleTrialUsage, TRIAL_EXEMPT_DB_IDS_SETTING_KEY } from "./trial-claims";

// § Fase 217, ADR-0054 — buku besar trial per (database Accurate, modul). Dites langsung (logika murni, tanpa HTTP).
const runId = Date.now();
const MAX = 5;
const dbId = (n: number) => `T217-${runId}-${n}`;
const users: string[] = [];
const dbIds: string[] = [];

async function mkUser(label: string) {
  const now = new Date();
  const [u] = await db.insert(userTable).values({ id: crypto.randomUUID(), email: `t217-${runId}-${label}@test.local`, name: "T217", emailVerified: true, createdAt: now, updatedAt: now }).returning();
  users.push(u!.id);
  return u!.id;
}
async function mkSub(userId: string, accurateDbId: string | null, isTrial = true, moduleKey = "sales_receipt") {
  const [plan] = await db.insert(plans).values({ name: `T217 test ${crypto.randomUUID()}`, price: 1000, durationDays: 30, modules: [moduleKey] }).returning();
  const [du] = await db.insert(dataUsaha).values({ userId, name: "DU T217", accurateDbId }).returning();
  if (accurateDbId) dbIds.push(accurateDbId);
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 864e5), isTrial, dataUsahaId: du!.id })
    .returning();
  return sub!.id;
}
async function addSuccessRows(userId: string, subscriptionId: string, moduleKey: string, n: number) {
  const [batch] = await db.insert(importBatches).values({ userId, subscriptionId, module: moduleKey, fileName: "t217.xlsx", totalRows: n, status: "completed" }).returning();
  for (let i = 0; i < n; i++) await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: i + 1, rawData: {}, status: "success" });
  return batch!.id;
}
async function setMax() {
  await db.insert(settings).values({ key: TRIAL_MAX_ROWS_SETTING_KEY, value: MAX, group: "data" }).onConflictDoUpdate({ target: settings.key, set: { value: MAX } });
}

afterAll(async () => {
  if (dbIds.length) await db.delete(trialClaims).where(inArray(trialClaims.accurateDbId, dbIds));
  await db.delete(settings).where(eq(settings.key, TRIAL_EXEMPT_DB_IDS_SETTING_KEY));
});

describe("buku besar trial per database + modul", () => {
  test("klaim pertama lolos; langganan trial LAIN (akun lain) di database sama ditolak 409", async () => {
    await setMax();
    const d = dbId(1);
    const a = await mkUser("a1");
    const b = await mkUser("b1");
    const subA = await mkSub(a, d);
    const subB = await mkSub(b, d);
    expect((await checkTrialRowBudget(subA, 1)).ok).toBe(true);
    const r = await checkTrialRowBudget(subB, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("TRIAL_DATABASE_ALREADY_USED");
    }
    expect((await checkTrialRowBudget(subA, 1)).ok).toBe(true); // pemilik klaim tetap lolos (confirm/retry)
  });

  test("database berbeda atau modul berbeda tidak saling mengunci", async () => {
    const a = await mkUser("a2");
    const b = await mkUser("b2");
    const c = await mkUser("c2");
    const sa = await mkSub(a, dbId(2));
    const sb = await mkSub(b, dbId(3));
    const sc = await mkSub(c, dbId(2), true, "purchase_invoice");
    expect((await checkTrialRowBudget(sa, 1)).ok).toBe(true);
    expect((await checkTrialRowBudget(sb, 1)).ok).toBe(true);
    expect((await checkTrialRowBudget(sc, 1)).ok).toBe(true);
  });

  test("langganan berbayar tidak terpengaruh dan tidak mengklaim", async () => {
    const a = await mkUser("a3");
    const b = await mkUser("b3");
    const paid = await mkSub(a, dbId(4), false);
    const trial = await mkSub(b, dbId(4));
    expect((await checkTrialRowBudget(paid, 999999)).ok).toBe(true);
    expect((await checkTrialRowBudget(trial, 1)).ok).toBe(true);
  });

  test("balapan: dua langganan mengklaim bersamaan, tepat satu menang", async () => {
    const a = await mkUser("a4");
    const b = await mkUser("b4");
    const sa = await mkSub(a, dbId(5));
    const sb = await mkSub(b, dbId(5));
    const [ra, rb] = await Promise.all([checkTrialRowBudget(sa, 1), checkTrialRowBudget(sb, 1)]);
    expect([ra.ok, rb.ok].filter(Boolean).length).toBe(1);
  });

  test("satu langganan terikat satu database: pindah database ditolak TRIAL_SUBSCRIPTION_BOUND", async () => {
    const a = await mkUser("a5");
    const sub = await mkSub(a, dbId(6));
    expect((await checkTrialRowBudget(sub, 1)).ok).toBe(true);
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub));
    await db.update(dataUsaha).set({ accurateDbId: dbId(7) }).where(eq(dataUsaha.id, s!.dataUsahaId));
    dbIds.push(dbId(7));
    const r = await checkTrialRowBudget(sub, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.code).toBe("TRIAL_SUBSCRIPTION_BOUND");
  });

  test("kuota tahan purge: baris dihapus tetapi pemakaian tetap tercatat", async () => {
    await setMax();
    const a = await mkUser("a6");
    const sub = await mkSub(a, dbId(8));
    expect((await checkTrialRowBudget(sub, 1)).ok).toBe(true); // buat klaim
    const batchId = await addSuccessRows(a, sub, "sales_receipt", 4);
    await settleTrialUsage(sub);
    await db.delete(importBatches).where(eq(importBatches.id, batchId)); // meniru purge / hapus riwayat
    const r = await checkTrialRowBudget(sub, 2); // 4 terpakai + 2 > 5
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.body.code).toBe("TRIAL_ROW_LIMIT_EXCEEDED");
      expect(r.remaining).toBe(1);
    }
    expect((await checkTrialRowBudget(sub, 1)).ok).toBe(true);
  });

  test("tanpa database terpilih: aturan lama (tanpa klaim)", async () => {
    const a = await mkUser("a7");
    const sub = await mkSub(a, null);
    expect((await checkTrialRowBudget(sub, 1)).ok).toBe(true);
    expect(await db.select().from(trialClaims).where(eq(trialClaims.subscriptionId, sub))).toHaveLength(0);
  });

  test("database dalam daftar pengecualian tidak diklaim", async () => {
    const d = dbId(9);
    await db.insert(settings).values({ key: TRIAL_EXEMPT_DB_IDS_SETTING_KEY, value: [d], group: "data" }).onConflictDoUpdate({ target: settings.key, set: { value: [d] } });
    const a = await mkUser("a8");
    const b = await mkUser("b8");
    const sa = await mkSub(a, d);
    const sb = await mkSub(b, d);
    expect((await checkTrialRowBudget(sa, 1)).ok).toBe(true);
    expect((await checkTrialRowBudget(sb, 1)).ok).toBe(true);
    await db.delete(settings).where(eq(settings.key, TRIAL_EXEMPT_DB_IDS_SETTING_KEY));
  });

  test("lepas klaim membuka kembali database untuk langganan lain (diaudit, baris tidak dihapus)", async () => {
    const d = dbId(10);
    const a = await mkUser("a9");
    const b = await mkUser("b9");
    const sa = await mkSub(a, d);
    const sb = await mkSub(b, d);
    expect((await checkTrialRowBudget(sa, 1)).ok).toBe(true);
    expect((await checkTrialRowBudget(sb, 1)).ok).toBe(false);
    const [claim] = await db.select().from(trialClaims).where(eq(trialClaims.subscriptionId, sa));
    const rel = await releaseTrialClaim(claim!.id, a, "salah klaim");
    expect(rel.ok).toBe(true);
    expect((await releaseTrialClaim(claim!.id, a, "lagi")).ok).toBe(false);
    expect((await checkTrialRowBudget(sb, 1)).ok).toBe(true);
    expect(await db.select().from(trialClaims).where(eq(trialClaims.id, claim!.id))).toHaveLength(1);
  });
});

describe("findForeignTrialClaim (guard awal saat trial dibuat)", () => {
  test("bentrok bila (db, modul) sudah diklaim langganan lain; tidak bentrok untuk database lain atau tanpa database", async () => {
    const { findForeignTrialClaim } = await import("./trial-claims");
    const d = dbId(20);
    const a = await mkUser("f1");
    const b = await mkUser("f2");
    const subA = await mkSub(a, d);
    expect((await checkTrialRowBudget(subA, 1)).ok).toBe(true);
    const [sB] = await db.select().from(subscriptions).where(eq(subscriptions.id, await mkSub(b, d)));
    expect(await findForeignTrialClaim({ userId: b, dataUsahaId: sB!.dataUsahaId, modules: ["sales_receipt"] })).toBe("sales_receipt");
    expect(await findForeignTrialClaim({ userId: b, dataUsahaId: sB!.dataUsahaId, modules: ["purchase_invoice"] })).toBeNull();
    const [sC] = await db.select().from(subscriptions).where(eq(subscriptions.id, await mkSub(b, null)));
    expect(await findForeignTrialClaim({ userId: b, dataUsahaId: sC!.dataUsahaId, modules: ["sales_receipt"] })).toBeNull();
  });
});
