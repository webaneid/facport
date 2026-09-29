// § Fase 163, ADR-0039 — dipisah jadi fungsi murni (bukan inline di
// `formulas/page.tsx`) supaya bisa di-unit-test, pola sama
// `resolve-nav-label.ts`/`filter-formulas.ts`. `Combobox` (§
// `components/ui/combobox.tsx`) cuma balikin `value` (kode) lewat
// `onChange` — nama/satuan diambil dari hasil pencarian TERAKHIR di sisi
// caller, komponennya sendiri TIDAK diubah.
//
// `options` SELALU disisipi entry nilai SAAT INI di depan (kalau ada)
// supaya label yang sudah tersimpan (mis. saat buka "Edit Formula", belum
// ada pencarian baru sama sekali) tetap tampil benar — bukan jatuh ke
// placeholder cuma karena hasil pencarian terakhir kosong/beda konteks.
export type ComboboxOption = { value: string; label: string };
type ItemResult = { no: string; name: string };

export function itemComboboxOptions(currentNo: string, currentName: string | undefined, results: ItemResult[]): ComboboxOption[] {
  return [
    ...(currentNo ? [{ value: currentNo, label: currentName ? `${currentNo} — ${currentName}` : currentNo }] : []),
    ...results.filter((r) => r.no !== currentNo).map((r) => ({ value: r.no, label: `${r.no} — ${r.name}` })),
  ];
}

// § HOTFIX 2026-09-30 (evaluasi client, Gudang) — Gudang di Accurate TIDAK
// punya kode ("no") seperti Item/Akun, cuma `name` (§ accurate-lookup.route.ts)
// — jadi `value` DAN sumber label sama-sama `name` itu sendiri, bukan
// pasangan kode+nama seperti `itemComboboxOptions`.
type WarehouseResult = { name: string };

export function warehouseComboboxOptions(currentName: string | undefined, results: WarehouseResult[]): ComboboxOption[] {
  const current = currentName?.trim();
  return [
    ...(current ? [{ value: current, label: current }] : []),
    ...results.filter((r) => r.name !== current).map((r) => ({ value: r.name, label: r.name })),
  ];
}
