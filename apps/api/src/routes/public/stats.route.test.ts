import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { publicStatsRoute } from "./stats.route";
import { db } from "../../lib/db";
import {
  user as userTable,
  roles,
  userRoles,
  subscriptions,
  plans,
  importBatches,
  importBatchRows,
  settings,
} from "../../db/schema";
import { MANUAL_INPUT_SECONDS_SETTING_KEY } from "../../lib/manual-input-estimate";
import { createTestDataUsaha } from "../../lib/test-fixtures";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(publicStatsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Public Stats Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

async function assignRole(userId: string, roleName: string) {
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  if (!role) throw new Error(`Role ${roleName} belum ke-seed`);
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
}

describe("GET /public/stats", () => {
  test("200 TANPA login (endpoint publik)", async () => {
    const res = await testApp.handle(new Request("http://localhost/public/stats"));
    expect(res.status).toBe(200);
  });

  test("customerCount HANYA hitung role customer, BUKAN admin/staff", async () => {
    const customerId = await signUp(`public-stats-customer-${runId}@test.local`);
    await assignRole(customerId, "customer");
    const adminId = await signUp(`public-stats-admin-${runId}@test.local`);
    await assignRole(adminId, "admin");

    const before = await testApp.handle(new Request("http://localhost/public/stats"));
    const beforeBody = (await before.json()) as { customerCount: number };

    const secondCustomerId = await signUp(`public-stats-customer2-${runId}@test.local`);
    await assignRole(secondCustomerId, "customer");

    const after = await testApp.handle(new Request("http://localhost/public/stats"));
    const afterBody = (await after.json()) as { customerCount: number };

    // § nambah 1 customer HARUS nambah count persis 1 — nambah 1 admin (di
    // atas) TIDAK BOLEH ikut menaikkan angka ini.
    expect(afterBody.customerCount).toBe(beforeBody.customerCount + 1);
  });

  test("successfulRowCount cuma hitung baris status=success, exclude failed/pending/cancelled", async () => {
    await db
      .insert(settings)
      .values({ key: MANUAL_INPUT_SECONDS_SETTING_KEY, value: 30, group: "data" })
      .onConflictDoUpdate({ target: settings.key, set: { value: 30 } });

    const userId = await signUp(`public-stats-rows-${runId}@test.local`);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Public Stats Plan ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();
    const [batch] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId: sub!.id, module: "purchase_invoice", fileName: "test.xlsx", totalRows: 3, status: "completed_with_errors" })
      .returning();

    const before = await testApp.handle(new Request("http://localhost/public/stats"));
    const beforeBody = (await before.json()) as { successfulRowCount: number; estimatedTimeSavedSeconds: number };

    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success" });
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 2, rawData: {}, status: "failed" });
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 3, rawData: {}, status: "cancelled" });

    const after = await testApp.handle(new Request("http://localhost/public/stats"));
    const afterBody = (await after.json()) as { successfulRowCount: number; estimatedTimeSavedSeconds: number };

    expect(afterBody.successfulRowCount).toBe(beforeBody.successfulRowCount + 1); // cuma 1 baris "success"
    expect(afterBody.estimatedTimeSavedSeconds).toBe(afterBody.successfulRowCount * 30);
  });
});
