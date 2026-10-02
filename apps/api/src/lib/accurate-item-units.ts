// § AutoProduksi (evaluasi client 2026-10-03) — barang di Accurate bisa punya
// sampai 5 satuan (`unit1..unit5` + `ratio2..ratio5` terhadap satuan 1, §
// `item/save.do` spec), mis. GULA: KG (satuan 1) dan Pouch (= 10 KG). Pencarian
// barang dulu cuma membaca `unit1`, jadi satuan lain tidak pernah bisa dipilih.
//
// § Bentuk RESPONS BACA tidak sama dengan field TULIS (pelajaran HOTFIX
// 2026-09-30, § accurate-lookup.route.ts: `unit1` datang sebagai objek nested
// `{id, name}`, bukan `unit1Name`). Bentuk `unit2..unit5` belum diverifikasi
// dengan test call nyata, jadi dibaca defensif: objek `{name}`, string polos,
// atau field flat `unitNName`.
export type ItemUnit = { name: string; ratio: number };

function unitNameOf(record: Record<string, unknown>, n: number): string {
  const ref = record[`unit${n}`];
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && typeof (ref as { name?: unknown }).name === "string") return ((ref as { name: string }).name).trim();
  const flat = record[`unit${n}Name`];
  return typeof flat === "string" ? flat.trim() : "";
}

export function extractItemUnits(record: Record<string, unknown>): ItemUnit[] {
  const units: ItemUnit[] = [];
  for (let n = 1; n <= 5; n++) {
    const name = unitNameOf(record, n);
    if (!name || units.some((u) => u.name === name)) continue;
    const ratio = n === 1 ? 1 : Number(record[`ratio${n}`]);
    units.push({ name, ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1 });
  }
  return units;
}
