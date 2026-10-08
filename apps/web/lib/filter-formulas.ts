// § Fase 162 — dipisah jadi fungsi murni (bukan inline di `formulas/page.tsx`)
// supaya bisa di-unit-test tanpa Next.js runtime, pola sama
// `resolve-nav-label.ts`/`resolve-preselect-product-line.ts`. Dataset per
// Data Usaha kecil (puluhan Formula, bukan ribuan) — filter di client,
// TIDAK perlu query param backend baru (§ plan Fase 162).
// § Fase 168 (diminta client) — filter Cabang DIGANTI filter Status
// (Aktif/Nonaktif) — Cabang sudah dihapus total dari Formula.
export type FormulaStatusFilter = "all" | "active" | "inactive";
// § Fase 184 — `formulaCode` (F-007) ikut dicari: Formula bernama sama dibedakan lewat nomornya.
export type FilterableFormula = { name: string; isActive: boolean; formulaCode?: string };

export function filterFormulas<T extends FilterableFormula>(formulas: T[], { search, status }: { search: string; status: FormulaStatusFilter }): T[] {
  const query = search.trim().toLowerCase();
  return formulas.filter((f) => {
    const matchesSearch = query === "" || f.name.toLowerCase().includes(query) || (f.formulaCode ?? "").toLowerCase().includes(query);
    const matchesStatus = status === "all" || (status === "active" ? f.isActive : !f.isActive);
    return matchesSearch && matchesStatus;
  });
}
