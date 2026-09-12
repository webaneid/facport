import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminInvoicesRoute } from "./invoices.route";
import { db } from "../../lib/db";
import { plans, invoices, invoiceItems, orders, roles, userRoles, permissions, rolePermissions, user as userTable, dataUsaha } from "../../db/schema";
import { createTestDataUsaha } from "../../lib/test-fixtures";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminInvoicesRoute);
// § varchar(30) di `invoices.invoiceNumber` — counter pendek per-test.
let invoiceCounter = 0;
function nextInvoiceNumber() {
  invoiceCounter += 1;
  return `INV/AT/${runId}-${invoiceCounter}`;
}

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Invoice Test" }),
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

async function assignRole(userId: string, roleName: string) {
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  if (!role) throw new Error(`Role ${roleName} belum ke-seed`);
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
}

async function insertInvoiceWithItems(userId: string, label: string) {
  const [plan] = await db.insert(plans).values({ name: label, price: 100000, durationDays: 30, modules: ["purchase_invoice"] }).returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: nextInvoiceNumber(),
      userId,
      status: "unpaid",
      billToName: label,
      subtotal: 100000,
      total: 100000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  await db.insert(invoiceItems).values({ invoiceId: invoice!.id, planId: plan!.id, moduleKey: "purchase_invoice", label, price: 100000 });
  return invoice!;
}

describe("GET /admin/invoices", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/admin/invoices"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi bukan admin (tidak punya permission invoices.view)", async () => {
    const email = `admin-inv-forbidden-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/admin/invoices", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  test("200 balikin invoice LINTAS USER (bukan cuma milik admin sendiri)", async () => {
    const adminEmail = `admin-inv-ok-${runId}@test.local`;
    const adminId = await signUp(adminEmail);
    await assignRole(adminId, "admin");
    const adminCookie = await signIn(adminEmail);

    const customerEmail = `admin-inv-customer-${runId}@test.local`;
    const customerId = await signUp(customerEmail);
    const customerInvoice = await insertInvoiceWithItems(customerId, `Customer Invoice ${runId}`);

    const res = await testApp.handle(new Request("http://localhost/admin/invoices", { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoices: { id: string; items: { label: string }[] }[] };
    const found = body.invoices.find((i) => i.id === customerInvoice.id);
    expect(found).toBeDefined();
    expect(found!.items.length).toBe(1);
  });

  // § Fase 94 (2026-09-10) — `orderStatus`/`hasProof` BARU, dipakai
  // dialog "Detail Invoice" (admin) untuk tampilkan status pembayaran
  // granular (bukan cuma invoice.status yang kasar) + tombol lihat
  // bukti transfer (cuma muncul kalau `hasProof: true`).
  test("200 — orderStatus & hasProof akurat: null/false kalau belum ada order, terisi kalau ada", async () => {
    const adminEmail = `admin-inv-orderstatus-${runId}@test.local`;
    const adminId = await signUp(adminEmail);
    await assignRole(adminId, "admin");
    const adminCookie = await signIn(adminEmail);

    const customerId = await signUp(`admin-inv-orderstatus-customer-${runId}@test.local`);
    const invoiceNoOrder = await insertInvoiceWithItems(customerId, `No Order Invoice ${runId}`);
    const invoiceWithOrder = await insertInvoiceWithItems(customerId, `With Order Invoice ${runId}`);
    await db.insert(orders).values({
      invoiceId: invoiceWithOrder.id,
      uniqueCode: 123,
      method: "bank_transfer",
      bankAccountRef: "bank-1",
      status: "submitted",
      submittedAt: new Date(),
      proofUrl: "orders/fake/fake.webp",
    });

    const res = await testApp.handle(new Request("http://localhost/admin/invoices", { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoices: { id: string; orderStatus: string | null; hasProof: boolean }[] };

    const noOrder = body.invoices.find((i) => i.id === invoiceNoOrder.id);
    expect(noOrder?.orderStatus).toBeNull();
    expect(noOrder?.hasProof).toBe(false);

    const withOrder = body.invoices.find((i) => i.id === invoiceWithOrder.id);
    expect(withOrder?.orderStatus).toBe("submitted");
    expect(withOrder?.hasProof).toBe(true);
  });
});

// § Fase 27, ADR-0025 — admin bikin invoice BARU untuk user EXISTING
// (beda dari Fase 18 "Kirim Invoice" yang cuma terjadi bersamaan
// pembuatan user baru). Permission TERPISAH `invoices.manage`.
describe("POST /admin/invoices", () => {
  async function makeAdmin() {
    const email = `admin-inv-post-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const adminId = await signUp(email);
    await assignRole(adminId, "admin");
    return signIn(email);
  }

  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "x", planIds: ["00000000-0000-0000-0000-000000000000"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission invoices.manage", async () => {
    const email = `admin-inv-post-forbidden-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "x", planIds: ["00000000-0000-0000-0000-000000000000"] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("403 kalau caller punya invoices.view TAPI TIDAK invoices.manage (view != manage)", async () => {
    const [viewPerm] = await db.select().from(permissions).where(eq(permissions.key, "invoices.view"));
    if (!viewPerm) throw new Error("permission invoices.view belum ke-seed");
    const [customRole] = await db.insert(roles).values({ name: `invoice-viewer-${runId}`, isSystem: false }).returning();
    await db.insert(rolePermissions).values({ roleId: customRole!.id, permissionId: viewPerm.id });

    const email = `admin-inv-post-viewonly-${runId}@test.local`;
    const viewerId = await signUp(email);
    await db.insert(userRoles).values({ userId: viewerId, roleId: customRole!.id });
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: viewerId, planIds: ["00000000-0000-0000-0000-000000000000"] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("404 USER_NOT_FOUND kalau userId tidak ada", async () => {
    const adminCookie = await makeAdmin();
    const [plan] = await db.insert(plans).values({ name: `Inv Post Plan ${runId}`, price: 50000, durationDays: 30, modules: ["sales_invoice"] }).returning();

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "00000000-0000-0000-0000-000000000000", planIds: [plan!.id] }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("USER_NOT_FOUND");
  });

  test("404 PLAN_NOT_FOUND kalau salah satu planId tidak ada", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-inv-post-badplan-${runId}@test.local`);

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: customerId, planIds: ["00000000-0000-0000-0000-000000000000"] }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  test("400 PLAN_NOT_ACTIVE kalau plan sudah nonaktif", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-inv-post-inactive-${runId}@test.local`);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Inv Post Inactive ${runId}`, price: 50000, durationDays: 30, modules: ["sales_invoice"], isActive: false })
      .returning();

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: customerId, planIds: [plan!.id] }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_ACTIVE");
  });

  test("200 bikin invoice+order MULTI-PLAN untuk user existing, billToName dari user.name", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-inv-post-ok-${runId}@test.local`);
    await db.update(userTable).set({ name: "Pelanggan Existing" }).where(eq(userTable.id, customerId));

    const [planA] = await db.insert(plans).values({ name: `Inv Post A ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_invoice"] }).returning();
    const [planB] = await db.insert(plans).values({ name: `Inv Post B ${runId}`, price: 200000, durationDays: 365, modules: ["sales_invoice"] }).returning();

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: customerId, planIds: [planA!.id, planB!.id] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoiceId: string; orderId: string; subtotal: number; amountDue: number };
    expect(body.subtotal).toBe(300000);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(invoice!.userId).toBe(customerId);
    expect(invoice!.billToName).toBe("Pelanggan Existing");
    expect(invoice!.status).toBe("unpaid");
    expect(invoice!.total).toBe(300000);

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, body.invoiceId));
    expect(items.length).toBe(2);

    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
    expect(order!.status).toBe("pending");
    expect(body.amountDue).toBe(300000 + order!.uniqueCode);
  });

  // § diminta user 2026-09-12 — gap ditemukan saat re-audit: endpoint ini
  // sebelumnya SELALU `getOrCreateDefaultDataUsaha`, mengabaikan customer
  // yang punya BANYAK Data Usaha (kasus normal sejak Fase 107) — admin
  // tidak bisa targetkan Data Usaha spesifik, invoice selalu nyasar ke
  // "Data Usaha Utama".
  test("200 — dataUsahaId eksplisit dipakai (order nempel ke Data Usaha yang benar, BUKAN default)", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-inv-post-du-${runId}@test.local`);
    const targetDataUsahaId = await createTestDataUsaha(customerId, `DU Target Invoice ${runId}`);
    const [plan] = await db.insert(plans).values({ name: `Inv Post DU Plan ${runId}`, price: 50000, durationDays: 30, modules: ["purchase_invoice"] }).returning();

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: customerId, planIds: [plan!.id], dataUsahaId: targetDataUsahaId }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string };
    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
    expect(order!.dataUsahaId).toBe(targetDataUsahaId);

    // § tidak boleh diam-diam bikin "Data Usaha Utama" tambahan begitu
    // dataUsahaId eksplisit dikirim.
    const defaultRows = await db.select().from(dataUsaha).where(eq(dataUsaha.userId, customerId));
    expect(defaultRows.some((d) => d.name === "Data Usaha Utama")).toBe(false);
  });

  test("404 DATA_USAHA_NOT_FOUND kalau dataUsahaId BUKAN milik userId target (cegah admin tempel invoice ke Data Usaha user lain)", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-inv-post-du-owner-${runId}@test.local`);
    const otherUserId = await signUp(`admin-inv-post-du-other-${runId}@test.local`);
    const otherDataUsahaId = await createTestDataUsaha(otherUserId, `DU Other ${runId}`);
    const [plan] = await db.insert(plans).values({ name: `Inv Post DU Wrong Plan ${runId}`, price: 50000, durationDays: 30, modules: ["purchase_invoice"] }).returning();

    const res = await testApp.handle(
      new Request("http://localhost/admin/invoices", {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: customerId, planIds: [plan!.id], dataUsahaId: otherDataUsahaId }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("DATA_USAHA_NOT_FOUND");
  });
});
