import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user as userTable, dataUsaha, plans, subscriptions, autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries } from "../db/schema";
import { createTestDataUsaha } from "../lib/test-fixtures";
import { processAutoproduksiProductionImportRow } from "./index";
import type { AccurateSessionContext } from "../lib/accurate-session";

// § Fase 168 — jalur error resolusi Formula di Import Produksi (Excel):
// semua gagal SEBELUM panggilan Accurate, jadi ctx cukup stub kosong.
const runId = Date.now();
const ctx = {} as AccurateSessionContext;
const mapping = { Tanggal: "transDate", "Nama Resep/Formula": "formulaName", Jumlah: "producedQty" };
const row = (name: string) => ({ Tanggal: "2026-10-01", "Nama Resep/Formula": name, Jumlah: 2 });

let userId = "";
let subscriptionId = "";
let dataUsahaId = "";
let planId = "";

async function insertFormula(name: string, isActive: boolean) {
  const [f] = await db
    .insert(autoproduksiFormulas)
    .values({
      userId,
      dataUsahaId,
      subscriptionId,
      name,
      finishedGoodItemNo: "100011",
      finishedGoodItemUnitName: "Loyang",
      adjustmentAccountNo: "11078",
      isActive,
    })
    .returning();
  await db.insert(autoproduksiFormulaItems).values({ formulaId: f!.id, itemNo: "100012", itemUnitName: "KG", quantity: "1", sortOrder: 0 });
  return f!;
}

beforeAll(async () => {
  userId = `ap-worker-${runId}`;
  await db.insert(userTable).values({ id: userId, name: "AP Worker Test", email: `ap-worker-${runId}@test.local`, emailVerified: true, createdAt: new Date() });
  const [plan] = await db
    .insert(plans)
    .values({ name: `AP Worker Plan ${runId}`, price: 1000, durationDays: 30, modules: ["autoproduksi_production"], productLine: "autoproduksi" })
    .returning();
  planId = plan!.id;
  dataUsahaId = await createTestDataUsaha(userId);
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, planId, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86400000), dataUsahaId })
    .returning();
  subscriptionId = sub!.id;
});

afterAll(async () => {
  if (!subscriptionId) return;
  // Test "duplikat tapi satu non-aktif" lolos sampai Accurate → tersisa entry failed.
  await db.delete(autoproduksiProductionEntries).where(eq(autoproduksiProductionEntries.subscriptionId, subscriptionId));
  await db.delete(autoproduksiFormulas).where(eq(autoproduksiFormulas.subscriptionId, subscriptionId));
  await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
  await db.delete(plans).where(eq(plans.id, planId));
  await db.delete(dataUsaha).where(eq(dataUsaha.userId, userId));
  await db.delete(userTable).where(eq(userTable.id, userId));
});

const run = (name: string) => processAutoproduksiProductionImportRow(ctx, { userId, subscriptionId }, dataUsahaId, row(name), mapping);

describe("processAutoproduksiProductionImportRow — resolusi Formula", () => {
  test("tidak ditemukan → error 'tidak ditemukan'", async () => {
    await expect(run(`Tidak Ada ${runId}`)).rejects.toThrow("tidak ditemukan");
  });

  test("satu-satunya Formula non-aktif → error NON-AKTIF", async () => {
    await insertFormula(`Roti Nonaktif ${runId}`, false);
    await expect(run(`Roti Nonaktif ${runId}`)).rejects.toThrow("NON-AKTIF");
  });

  test("dua Formula aktif bernama sama → error ganda", async () => {
    await insertFormula(`Roti Ganda ${runId}`, true);
    await insertFormula(`Roti Ganda ${runId}`, true);
    await expect(run(`Roti Ganda ${runId}`)).rejects.toThrow("ganda");
  });

  test("duplikat tapi satu non-aktif → tidak lagi dianggap ganda (lolos resolusi)", async () => {
    await insertFormula(`Roti Dup ${runId}`, false);
    await insertFormula(`Roti Dup ${runId}`, true);
    // ctx kosong → gagal DI panggilan Accurate, artinya resolusi Formula sudah lolos.
    const err = await run(`Roti Dup ${runId}`).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("ganda");
    expect((err as Error).message).not.toContain("NON-AKTIF");
    expect((err as Error).message).not.toContain("tidak ditemukan");
  });

  test("nama Formula di DB berspasi ujung tetap ketemu", async () => {
    await insertFormula(`  Roti Spasi ${runId} `, false);
    await expect(run(`Roti Spasi ${runId}`)).rejects.toThrow("NON-AKTIF");
  });
});
