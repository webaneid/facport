import { Elysia, t } from "elysia";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { invoices, orders, plans, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { attachInvoiceItems } from "../../lib/invoice-helpers";
import { createInvoiceAndOrder } from "../../lib/invoice-order";

// § architecture-invoice.md § API — SEMUA invoice lintas user, admin-only
// (permission "invoices.view"). Dipisah dari `invoices.route.ts` (customer,
// filter userId sendiri) mengikuti konvensi 1-file-per-resource, prefix
// admin (§ apps/api/CLAUDE.md struktur folder).
export const adminInvoicesRoute = new Elysia({ prefix: "/admin/invoices" })
  .use(permissionPlugin)
  .get(
    "/",
    async () => {
      const rows = await db.select().from(invoices).orderBy(desc(invoices.createdAt));
      const invoiceIds = rows.map((r) => r.id);
      // § Fase 27, ADR-0025 — `orderId` dipakai FE untuk tombol "Salin
      // Link" (link publik `{APP_URL}/pay/{orderId}`), pola JOIN yang
      // sama seperti `GET /me/invoices` (`invoices.route.ts`).
      const orderRows = invoiceIds.length ? await db.select().from(orders).where(inArray(orders.invoiceId, invoiceIds)) : [];
      const orderIdByInvoiceId = new Map(orderRows.map((o) => [o.invoiceId, o.id]));
      const withItems = await attachInvoiceItems(rows);
      return { invoices: withItems.map((inv) => ({ ...inv, orderId: orderIdByInvoiceId.get(inv.id) ?? null })) };
    },
    { permission: "invoices.view" },
  )
  // § Fase 27, ADR-0025 — admin bikin invoice BARU untuk user EXISTING
  // (beda dari Fase 18 "Kirim Invoice" yang cuma terjadi BERSAMAAN
  // pembuatan user baru). Reuse `createInvoiceAndOrder()` (Fase 18) apa
  // adanya — sudah dukung multi-plan. Permission TERPISAH dari
  // "invoices.view" (baca) — ini operasi TULIS (bikin invoice+order
  // baru, konsekuensi finansial), konsisten pola
  // "orders.manage"/"subscriptions.manage" yang sudah ada.
  .post(
    "/",
    async ({ body, set }) => {
      const [targetUser] = await db.select().from(userTable).where(eq(userTable.id, body.userId));
      if (!targetUser) {
        set.status = 404;
        return { code: "USER_NOT_FOUND" };
      }

      const planIds = [...new Set(body.planIds)];
      const planRows = await db.select().from(plans).where(inArray(plans.id, planIds));
      if (planRows.length !== planIds.length) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      if (planRows.some((p) => !p.isActive)) {
        set.status = 400;
        return { code: "PLAN_NOT_ACTIVE" };
      }

      const result = await db.transaction((tx) =>
        createInvoiceAndOrder(tx, { userId: targetUser.id, billToName: targetUser.name, planRows }),
      );

      return result;
    },
    {
      permission: "invoices.manage",
      body: t.Object({
        userId: t.String({ minLength: 1 }),
        planIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
      }),
    },
  );
