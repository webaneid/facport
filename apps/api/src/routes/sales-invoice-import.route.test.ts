import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches } from "../db/schema";
import { salesInvoiceImportRoute } from "./sales-invoice-import.route";
import { generateTemplateBuffer } from "../lib/excel";

// § Fase 13 — mirror 1:1 `purchase-invoice-import.route.test.ts` (modul
// "penjualan"/"sales_invoice").
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(salesInvoiceImportRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "SI Import Test" }),
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

async function createProvisionedUser(email: string) {
  const userId = await signUp(email);
  const cookie = await signIn(email);

  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

  const [plan] = await db
    .insert(plans)
    .values({ name: `SI Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["penjualan"] })
    .returning();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  return { userId, cookie, subscriptionId: subscription!.id };
}

describe("GET /sales-invoice/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/sales-invoice/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create (role belum di-assign)", async () => {
    const email = `si-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/sales-invoice/import/template", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});

describe("POST /sales-invoice/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Customer No", required: true, example: "C-0001", description: "test" },
      { column: "Item No", required: true, example: "BRG-001", description: "test" },
    ]);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "test.xlsx");
    const res = await testApp.handle(new Request("http://localhost/sales-invoice/import/upload", { method: "POST", body: form }));
    expect(res.status).toBe(401);
  });
});

describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /sales-invoice/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const ownerEmail = `si-owner-${runId}@test.local`;
    const attackerEmail = `si-attacker-${runId}@test.local`;
    const owner = await createProvisionedUser(ownerEmail);
    const attacker = await createProvisionedUser(attackerEmail);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_invoice",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(new Request(`http://localhost/sales-invoice/import/${batch!.id}`, { headers: { cookie: attacker.cookie } }));
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/sales-invoice/import/${batch!.id}/retry`, {
        method: "POST",
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(retryRes.status).toBe(404);

    const ownerRes = await testApp.handle(new Request(`http://localhost/sales-invoice/import/${batch!.id}`, { headers: { cookie: owner.cookie } }));
    expect(ownerRes.status).toBe(200);
  });
});

describe("GET /sales-invoice/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/sales-invoice/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu, dibatasi ?limit", async () => {
    const owner = await createProvisionedUser(`si-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`si-list-other-${runId}@test.local`);

    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "sales_invoice",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx", "batch-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_invoice",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(new Request("http://localhost/sales-invoice/import?limit=2", { headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[] };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3.xlsx", "batch-2.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
  });
});
