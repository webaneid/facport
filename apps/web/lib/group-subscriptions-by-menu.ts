import { MODULE_OPTIONS, PRODUCT_LINES, MODULE_CATEGORIES, moduleCategory, moduleProductLine, productLineLabel } from "./module-options";

// § diminta user 2026-10-03 — daftar fitur/langganan di halaman admin dikelompokkan seperti MENU yang dilihat
// user di sidebar: Produk (Facport/Konverter/AutoProduksi) → Kategori (Sales, Purchase, Cash & Bank, ...).
// Sumber kebenaran tunggal tetap `module-catalog.ts` (urutan produk, urutan kategori, urutan modul) supaya admin
// dan sidebar tidak bisa berbeda. Modul tak dikenal / tanpa modul (mis. paket User Tambahan) → grup "Lainnya".
export type MenuGroup<T> = { key: string; label: string; items: T[] };

const OTHER_KEY = "other";

export function groupByMenu<T extends { moduleKey: string | null }>(items: T[]): MenuGroup<T>[] {
  const moduleOrder = new Map<string, number>(MODULE_OPTIONS.map((m, i) => [m.key, i]));
  const byKey = new Map<string, MenuGroup<T>>();
  for (const item of items) {
    const product = item.moduleKey ? moduleProductLine(item.moduleKey) : null;
    const category = item.moduleKey ? moduleCategory(item.moduleKey) : null;
    const key = product && category ? `${product}::${category}` : OTHER_KEY;
    const label = product && category ? `${productLineLabel(product)} · ${category}` : "Lainnya";
    const group = byKey.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    byKey.set(key, group);
  }
  const productRank = (key: string) => PRODUCT_LINES.findIndex((p) => key.startsWith(`${p.key}::`));
  const categoryRank = (key: string) => MODULE_CATEGORIES.findIndex((c) => key.endsWith(`::${c}`));
  const groups = [...byKey.values()].sort((a, b) => {
    if (a.key === OTHER_KEY) return 1;
    if (b.key === OTHER_KEY) return -1;
    return productRank(a.key) - productRank(b.key) || categoryRank(a.key) - categoryRank(b.key);
  });
  for (const g of groups) g.items.sort((a, b) => (moduleOrder.get(a.moduleKey ?? "") ?? 999) - (moduleOrder.get(b.moduleKey ?? "") ?? 999));
  return groups;
}
