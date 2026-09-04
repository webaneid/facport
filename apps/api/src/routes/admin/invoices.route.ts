import { Elysia } from "elysia";
import { desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { invoices } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { attachInvoiceItems } from "../../lib/invoice-helpers";

// § architecture-invoice.md § API — SEMUA invoice lintas user, admin-only
// (permission "invoices.view"). Dipisah dari `invoices.route.ts` (customer,
// filter userId sendiri) mengikuti konvensi 1-file-per-resource, prefix
// admin (§ apps/api/CLAUDE.md struktur folder).
export const adminInvoicesRoute = new Elysia({ prefix: "/admin/invoices" }).use(permissionPlugin).get(
  "/",
  async () => {
    const rows = await db.select().from(invoices).orderBy(desc(invoices.createdAt));
    return { invoices: await attachInvoiceItems(rows) };
  },
  { permission: "invoices.view" },
);
