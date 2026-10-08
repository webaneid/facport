import { describe, expect, test } from "bun:test";
import { filterFormulas } from "./filter-formulas";

// § Fase 168 (diminta client) — filter Cabang DIGANTI filter Status
// (Aktif/Nonaktif), fixture diperbarui mengikuti.
const formulas = [
  { name: "Bolu Kukus SP", isActive: true },
  { name: "Bolu Coklat", isActive: true },
  { name: "Roti Tawar", isActive: false },
];

describe("filterFormulas", () => {
  test("search kosong + status all -> semua formula", () => {
    expect(filterFormulas(formulas, { search: "", status: "all" })).toHaveLength(3);
  });

  test("search cocok sebagian nama (case-insensitive)", () => {
    const result = filterFormulas(formulas, { search: "bolu", status: "all" });
    expect(result.map((f) => f.name)).toEqual(["Bolu Kukus SP", "Bolu Coklat"]);
  });

  test("filter status active saja", () => {
    const result = filterFormulas(formulas, { search: "", status: "active" });
    expect(result.map((f) => f.name)).toEqual(["Bolu Kukus SP", "Bolu Coklat"]);
  });

  test("filter status inactive saja", () => {
    const result = filterFormulas(formulas, { search: "", status: "inactive" });
    expect(result.map((f) => f.name)).toEqual(["Roti Tawar"]);
  });

  test("search + status digabung (AND, bukan OR)", () => {
    const result = filterFormulas(formulas, { search: "bolu", status: "inactive" });
    expect(result).toHaveLength(0);
  });

  test("search tidak cocok apa pun -> kosong", () => {
    expect(filterFormulas(formulas, { search: "nasi goreng", status: "all" })).toHaveLength(0);
  });
});

// § Fase 184 — nama kembar dibedakan lewat nomor; pencarian tidak peka huruf besar/kecil dan bisa lewat nomor.
describe("filterFormulas — nomor Formula (Fase 184)", () => {
  const twins = [
    { name: "Bolu Kukus", isActive: true, formulaCode: "F-001" },
    { name: "bolu kukus", isActive: true, formulaCode: "F-002" },
    { name: "Roti Tawar", isActive: true, formulaCode: "F-014" },
  ];
  test("'Bolu Kukus' dan 'bolu kukus' sama-sama tampil, dengan huruf berapa pun", () => {
    expect(filterFormulas(twins, { search: "BOLU KUKUS", status: "all" }).map((f) => f.formulaCode)).toEqual(["F-001", "F-002"]);
  });
  test("cari lewat nomor (lengkap atau sebagian, tanpa peduli huruf)", () => {
    expect(filterFormulas(twins, { search: "f-002", status: "all" }).map((f) => f.name)).toEqual(["bolu kukus"]);
    expect(filterFormulas(twins, { search: "014", status: "all" }).map((f) => f.name)).toEqual(["Roti Tawar"]);
  });
});
