import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { db } from "../lib/db";
import { plans } from "../db/schema";
import { plansRoute } from "./plans.route";
import { MODULE_CATALOG } from "../lib/module-catalog";

// § diminta user 2026-09-27 — endpoint ini SEBELUMNYA tidak punya ORDER BY
// sama sekali (urutan balikan = urutan insert row di DB, TIDAK match
// urutan bisnis yang diinginkan klien untuk sidebar/`/subscribe`/landing,
// § `plans.route.ts` komentar lengkap). Test ini pastikan sort barunya
// BENAR-BENAR mengikuti `MODULE_CATALOG` — insert 3 plan SENGAJA dengan
// urutan INSERT terbalik dari urutan katalog, assert balikan endpoint
// tetap ikut urutan katalog (bukan urutan insert).
const testApp = new Elysia().use(plansRoute);
const runId = Date.now();

describe("GET /plans — urutan balikan ikut MODULE_CATALOG (§ audit 2026-09-27, permintaan urutan tampil)", () => {
  test("plan diinsert TERBALIK dari urutan katalog tetap dibalikin SESUAI urutan katalog", async () => {
    const facportKeys = MODULE_CATALOG.filter((m) => m.productLine === "facport").map((m) => m.key);
    // § 3 modul yang JAUH berjauhan posisinya di katalog (Cash & Bank,
    // General Ledger, Manufacture) — kalau sort-nya salah/tidak jalan,
    // urutan balikan pasti kepakai urutan insert (kebalik dari yang di-assert).
    const keyA = "finished_good_slip"; // Manufacture, index besar
    const keyB = "journal_voucher"; // General Ledger, index kecil
    const keyC = "other_payment"; // Cash & Bank, index PALING kecil
    expect(facportKeys.indexOf(keyC)).toBeLessThan(facportKeys.indexOf(keyB));
    expect(facportKeys.indexOf(keyB)).toBeLessThan(facportKeys.indexOf(keyA));

    // Insert SENGAJA urutan terbalik: keyA dulu, keyC terakhir. § dev DB
    // ini SHARED lintas test run (banyak plan lama dengan module key yang
    // SAMA persis dari run sebelumnya, § feedback_dev_db_test_cleanup) —
    // JANGAN filter balikan endpoint by module key (bisa kena data lama),
    // filter by ID hasil insert `.returning()` ini SENDIRI.
    const inserted = await db
      .insert(plans)
      .values([
        { name: `Plan Sort Test A ${runId}`, price: 10000, durationDays: 30, modules: [keyA], isActive: true },
        { name: `Plan Sort Test B ${runId}`, price: 10000, durationDays: 30, modules: [keyB], isActive: true },
        { name: `Plan Sort Test C ${runId}`, price: 10000, durationDays: 30, modules: [keyC], isActive: true },
      ])
      .returning({ id: plans.id });
    const ourIds = new Set(inserted.map((p) => p.id));

    const res = await testApp.handle(new Request("http://localhost/plans"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; modules: string[] }[];
    const ourRows = body.filter((p) => ourIds.has(p.id));
    expect(ourRows).toHaveLength(3);
    expect(ourRows.map((p) => p.modules[0])).toEqual([keyC, keyB, keyA]);
  });

  test("plan tanpa module yang dikenal MODULE_CATALOG tidak bikin endpoint error (jatuh ke akhir)", async () => {
    const [unknownPlan] = await db
      .insert(plans)
      .values({ name: `Plan Unknown Module ${runId}`, price: 5000, durationDays: 30, modules: ["module_yang_tidak_ada_di_katalog"], isActive: true })
      .returning();

    const res = await testApp.handle(new Request("http://localhost/plans"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body.some((p) => p.id === unknownPlan!.id)).toBe(true);
  });
});
