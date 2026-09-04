import { Elysia, t } from "elysia";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { invoices, invoiceItems, settings, orders } from "../db/schema";
import { permissionPlugin, userHasPermission } from "../lib/permission";
import { generateInvoicePdf } from "../lib/invoice-pdf";
import { attachInvoiceItems } from "../lib/invoice-helpers";
import { logger } from "../lib/logger";

const COMPANY_SETTINGS_KEYS = [
  "company.name",
  "company.address",
  "company.logo",
  "company.taxId",
  "company.phone",
  "company.email",
  "company.bankAccount",
] as const;

async function getCompanySettingsForPdf() {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, [...COMPANY_SETTINGS_KEYS]));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<(typeof COMPANY_SETTINGS_KEYS)[number], unknown>;
  return {
    name: typeof map["company.name"] === "string" ? map["company.name"] : "Facport",
    address: typeof map["company.address"] === "string" ? map["company.address"] : null,
    logoUrl: typeof map["company.logo"] === "string" ? map["company.logo"] : null,
    taxId: typeof map["company.taxId"] === "string" ? map["company.taxId"] : null,
    phone: typeof map["company.phone"] === "string" ? map["company.phone"] : null,
    email: typeof map["company.email"] === "string" ? map["company.email"] : null,
    bankAccount: typeof map["company.bankAccount"] === "string" ? map["company.bankAccount"] : null,
  };
}

// § Content-Disposition filename — `invoiceNumber` format "INV/2026/09/0001"
// mengandung "/", TIDAK aman dipakai langsung sebagai nama file (sebagian
// browser/OS memperlakukan "/" sebagai pemisah direktori). Ganti jadi "-".
function invoiceNumberToFilename(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/\//g, "-")}.pdf`;
}

export const invoicesRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me/invoices",
    async ({ user }) => {
      const rows = await db.select().from(invoices).where(eq(invoices.userId, user.id)).orderBy(desc(invoices.createdAt));
      const invoiceIds = rows.map((r) => r.id);
      // § Fase 16 — dipakai FE (`/billing`) buat link "Bayar Sekarang":
      // `orders.invoiceId` 1:1 ke invoice, TIDAK ada FK terbalik di
      // `invoices`, jadi di-JOIN di sini (bukan disimpan redundan).
      const orderRows = invoiceIds.length ? await db.select().from(orders).where(inArray(orders.invoiceId, invoiceIds)) : [];
      const orderIdByInvoiceId = new Map(orderRows.map((o) => [o.invoiceId, o.id]));
      const withItems = await attachInvoiceItems(rows);
      return { invoices: withItems.map((inv) => ({ ...inv, orderId: orderIdByInvoiceId.get(inv.id) ?? null })) };
    },
    { auth: true },
  )
  // § architecture-invoice.md § API — ownership GANDA: invoice milik
  // caller ATAU caller punya permission "invoices.view" (admin). 404
  // (BUKAN 403) untuk keduanya yang gagal — hindari konfirmasi "invoice
  // ID ini valid tapi bukan punya kamu" ke pihak yang tidak berhak, pola
  // sama endpoint ownership lain di project ini (mis. `accurate.route.ts`
  // `CONNECTION_NOT_FOUND`).
  .get(
    "/invoices/:id/pdf",
    async ({ user, params, set }) => {
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.id));
      if (!invoice) {
        set.status = 404;
        return { code: "INVOICE_NOT_FOUND" };
      }
      if (invoice.userId !== user.id) {
        const isAdmin = await userHasPermission(user.id, "invoices.view");
        if (!isAdmin) {
          set.status = 404;
          return { code: "INVOICE_NOT_FOUND" };
        }
      }

      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
      const company = await getCompanySettingsForPdf();

      try {
        const pdfBuffer = await generateInvoicePdf({
          invoiceNumber: invoice.invoiceNumber,
          createdAt: invoice.createdAt,
          dueDate: invoice.dueDate,
          billToName: invoice.billToName,
          billToAddress: invoice.billToAddress,
          items: items.map((i) => ({ label: i.label, price: i.price })),
          subtotal: invoice.subtotal,
          total: invoice.total,
          company,
        });

        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${invoiceNumberToFilename(invoice.invoiceNumber)}"`,
          },
        });
      } catch (err) {
        set.status = 500;
        logger.error({ err, invoiceId: invoice.id }, "Gagal generate PDF invoice");
        return { code: "PDF_GENERATION_FAILED" };
      }
    },
    { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
