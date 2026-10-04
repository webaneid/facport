import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, plans, invoices, invoiceItems, orders, dataUsaha } from "../db/schema";
import { createTestDataUsaha } from "./test-fixtures";
import { createInvoiceAndOrder } from "./invoice-order";

const runId = Date.now();

describe("createInvoiceAndOrder — snapshot Produk di item invoice", () => {
  test("Produk diturunkan dari modul: paket AutoProduksi yang kolom product_line-nya salah ('facport') tetap tersnapshot 'autoproduksi'", async () => {
    const userId = `inv-order-${runId}`;
    await db.insert(userTable).values({ id: userId, name: "Inv Order Test", email: `inv-order-${runId}@test.local`, emailVerified: true, createdAt: new Date() });
    const dataUsahaId = await createTestDataUsaha(userId);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Autoproduksi Salah Label ${runId}`, price: 1000, durationDays: 30, modules: ["autoproduksi_production"], productLine: "facport" })
      .returning();

    const { invoiceId } = await db.transaction((tx) =>
      createInvoiceAndOrder(tx, { userId, billToName: "Test", dataUsahaId, planRows: [{ ...plan! }] }),
    );
    const [item] = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    expect(item!.productLine).toBe("autoproduksi");
    expect(item!.moduleKey).toBe("autoproduksi_production");
    expect(plan!.productLine).toBe("facport"); // kolom plan sengaja salah — bukti snapshot tidak ikut salah

    // bersihkan semua baris fixture (urutan FK: item → order → invoice → paket → data usaha → user)
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    await db.delete(orders).where(eq(orders.invoiceId, invoiceId));
    await db.delete(invoices).where(eq(invoices.id, invoiceId));
    await db.delete(plans).where(eq(plans.id, plan!.id));
    await db.delete(dataUsaha).where(eq(dataUsaha.userId, userId));
    await db.delete(userTable).where(eq(userTable.id, userId));
  });
});
