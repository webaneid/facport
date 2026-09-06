import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { publicOrdersRoute } from "./orders.route";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { plans, invoices, invoiceItems, orders, settings, user as userTable } from "../../db/schema";

// § ketemu 2026-09-06 — `seedPaymentSettings()` di bawah upsert LANGSUNG
// ke row settings GLOBAL (`company.bankAccounts`/`company.qrisAccounts`,
// SATU baris dipakai bersama SELURUH DB) tanpa pernah mengembalikannya
// — QRIS/rekening ASLI admin ke-timpa data dummy ("BCA"/"QRIS Statis")
// setiap file test ini jalan (kejadian nyata, § settings.route.test.ts
// komentar sama). Snapshot SEBELUM test manapun jalan, kembalikan di
// `afterAll` (jalan walau ada test yang gagal).
const PAYMENT_SETTINGS_KEYS = ["company.bankAccounts", "company.qrisAccounts"] as const;
let originalPaymentSettingsSnapshot: Map<string, unknown>;

beforeAll(async () => {
  const rows = await db.select().from(settings).where(inArray(settings.key, [...PAYMENT_SETTINGS_KEYS]));
  originalPaymentSettingsSnapshot = new Map(rows.map((r) => [r.key, r.value]));
});

afterAll(async () => {
  for (const key of PAYMENT_SETTINGS_KEYS) {
    if (originalPaymentSettingsSnapshot.has(key)) {
      await db.update(settings).set({ value: originalPaymentSettingsSnapshot.get(key) }).where(eq(settings.key, key));
    } else {
      await db.delete(settings).where(eq(settings.key, key));
    }
  }
});

// § Fase 27, ADR-0025 — link pembayaran PUBLIK, SENGAJA TANPA cookie/sesi
// sama sekali di SEMUA request test file ini (itu justru inti yang diuji
// — siapa pun yang tahu `order.id` bisa akses, tidak perlu login).
// `auth.handler` di-mount HANYA supaya test bisa bikin user pemilik order
// via sign-up biasa (pola sama semua test lain) — TIDAK dipakai buat
// login/cookie di request publik manapun di file ini.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(publicOrdersRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Klien Publik" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

const validPngBuffer = await sharp({
  create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } },
})
  .png()
  .toBuffer();

async function seedPaymentSettings() {
  const bankAccounts = [{ id: "bank-1", bankName: "BCA", accountNumber: "1234567890", accountName: "PT Facport" }];
  const qrisAccounts = [{ id: "qris-static-1", name: "QRIS Statis", imageUrl: "https://example.test/qris-public.png", isDynamic: false }];

  await db
    .insert(settings)
    .values({ key: "company.bankAccounts", value: bankAccounts, group: "billing" })
    .onConflictDoUpdate({ target: settings.key, set: { value: bankAccounts, updatedAt: new Date() } });
  await db
    .insert(settings)
    .values({ key: "company.qrisAccounts", value: qrisAccounts, group: "billing" })
    .onConflictDoUpdate({ target: settings.key, set: { value: qrisAccounts, updatedAt: new Date() } });
}

async function createOrderForNewUser() {
  const email = `public-orders-owner-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const ownerId = await signUp(email);
  const [plan] = await db.insert(plans).values({ name: `Public Orders Plan ${runId}-${Math.random()}`, price: 150000, durationDays: 30, modules: ["sales_invoice"] }).returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: `INV/PUB/${runId}-${Math.random().toString(36).slice(2, 8)}`,
      userId: ownerId,
      status: "unpaid",
      billToName: "Klien Publik",
      subtotal: plan!.price,
      total: plan!.price,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    })
    .returning();
  await db.insert(invoiceItems).values({ invoiceId: invoice!.id, planId: plan!.id, moduleKey: "sales_invoice", label: plan!.name, price: plan!.price });
  const [order] = await db.insert(orders).values({ invoiceId: invoice!.id, uniqueCode: 654 }).returning();
  return { order: order!, invoice: invoice! };
}

describe("GET /public/orders/:id (TANPA login)", () => {
  test("404 kalau order tidak ada", async () => {
    const res = await testApp.handle(new Request("http://localhost/public/orders/00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });

  test("200 balikin order+invoice+amountDue TANPA cookie sama sekali — dan TIDAK bocorkan confirmedBy/rejectedBy/proofUrl", async () => {
    await seedPaymentSettings();
    const { order, invoice } = await createOrderForNewUser();

    const res = await testApp.handle(new Request(`http://localhost/public/orders/${order.id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.amountDue as number)).toBe(invoice.total + 654);
    const orderBody = body.order as Record<string, unknown>;
    expect(orderBody.confirmedBy).toBeUndefined();
    expect(orderBody.rejectedBy).toBeUndefined();
    expect(orderBody.proofUrl).toBeUndefined();
    const qrisAccounts = body.qrisAccounts as { emvPayload?: string }[];
    expect(qrisAccounts[0]!.emvPayload).toBeUndefined();
  });
});

describe("PATCH /public/orders/:id/method (TANPA login)", () => {
  test("400 ACCOUNT_NOT_FOUND kalau accountRef tidak ada", async () => {
    await seedPaymentSettings();
    const { order } = await createOrderForNewUser();

    const res = await testApp.handle(
      new Request(`http://localhost/public/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "not-exist" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ACCOUNT_NOT_FOUND");
  });

  test("200 set method bank_transfer TANPA cookie", async () => {
    await seedPaymentSettings();
    const { order } = await createOrderForNewUser();

    const res = await testApp.handle(
      new Request(`http://localhost/public/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }),
      }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.method).toBe("bank_transfer");
    expect(updated!.bankAccountRef).toBe("bank-1");
  });

  test("400 ORDER_NOT_EDITABLE kalau order sudah paid", async () => {
    await seedPaymentSettings();
    const { order } = await createOrderForNewUser();
    await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));

    const res = await testApp.handle(
      new Request(`http://localhost/public/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ORDER_NOT_EDITABLE");
  });
});

describe("GET /public/orders/:id/qris (TANPA login)", () => {
  test("400 QRIS_NOT_SELECTED kalau method belum dipilih", async () => {
    const { order } = await createOrderForNewUser();
    const res = await testApp.handle(new Request(`http://localhost/public/orders/${order.id}/qris`));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("QRIS_NOT_SELECTED");
  });

  test("200 type=static kalau QRIS account tidak dinamis", async () => {
    await seedPaymentSettings();
    const { order } = await createOrderForNewUser();

    await testApp.handle(
      new Request(`http://localhost/public/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "qris", accountRef: "qris-static-1" }),
      }),
    );

    const res = await testApp.handle(new Request(`http://localhost/public/orders/${order.id}/qris`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; imageUrl: string };
    expect(body.type).toBe("static");
    expect(body.imageUrl).toBe("https://example.test/qris-public.png");
  });
});

describe("PATCH /public/orders/:id/proof (TANPA login)", () => {
  test("400 METHOD_NOT_SELECTED kalau method belum dipilih", async () => {
    const { order } = await createOrderForNewUser();

    const form = new FormData();
    form.append("file", new Blob([validPngBuffer], { type: "image/png" }), "bukti.png");
    form.append("transferDate", new Date().toISOString());

    const res = await testApp.handle(new Request(`http://localhost/public/orders/${order.id}/proof`, { method: "PATCH", body: form }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("METHOD_NOT_SELECTED");
  });

  test("200 upload bukti TANPA cookie — status jadi submitted", async () => {
    await seedPaymentSettings();
    const { order } = await createOrderForNewUser();

    await testApp.handle(
      new Request(`http://localhost/public/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }),
      }),
    );

    const form = new FormData();
    form.append("file", new Blob([validPngBuffer], { type: "image/png" }), "bukti.png");
    form.append("transferDate", new Date().toISOString());

    const res = await testApp.handle(new Request(`http://localhost/public/orders/${order.id}/proof`, { method: "PATCH", body: form }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.status).toBe("submitted");
  });
});
