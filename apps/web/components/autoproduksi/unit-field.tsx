"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// § evaluasi client 2026-10-03 — barang Accurate bisa punya beberapa satuan
// (mis. GULA: KG dan Pouch = 10 KG). Kalau daftar satuan barang diketahui
// (>1), tampilkan pilihan; kalau tidak (barang 1 satuan, barang diisi manual,
// atau daftar belum termuat) tetap `Input` bebas seperti sebelumnya, supaya
// tidak ada kasus yang jadi tidak bisa diisi.
export type ItemUnit = { name: string; ratio: number };

export function unitOptionLabel(unit: ItemUnit, baseUnitName: string): string {
  return unit.ratio !== 1 ? `${unit.name} (= ${unit.ratio} ${baseUnitName})` : unit.name;
}

export function UnitField({
  value,
  units,
  onChange,
  placeholder,
}: {
  value: string;
  units: ItemUnit[] | undefined;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  if (!units || units.length < 2) return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
  const base = units[0]!.name;
  // Nilai tersimpan yang tidak ada di daftar (mis. diketik manual dulu) tetap ditampilkan.
  const extra = value && !units.some((u) => u.name === value);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">{placeholder}</option>}
      {extra && <option value={value}>{value}</option>}
      {units.map((u) => (
        <option key={u.name} value={u.name}>
          {unitOptionLabel(u, base)}
        </option>
      ))}
    </Select>
  );
}
