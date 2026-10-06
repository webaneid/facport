import { PRODUCT_LINES, moduleProductLine, productLineLabel } from "./module-options";

// § diminta user 2026-10-03 — klasifikasi Produk paket: Facport, Konverter, AutoProduksi, lalu Tambah User (paket seat add-on). § Fase 177 — dipakai
// `SubscriptionPicker` (filter Produk); urutan/filter/ringkasan lama dipindah ke `lib/subscription-picker.ts` (fungsi `planOptionLabel`/`sortPlansByCatalog`/dst dihapus). Nama paket Facport dan Konverter sering SAMA PERSIS ("Delivery Order 30 hari"),
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
