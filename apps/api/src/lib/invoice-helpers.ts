import { inArray } from "drizzle-orm";
import { db } from "./db";
import { invoiceItems } from "../db/schema";

// § Fase 15 — dipakai `invoices.route.ts` (GET /me/invoices) DAN
// `admin/invoices.route.ts` (GET /admin/invoices), logic SAMA PERSIS,
// beda cuma filter WHERE sebelum baris invoice diserahkan ke sini
// (security review 2026-09-04 — duplikasi sebelumnya, diekstrak).
export async function attachInvoiceItems<T extends { id: string }>(rows: T[]) {
  const invoiceIds = rows.map((r) => r.id);
  const items = invoiceIds.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds)) : [];
  const itemsByInvoiceId = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByInvoiceId.get(item.invoiceId) ?? [];
    list.push(item);
    itemsByInvoiceId.set(item.invoiceId, list);
  }
  return rows.map((r) => ({ ...r, items: itemsByInvoiceId.get(r.id) ?? [] }));
}
