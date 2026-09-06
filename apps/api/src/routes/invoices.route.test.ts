import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { invoicesRoute } from "./invoices.route";
import { db } from "../lib/db";
import { plans, invoices, invoiceItems, roles, userRoles, user as userTable } from "../db/schema";

// § Fase 15, ADR-0021 — belum ada jalur checkout sungguhan yang bikin
// invoice (Fase 16-17), jadi test ini insert invoice+items LANGSUNG ke DB
// (bukan lewat endpoint create — tidak ada), lalu verifikasi endpoint BACA
// (`GET /me/invoices`, `GET /invoices/:id/pdf`) berperilaku benar,
// termasuk ownership ganda (milik sendiri ATAU admin).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(invoicesRoute);
// § varchar(30) di `invoices.invoiceNumber` — counter pendek per-test,
// BUKAN pakai `runId` mentah berulang (beda test dalam file yang sama
// bakal tabrakan unique constraint kalau invoiceNumber sama persis).
let invoiceCounter = 0;
function nextInvoiceNumber() {
  invoiceCounter += 1;
  return `INV/T/${runId}-${invoiceCounter}`;
}

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Invoice Test" }),
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

async function insertInvoiceWithItems(userId: string) {
  const [plan] = await db
    .insert(plans)
    .values({ name: `Sales Invoice Test ${runId}`, price: 150000, durationDays: 30, modules: ["sales_invoice"] })
    .returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: nextInvoiceNumber(),
      userId,
      status: "unpaid",
      billToName: "PT Test Invoice",
      billToAddress: "Jl. Test No. 1",
      subtotal: 150000,
      total: 150000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  await db.insert(invoiceItems).values({
    invoiceId: invoice!.id,
    planId: plan!.id,
    moduleKey: "sales_invoice",
    label: plan!.name,
    price: plan!.price,
  });
  return invoice!;
}

describe("GET /me/invoices", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/invoices"));
    expect(res.status).toBe(401);
  });

  test("200 balikin invoice milik sendiri SAJA (beserta items), bukan milik user lain", async () => {
    const ownerEmail = `inv-me-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const invoice = await insertInvoiceWithItems(ownerId);

    const otherEmail = `inv-me-other-${runId}@test.local`;
    const otherId = await signUp(otherEmail);
    await insertInvoiceWithItems(otherId); // invoice user lain, TIDAK boleh ikut ter-return

    const res = await testApp.handle(new Request("http://localhost/me/invoices", { headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoices: { id: string; items: { label: string }[] }[] };
    expect(body.invoices.length).toBe(1);
    expect(body.invoices[0]!.id).toBe(invoice.id);
    expect(body.invoices[0]!.items.length).toBe(1);
  });
});

describe("GET /invoices/:id/pdf", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/invoices/00000000-0000-0000-0000-000000000000/pdf"));
    expect(res.status).toBe(401);
  });

  test("404 INVOICE_NOT_FOUND kalau id tidak ada", async () => {
    const email = `inv-pdf-notfound-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/invoices/00000000-0000-0000-0000-000000000000/pdf", { headers: { cookie } }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVOICE_NOT_FOUND");
  });

  test("200 application/pdf (PDF valid) kalau invoice milik sendiri", async () => {
    const email = `inv-pdf-owner-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const invoice = await insertInvoiceWithItems(userId);

    const res = await testApp.handle(new Request(`http://localhost/invoices/${invoice.id}/pdf`, { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    // § magic bytes "%PDF-" — verifikasi FILE PDF SUNGGUHAN, bukan cuma
    // header Content-Type yang benar (§ SOP Checklist Fase 15).
    const magic = new TextDecoder().decode(buf.slice(0, 5));
    expect(magic).toBe("%PDF-");
  });

  test("404 INVOICE_NOT_FOUND kalau invoice milik user lain (bukan admin)", async () => {
    const ownerEmail = `inv-pdf-owner2-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const invoice = await insertInvoiceWithItems(ownerId);

    const attackerEmail = `inv-pdf-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const res = await testApp.handle(new Request(`http://localhost/invoices/${invoice.id}/pdf`, { headers: { cookie: attackerCookie } }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVOICE_NOT_FOUND");
  });

  test("200 kalau invoice milik user lain TAPI caller admin (invoices.view)", async () => {
    const ownerEmail = `inv-pdf-owner3-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const invoice = await insertInvoiceWithItems(ownerId);

    const adminEmail = `inv-pdf-admin-${runId}@test.local`;
    const adminId = await signUp(adminEmail);
    await assignRole(adminId, "admin");
    const adminCookie = await signIn(adminEmail);

    const res = await testApp.handle(new Request(`http://localhost/invoices/${invoice.id}/pdf`, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
