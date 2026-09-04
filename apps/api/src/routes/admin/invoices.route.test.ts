import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminInvoicesRoute } from "./invoices.route";
import { db } from "../../lib/db";
import { plans, invoices, invoiceItems, roles, userRoles, user as userTable } from "../../db/schema";

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
});
