import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { auth } from "../lib/auth";
import { ordersRoute } from "./orders.route";
import { db } from "../lib/db";
import { plans, invoices, invoiceItems, orders, settings, user as userTable } from "../db/schema";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(ordersRoute);

const validPngBuffer = await sharp({
  create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } },
})
  .png()
  .toBuffer();

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Orders Test" }),
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

// § ketemu 2026-09-04 — `set: { value: settings.value }` adalah BUG
// (self-reference ke kolom LAMA, no-op) — pola yang sama pernah salah di
// script manual test Fase 15. WAJIB set value LITERAL per-key (loop
// terpisah, bukan 1 `.values([...])` array — tidak ada cara reference
// "excluded.value" per-baris yang beda lewat Drizzle single-call bulk
// upsert), supaya isi settings BENAR-BENAR ke-overwrite tiap test file
// lain (mis. settings.route.test.ts) juga menulis key global yang sama.
async function seedPaymentSettings() {
  const bankAccounts = [{ id: "bank-1", bankName: "BCA", accountNumber: "1234567890", accountName: "PT Facport" }];
  const qrisAccounts = [{ id: "qris-static-1", name: "QRIS Statis", imageUrl: "https://example.test/qris.png", isDynamic: false }];

  await db
    .insert(settings)
    .values({ key: "company.bankAccounts", value: bankAccounts, group: "billing" })
    .onConflictDoUpdate({ target: settings.key, set: { value: bankAccounts, updatedAt: new Date() } });
  await db
    .insert(settings)
    .values({ key: "company.qrisAccounts", value: qrisAccounts, group: "billing" })
    .onConflictDoUpdate({ target: settings.key, set: { value: qrisAccounts, updatedAt: new Date() } });
}

async function createOrderForUser(userId: string) {
  const [plan] = await db.insert(plans).values({ name: `Orders Test Plan ${runId}-${Math.random()}`, price: 150000, durationDays: 30, modules: ["sales_invoice"] }).returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: `INV/ORD/${runId}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      status: "unpaid",
      billToName: "Test User",
      subtotal: plan!.price,
      total: plan!.price,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    })
    .returning();
  await db.insert(invoiceItems).values({ invoiceId: invoice!.id, planId: plan!.id, moduleKey: "sales_invoice", label: plan!.name, price: plan!.price });
  const [order] = await db.insert(orders).values({ invoiceId: invoice!.id, uniqueCode: 321 }).returning();
  return { order: order!, invoice: invoice! };
}

describe("GET /orders/:id", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/orders/00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(401);
  });

  test("404 kalau order bukan milik user", async () => {
    const ownerEmail = `orders-get-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const { order } = await createOrderForUser(ownerId);

    const attackerEmail = `orders-get-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const res = await testApp.handle(new Request(`http://localhost/orders/${order.id}`, { headers: { cookie: attackerCookie } }));
    expect(res.status).toBe(404);
  });

  test("200 balikin order+invoice+amountDue+daftar rekening & QRIS (TANPA emvPayload)", async () => {
    await seedPaymentSettings();
    const email = `orders-get-ok-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order, invoice } = await createOrderForUser(userId);

    const res = await testApp.handle(new Request(`http://localhost/orders/${order.id}`, { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      amountDue: number;
      bankAccounts: { id: string }[];
      qrisAccounts: { id: string; emvPayload?: string }[];
    };
    expect(body.amountDue).toBe(invoice.total + 321);
    expect(body.bankAccounts.length).toBeGreaterThan(0);
    expect(body.qrisAccounts[0]!.emvPayload).toBeUndefined();
  });
});

describe("PATCH /orders/:id/method", () => {
  test("400 ACCOUNT_NOT_FOUND kalau accountRef tidak ada di settings", async () => {
    await seedPaymentSettings();
    const email = `orders-method-notfound-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    const res = await testApp.handle(
      new Request(`http://localhost/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "not-exist" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ACCOUNT_NOT_FOUND");
  });

  test("200 set method bank_transfer dengan accountRef valid", async () => {
    await seedPaymentSettings();
    const email = `orders-method-ok-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    const res = await testApp.handle(
      new Request(`http://localhost/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }),
      }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.method).toBe("bank_transfer");
    expect(updated!.bankAccountRef).toBe("bank-1");
  });
});

describe("GET /orders/:id/qris", () => {
  test("400 QRIS_NOT_SELECTED kalau method belum dipilih", async () => {
    const email = `orders-qris-notselected-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    const res = await testApp.handle(new Request(`http://localhost/orders/${order.id}/qris`, { headers: { cookie } }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("QRIS_NOT_SELECTED");
  });

  test("200 type=static kalau QRIS account tidak dinamis", async () => {
    await seedPaymentSettings();
    const email = `orders-qris-static-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    await testApp.handle(
      new Request(`http://localhost/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "qris", accountRef: "qris-static-1" }),
      }),
    );

    const res = await testApp.handle(new Request(`http://localhost/orders/${order.id}/qris`, { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; imageUrl: string };
    expect(body.type).toBe("static");
    expect(body.imageUrl).toBe("https://example.test/qris.png");
  });
});

describe("PATCH /orders/:id/proof", () => {
  test("400 METHOD_NOT_SELECTED kalau method belum dipilih", async () => {
    const email = `orders-proof-nomethod-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    const form = new FormData();
    form.append("file", new Blob([validPngBuffer], { type: "image/png" }), "bukti.png");
    form.append("transferDate", new Date().toISOString());

    const res = await testApp.handle(new Request(`http://localhost/orders/${order.id}/proof`, { method: "PATCH", headers: { cookie }, body: form }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("METHOD_NOT_SELECTED");
  });

  // § SKIP sengaja (BUKAN bug kode) — MinIO lokal di mesin sesi ini tidak
  // reachable dengan credential `apps/api/.env` (instance native homebrew
  // beda port/credential dari yang docker-compose.dev.yml harapkan,
  // dikonfirmasi manual: `S3Error SignatureDoesNotMatch`, koneksi BERHASIL
  // tersambung, cuma kredensial salah). Ditemukan & didiskusikan dengan
  // user 2026-09-07 — infra MinIO belum dibereskan di mesin ini, dicatat
  // sebagai Known Limitation Fase 16, BUKAN dianggap "selesai". Path
  // 400 (validasi, ownership) TETAP tercakup test lain di file ini yang
  // TIDAK butuh MinIO — cuma 2 test happy-path yang benar-benar upload
  // yang di-skip.
  test.skip("200 upload bukti — status jadi submitted, submittedAt terisi", async () => {
    await seedPaymentSettings();
    const email = `orders-proof-ok-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    await testApp.handle(
      new Request(`http://localhost/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }),
      }),
    );

    const form = new FormData();
    form.append("file", new Blob([validPngBuffer], { type: "image/png" }), "bukti.png");
    form.append("transferDate", new Date().toISOString());
    form.append("payerNote", "Transfer dari rekening pribadi");

    const res = await testApp.handle(new Request(`http://localhost/orders/${order.id}/proof`, { method: "PATCH", headers: { cookie }, body: form }));
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.status).toBe("submitted");
    expect(updated!.proofUrl).toBeTruthy();
    expect(updated!.submittedAt).toBeTruthy();
  });

  // § SKIP — sama alasan test di atas, butuh upload PERTAMA berhasil
  // dulu (MinIO) sebelum bisa tes upload KEDUA ditolak.
  test.skip("400 ORDER_NOT_EDITABLE kalau upload bukti lagi setelah status submitted", async () => {
    await seedPaymentSettings();
    const email = `orders-proof-twice-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const { order } = await createOrderForUser(userId);

    await testApp.handle(
      new Request(`http://localhost/orders/${order.id}/method`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }),
      }),
    );

    const form1 = new FormData();
    form1.append("file", new Blob([validPngBuffer], { type: "image/png" }), "bukti.png");
    form1.append("transferDate", new Date().toISOString());
    await testApp.handle(new Request(`http://localhost/orders/${order.id}/proof`, { method: "PATCH", headers: { cookie }, body: form1 }));

    const form2 = new FormData();
    form2.append("file", new Blob([validPngBuffer], { type: "image/png" }), "bukti2.png");
    form2.append("transferDate", new Date().toISOString());
    const res2 = await testApp.handle(new Request(`http://localhost/orders/${order.id}/proof`, { method: "PATCH", headers: { cookie }, body: form2 }));
    expect(res2.status).toBe(400);
    const body = (await res2.json()) as { code: string };
    expect(body.code).toBe("ORDER_NOT_EDITABLE");
  });
});
