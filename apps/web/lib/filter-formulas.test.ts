import { describe, expect, test } from "bun:test";
import { filterFormulas } from "./filter-formulas";

// § Fase 168 (diminta client) — filter Cabang DIGANTI filter Status
// (Aktif/Non-aktif), fixture diperbarui mengikuti.
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
