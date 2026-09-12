// § Fase 110, architecture-user-tambahan.md — beli N seat_addon (User
// Tambahan) sekaligus = N baris `invoiceItems` TERPISAH di data mentah
// (§ Keputusan Desain arsitektur "quantity via N row") — daftar ringkas
// invoice (billing customer, admin invoices list) TIDAK BOLEH menampilkan
// "Tambahan User, Tambahan User, Tambahan User" berulang, dikelompokkan
// jadi "3x Tambahan User". MURNI display (data asli tidak berubah) — pola
// SAMA seperti `apps/api/src/lib/invoice-helpers.ts`
// `groupIdenticalInvoiceItems` (BEDA app, tidak bisa saling import, § monorepo).
export function groupInvoiceItemLabels(items: { label: string; moduleKey: string; price: number }[]): string {
  const order: string[] = [];
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const key = `${item.moduleKey}:${item.price}:${item.label}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { label: item.label, count: 1 });
      order.push(key);
    }
  }
  return order.map((key) => {
    const g = counts.get(key)!;
    return g.count > 1 ? `${g.count}x ${g.label}` : g.label;
  }).join(", ");
}
