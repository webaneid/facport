// § Fase 162 — dipisah jadi fungsi murni (bukan inline di `formulas/page.tsx`)
// supaya bisa di-unit-test tanpa Next.js runtime, pola sama
// `resolve-nav-label.ts`/`resolve-preselect-product-line.ts`. Dataset per
// Data Usaha kecil (puluhan Formula, bukan ribuan) — filter di client,
// TIDAK perlu query param backend baru (§ plan Fase 162).
export type FilterableFormula = { name: string; branchName: string };

export function filterFormulas<T extends FilterableFormula>(
  formulas: T[],
  { search, branch }: { search: string; branch: string | null },
): T[] {
  const query = search.trim().toLowerCase();
  return formulas.filter((f) => {
    const matchesSearch = query === "" || f.name.toLowerCase().includes(query);
    const matchesBranch = !branch || f.branchName === branch;
    return matchesSearch && matchesBranch;
  });
}
