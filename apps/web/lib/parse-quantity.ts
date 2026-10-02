// § evaluasi client 2026-10-03 — takaran Bahan Baku diketik orang Indonesia
// ("0,5" dengan koma desimal, § komentar FormulaItem di formulas/page.tsx),
// tapi `Number("0,5")` = NaN → dulu baris itu DIBUANG DIAM-DIAM saat simpan
// (`Number(q) > 0` false). Terima koma ATAU titik sebagai pemisah desimal.
// Format lain (ribuan, huruf, dua pemisah) ditolak (null), bukan ditebak.
export function parseQuantityInput(input: string): number | null {
  const text = input.trim();
  if (!/^\d+([.,]\d+)?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}
