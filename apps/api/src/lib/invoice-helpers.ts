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

// § Fase 110, architecture-user-tambahan.md — beli N seat_addon sekaligus
// = N baris `invoiceItems` TERPISAH (data mentah TIDAK berubah, § Keputusan
// Desain "quantity via N row" arsitektur ini) — tapi tampilan invoice/PDF
// TIDAK BOLEH menampilkan 5 baris identik "Tambahan User Rp20.000" berturut-
// turut, dikelompokkan jadi 1 baris "5x Tambahan User" dengan `price` =
// TOTAL baris tsb (konsisten kolom "Harga" di PDF yang selama ini SELALU
// berarti nilai baris, bukan harga satuan — § invoice-pdf.tsx tabel 2 kolom).
// MURNI render-time (dipanggil di titik pembuatan PDF/tampilan billing,
// BUKAN mengubah cara insert `invoiceItems`) — group by `(planId, price)`,
// urutan baris pertama-kemunculan dipertahankan (bukan alfabetis/harga).
export function groupIdenticalInvoiceItems<T extends { planId: string | null; price: number; label: string }>(
  items: T[],
): { label: string; price: number }[] {
  const order: string[] = [];
  const groups = new Map<string, { label: string; unitPrice: number; quantity: number }>();
  for (const item of items) {
    const key = `${item.planId ?? item.label}:${item.price}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      groups.set(key, { label: item.label, unitPrice: item.price, quantity: 1 });
      order.push(key);
    }
  }
  return order.map((key) => {
    const g = groups.get(key)!;
    return { label: g.quantity > 1 ? `${g.quantity}x ${g.label}` : g.label, price: g.unitPrice * g.quantity };
  });
}
