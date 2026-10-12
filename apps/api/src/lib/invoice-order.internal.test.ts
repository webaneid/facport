import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, plans, invoices, invoiceItems, orders, roles, userRoles } from "../db/schema";
import { createTestDataUsaha } from "./test-fixtures";
import { createInvoiceAndOrder, createPaidInvoiceAndOrder } from "./invoice-order";
import { InternalAccountBillingError } from "./internal-accounts";

// § Fase 189G, ADR-0044 — guard TERPUSAT: semua pembuatan invoice/order melewati `createInvoiceAndOrder`, jadi akun internal (flag ATAU role admin/staff)
// tidak pernah bisa punya invoice/order baru, apa pun asalnya (checkout, kursi, tagihan terjadwal, jalur admin). Akun komersil tidak terpengaruh.
const runId = Date.now();
let seq = 0;

async function makeUser(opts: { isInternal?: boolean; roleName?: "customer" | "admin" | "staff" }) {
  const id = `inv-internal-${runId}-${seq++}`;
  await db.insert(userTable).values({ id, name: "Inv Internal Test", email: `${id}@test.local`, emailVerified: true, isInternal: opts.isInternal ?? false, createdAt: new Date(), updatedAt: new Date() });
  if (opts.roleName) {
    const [role] = await db.select().from(roles).where(eq(roles.name, opts.roleName));
    await db.insert(userRoles).values({ userId: id, roleId: role!.id });
  }
  const dataUsahaId = await createTestDataUsaha(id);
  return { id, dataUsahaId };
}

async function makePlan() {
  const [plan] = await db.insert(plans).values({ name: `Internal Guard Plan ${runId}-${seq++}`, price: 150000, durationDays: 30, modules: ["sales_invoice"] }).returning();
  return plan!;
}

const countInvoices = async (userId: string) => (await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))).length;

describe("createInvoiceAndOrder — guard akun internal", () => {
  test("akun KOMERSIL tetap bisa dibuatkan invoice + order + item", async () => {
    const { id, dataUsahaId } = await makeUser({ roleName: "customer" });
    const plan = await makePlan();
    const { invoiceId } = await db.transaction((tx) => createInvoiceAndOrder(tx, { userId: id, billToName: "Komersil", dataUsahaId, planRows: [plan] }));
    expect(await countInvoices(id)).toBe(1);
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    expect(items).toHaveLength(1);
    expect(await db.select({ id: orders.id }).from(orders).where(eq(orders.invoiceId, invoiceId))).toHaveLength(1);
  });

  test("akun internal (flag) → InternalAccountBillingError, TIDAK ada invoice/order/item tertulis", async () => {
    const { id, dataUsahaId } = await makeUser({ isInternal: true, roleName: "customer" });
    const plan = await makePlan();
    await expect(db.transaction((tx) => createInvoiceAndOrder(tx, { userId: id, billToName: "Internal", dataUsahaId, planRows: [plan] }))).rejects.toBeInstanceOf(InternalAccountBillingError);
    expect(await countInvoices(id)).toBe(0);
    expect(await db.select({ id: orders.id }).from(orders).where(eq(orders.dataUsahaId, dataUsahaId))).toHaveLength(0);
  });

  test("akun ber-role admin atau staff (internal otomatis, D16) juga ditolak", async () => {
    const plan = await makePlan();
    for (const roleName of ["admin", "staff"] as const) {
      const { id, dataUsahaId } = await makeUser({ roleName });
      await expect(db.transaction((tx) => createInvoiceAndOrder(tx, { userId: id, billToName: roleName, dataUsahaId, planRows: [plan] }))).rejects.toBeInstanceOf(InternalAccountBillingError);
      expect(await countInvoices(id)).toBe(0);
    }
  });

  test("jalur 'lunas otomatis admin' (createPaidInvoiceAndOrder) untuk akun internal juga ditolak — tidak ada pembayaran tercatat", async () => {
    const { id, dataUsahaId } = await makeUser({ isInternal: true, roleName: "customer" });
    const plan = await makePlan();
    await expect(
      db.transaction((tx) => createPaidInvoiceAndOrder(tx, { userId: id, billToName: "Internal", dataUsahaId, planRows: [plan], actorId: id, now: new Date(), timeZone: "Asia/Jakarta" })),
    ).rejects.toBeInstanceOf(InternalAccountBillingError);
    expect(await countInvoices(id)).toBe(0);
  });

  test("setelah flag dicabut, akun itu kembali bisa ditagih (reversibel)", async () => {
    const { id, dataUsahaId } = await makeUser({ isInternal: true, roleName: "customer" });
    const plan = await makePlan();
    await expect(db.transaction((tx) => createInvoiceAndOrder(tx, { userId: id, billToName: "X", dataUsahaId, planRows: [plan] }))).rejects.toBeInstanceOf(InternalAccountBillingError);
    await db.update(userTable).set({ isInternal: false }).where(eq(userTable.id, id));
    await db.transaction((tx) => createInvoiceAndOrder(tx, { userId: id, billToName: "X", dataUsahaId, planRows: [plan] }));
    expect(await countInvoices(id)).toBe(1);
  });
});
