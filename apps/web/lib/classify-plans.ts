import { MODULE_OPTIONS, PRODUCT_LINES, moduleLabel, moduleProductLine, productLineLabel } from "./module-options";

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

// § Produk paket diturunkan dari MODUL-nya di katalog (`module-catalog.ts`, sumber kebenaran sama dengan sidebar/gating), BUKAN dari
// kolom `plans.product_line` — kolom itu default "facport" dan bisa tidak sinkron dengan modulnya (paket lama/diedit), yang membuat
// paket AutoProduksi terhitung Facport (filter AutoProduksi 0). Kolom DB hanya fallback kalau modul tidak dikenal.
function planProduct(plan: ClassifiablePlan): string {
  const fromModule = plan.modules[0] ? moduleProductLine(plan.modules[0]) : null;
  return fromModule ?? plan.productLine ?? "facport";
}

export function planFilterKey(plan: ClassifiablePlan): string {
  return plan.kind === "seat_addon" ? SEAT_FILTER_KEY : planProduct(plan);
}

export function planProductLabel(plan: ClassifiablePlan): string {
  return plan.kind === "seat_addon" ? "Tambah User" : productLineLabel(planProduct(plan));
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

// Ringkasan paket yang disembunyikan karena modulnya sudah aktif, mis. "AutoProduksi · Input Produksi (2 paket)" — supaya admin tahu
// PERSIS fitur mana yang menyebabkan paket tak muncul (bukan sekadar "N paket disembunyikan").
export function summarizeHiddenPlans(hidden: ClassifiablePlan[]): string[] {
  const byModule = new Map<string, { label: string; count: number }>();
  for (const p of hidden) {
    const key = p.modules[0] ?? p.id;
    const entry = byModule.get(key) ?? { label: `${planProductLabel(p)} · ${p.modules[0] ? moduleLabel(p.modules[0]) : p.name}`, count: 0 };
    entry.count += 1;
    byModule.set(key, entry);
  }
  return [...byModule.values()].map((e) => `${e.label} (${e.count} paket)`);
}
