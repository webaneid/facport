import { inArray } from "drizzle-orm";
import { db } from "./db";
import { invoiceItems, subscriptions } from "../db/schema";

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

// § Fase 131 (diminta user 2026-09-17) — tanggal AKTUAL mulai/berakhir
// subscription per invoiceItem, LIVE JOIN (bukan snapshot di
// `invoiceItems` seperti `durationDays` — dates ini baru ADA setelah
// subscription tercipta, dan HARUS reflect perpanjangan admin/PATCH
// endAt, snapshot justru salah utk itu). `subscriptions.invoiceItemId`
// = pointer BALIK ke `invoiceItems.id`, sudah ada sejak Fase 15/ADR-0021
// — tidak perlu kolom baru. Invoice yang BELUM dibayar (subscription
// belum tercipta) balik `null` utk item itu, BUKAN error.
export async function attachSubscriptionDates<T extends { id: string }>(
  items: T[],
): Promise<(T & { subscriptionStartAt: Date | null; subscriptionEndAt: Date | null })[]> {
  const itemIds = items.map((i) => i.id);
  const subRows = itemIds.length
    ? await db
        .select({ invoiceItemId: subscriptions.invoiceItemId, startAt: subscriptions.startAt, endAt: subscriptions.endAt })
        .from(subscriptions)
        .where(inArray(subscriptions.invoiceItemId, itemIds))
    : [];
  const byInvoiceItemId = new Map(subRows.filter((s) => s.invoiceItemId !== null).map((s) => [s.invoiceItemId!, s]));
  return items.map((item) => {
    const sub = byInvoiceItemId.get(item.id);
    return { ...item, subscriptionStartAt: sub?.startAt ?? null, subscriptionEndAt: sub?.endAt ?? null };
  });
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
export function groupIdenticalInvoiceItems<
  T extends {
    planId: string | null;
    price: number;
    label: string;
    moduleKey: string;
    productLine: string;
    durationDays: number;
    subscriptionStartAt?: Date | null;
    subscriptionEndAt?: Date | null;
  },
>(
  items: T[],
): {
  label: string;
  price: number;
  moduleKey: string;
  productLine: string;
  durationDays: number;
  subscriptionStartAt: Date | null;
  subscriptionEndAt: Date | null;
}[] {
  const order: string[] = [];
  // § Fase 118 — `moduleKey`/`productLine` dibawa serta (bukan cuma
  // label/price) supaya PDF/admin bisa tampilkan Produk+Modul+Sub-modul
  // per baris. Aman ikut grouping key `(planId, price)` yang sudah ada —
  // 2 baris dengan `planId` SAMA otomatis punya `moduleKey`/`productLine`
  // SAMA juga (1 plan = 1 sub-modul, § ADR-0019), jadi tidak perlu
  // dimasukkan ke key grouping-nya sendiri. § Fase 131 — `durationDays`
  // ikut pola yang sama (sama plan = sama durasi). `subscriptionStartAt`/
  // `subscriptionEndAt` JUGA ikut nilai baris PERTAMA di grup — aman
  // karena N baris `seat_addon` dari 1 checkout yang sama dikonfirmasi
  // BERSAMAAN (§ admin/orders.route.ts confirm loop), jadi startAt/endAt
  // semua subscription hasilnya identik.
  const groups = new Map<
    string,
    {
      label: string;
      unitPrice: number;
      quantity: number;
      moduleKey: string;
      productLine: string;
      durationDays: number;
      subscriptionStartAt: Date | null;
      subscriptionEndAt: Date | null;
    }
  >();
  for (const item of items) {
    const key = `${item.planId ?? item.label}:${item.price}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      groups.set(key, {
        label: item.label,
        unitPrice: item.price,
        quantity: 1,
        moduleKey: item.moduleKey,
        productLine: item.productLine,
        durationDays: item.durationDays,
        subscriptionStartAt: item.subscriptionStartAt ?? null,
        subscriptionEndAt: item.subscriptionEndAt ?? null,
      });
      order.push(key);
    }
  }
  return order.map((key) => {
    const g = groups.get(key)!;
    return {
      label: g.quantity > 1 ? `${g.quantity}x ${g.label}` : g.label,
      price: g.unitPrice * g.quantity,
      moduleKey: g.moduleKey,
      productLine: g.productLine,
      durationDays: g.durationDays,
      subscriptionStartAt: g.subscriptionStartAt,
      subscriptionEndAt: g.subscriptionEndAt,
    };
  });
}
