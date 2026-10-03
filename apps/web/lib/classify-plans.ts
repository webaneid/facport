import { MODULE_OPTIONS, PRODUCT_LINES, productLineLabel } from "./module-options";

// § diminta user 2026-10-03 — popup "Assign Paket Baru" diurutkan & difilter per Produk: Facport, Konverter, AutoProduksi,
// lalu Tambah User (paket seat add-on). Nama paket Facport dan Konverter sering SAMA PERSIS ("Delivery Order 30 hari"),
// admin sering tertukar → tiap opsi diberi awalan produk, urutan mengikuti katalog (Produk → Kategori → Modul), dan ada
// filter Produk. Combobox yang dipakai tetap Combobox bersama (teks awalan produk ikut tercari).
export type ClassifiablePlan = { id: string; name: string; durationDays: number; modules: string[]; productLine?: string; kind?: string };

export const SEAT_FILTER_KEY = "seat_addon";
export const PLAN_PRODUCT_FILTERS: { key: string; label: string }[] = [
  ...PRODUCT_LINES.map((p) => ({ key: p.key as string, label: p.label as string })),
  { key: SEAT_FILTER_KEY, label: "Tambah User" },
];

export function planFilterKey(plan: ClassifiablePlan): string {
  return plan.kind === "seat_addon" ? SEAT_FILTER_KEY : (plan.productLine ?? "facport");
}

export function planProductLabel(plan: ClassifiablePlan): string {
  return plan.kind === "seat_addon" ? "Tambah User" : productLineLabel(plan.productLine ?? "facport");
}

export function planOptionLabel(plan: ClassifiablePlan): string {
  return `${planProductLabel(plan)} · ${plan.name} — ${plan.durationDays} hari`;
}

export function sortPlansByCatalog<P extends ClassifiablePlan>(plans: P[]): P[] {
  const filterRank = (p: P) => PLAN_PRODUCT_FILTERS.findIndex((f) => f.key === planFilterKey(p));
  const moduleRank = (p: P) => {
    const i = MODULE_OPTIONS.findIndex((m) => m.key === p.modules[0]);
    return i === -1 ? 9999 : i;
  };
  return [...plans].sort((a, b) => filterRank(a) - filterRank(b) || moduleRank(a) - moduleRank(b) || a.name.localeCompare(b.name) || a.durationDays - b.durationDays);
}

export function filterPlansByProduct<P extends ClassifiablePlan>(plans: P[], filterKey: string): P[] {
  return filterKey === "all" ? plans : plans.filter((p) => planFilterKey(p) === filterKey);
}

export function countPlansByFilter(plans: ClassifiablePlan[]): Record<string, number> {
  const counts: Record<string, number> = { all: plans.length };
  for (const p of plans) counts[planFilterKey(p)] = (counts[planFilterKey(p)] ?? 0) + 1;
  return counts;
}
