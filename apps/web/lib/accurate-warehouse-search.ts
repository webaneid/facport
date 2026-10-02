import { api } from "@/lib/api-client";

// § Fase 168 — diekstrak dari `formulas/page.tsx` ke sini (BUKAN fungsi
// baru) karena sekarang dipakai DUA halaman (`formulas/page.tsx` DAN
// `input/page.tsx`, § Gudang Barang Jadi/Gudang Bahan Baku di Input
// Produksi) — perilaku TIDAK berubah, cuma lokasinya. Dipisah dari
// `lib/accurate-combobox-options.ts` (pure, tanpa network) karena fungsi
// ini SENGAJA panggil `api` — menjaga file itu tetap testable tanpa mock.
export type AccurateWarehouseResult = { name: string };

export async function searchAccurateWarehouses(q: string): Promise<AccurateWarehouseResult[]> {
  if (!q.trim()) return [];
  const res = await api.accurate.warehouses.search.get({ query: { q } });
  return res.data ? (res.data as unknown as { warehouses: AccurateWarehouseResult[] }).warehouses : [];
}
