import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches } from "../db/schema";
import { purchaseInvoiceImportRoute } from "./purchase-invoice-import.route";
import { generateTemplateBuffer } from "../lib/excel";

// § Dua Lapis Gate (architecture-auth.md) — route ini PERTAMA yang gabung
// dua macro (`permission` dari permissionPlugin + `moduleAccess` dari
// subscriptionGatePlugin) sekaligus, jadi WAJIB ada test khusus yang
// verifikasi kombinasi ini benar-benar jalan (belum pernah dites Fase 01).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(purchaseInvoiceImportRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "PI Import Test" }),
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

// User siap pakai: role customer (punya import.create) + subscription aktif
// modul "pembelian" — dipakai test ownership di bawah, bukan test gate itu
// sendiri (sudah dicover describe block lain).
async function createProvisionedUser(email: string) {
  const userId = await signUp(email);
  const cookie = await signIn(email);

  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

  const [plan] = await db
    .insert(plans)
    .values({ name: `PI Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
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

describe("GET /purchase-invoice/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/purchase-invoice/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create (role belum di-assign)", async () => {
    const email = `pi-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/purchase-invoice/import/template", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});

describe("POST /purchase-invoice/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Vendor No", required: true, example: "V-0001", description: "test" },
      { column: "Item No", required: true, example: "BRG-001", description: "test" },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "test.xlsx",
    );
    const res = await testApp.handle(new Request("http://localhost/purchase-invoice/import/upload", { method: "POST", body: form }));
    expect(res.status).toBe(401);
  });
});

// § security review Fase 02 (Low) — ownership check sudah benar via review
// kode manual, test ini yang eksplisit MEMBUKTIKANNYA lewat 2 user asli.
describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /purchase-invoice/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const ownerEmail = `pi-owner-${runId}@test.local`;
    const attackerEmail = `pi-attacker-${runId}@test.local`;
    const owner = await createProvisionedUser(ownerEmail);
    const attacker = await createProvisionedUser(attackerEmail);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "purchase_invoice",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(
      new Request(`http://localhost/purchase-invoice/import/${batch!.id}`, { headers: { cookie: attacker.cookie } }),
    );
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/purchase-invoice/import/${batch!.id}/retry`, {
        method: "POST",
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(retryRes.status).toBe(404);

    // Pemilik ASLI tetap bisa akses batch-nya sendiri (kontrol negatif).
    const ownerRes = await testApp.handle(
      new Request(`http://localhost/purchase-invoice/import/${batch!.id}`, { headers: { cookie: owner.cookie } }),
    );
    expect(ownerRes.status).toBe(200);
  });
});

// § phase-03-dashboard-pelanggan.md M3 — kartu "Import Terakhir" di dashboard.
describe("GET /purchase-invoice/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/purchase-invoice/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu, dibatasi ?limit", async () => {
    const owner = await createProvisionedUser(`pi-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`pi-list-other-${runId}@test.local`);

    // Batch milik user lain — TIDAK boleh muncul di hasil owner.
    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "purchase_invoice",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx", "batch-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "purchase_invoice",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(
      new Request("http://localhost/purchase-invoice/import?limit=2", { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[] };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3.xlsx", "batch-2.xlsx"]); // terbaru dulu
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
  });
});
