import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches } from "../db/schema";
import { vendorPayableAccountImportRoute } from "./vendor-payable-account-import.route";
import { generateTemplateBuffer } from "../lib/excel";

// § pola sama purchase-invoice-import.route.test.ts — route ini juga gabung
// permission + moduleAccess (Dua Lapis Gate).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(vendorPayableAccountImportRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Vendor Import Test" }),
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
    .values({ name: `Vendor Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["pembelian"] })
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

describe("GET /vendor/payable-account/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/vendor/payable-account/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create", async () => {
    const email = `vpa-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/template", { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /vendor/payable-account/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Vendor No", required: true, example: "V-0001", description: "test" },
      { column: "Akun Hutang", required: true, example: "2-10100", description: "test" },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "test.xlsx",
    );
    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/upload", { method: "POST", body: form }),
    );
    expect(res.status).toBe(401);
  });
});

describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /vendor/payable-account/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const ownerEmail = `vpa-owner-${runId}@test.local`;
    const attackerEmail = `vpa-attacker-${runId}@test.local`;
    const owner = await createProvisionedUser(ownerEmail);
    const attacker = await createProvisionedUser(attackerEmail);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, {
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/retry`, {
        method: "POST",
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(retryRes.status).toBe(404);

    const ownerRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, { headers: { cookie: owner.cookie } }),
    );
    expect(ownerRes.status).toBe(200);
  });
});

describe("POST /vendor/payable-account/import/:batchId/confirm — validasi mapping", () => {
  test("400 MISSING_REQUIRED_FIELDS kalau kolom Akun Hutang belum di-mapping", async () => {
    const owner = await createProvisionedUser(`vpa-confirm-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Vendor No": "vendorNo" } }), // payableAccountNo sengaja tidak di-mapping
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(body.fields).toContain("payableAccountNo");
  });
});

describe("GET /vendor/payable-account/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/vendor/payable-account/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu, dibatasi ?limit", async () => {
    const owner = await createProvisionedUser(`vpa-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`vpa-list-other-${runId}@test.local`);

    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "vendor_payable_account",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx", "batch-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import?limit=2", { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[] };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3.xlsx", "batch-2.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
  });
});
