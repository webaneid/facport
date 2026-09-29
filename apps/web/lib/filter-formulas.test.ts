import { describe, expect, test } from "bun:test";
import { filterFormulas } from "./filter-formulas";

const formulas = [
  { name: "Bolu Kukus SP", branchName: "JAKARTA" },
  { name: "Bolu Coklat", branchName: "JAKARTA" },
  { name: "Roti Tawar", branchName: "SURABAYA" },
];

describe("filterFormulas", () => {
  test("search kosong + branch null -> semua formula", () => {
    expect(filterFormulas(formulas, { search: "", branch: null })).toHaveLength(3);
  });

  test("search cocok sebagian nama (case-insensitive)", () => {
    const result = filterFormulas(formulas, { search: "bolu", branch: null });
    expect(result.map((f) => f.name)).toEqual(["Bolu Kukus SP", "Bolu Coklat"]);
  });

  test("filter branch saja", () => {
    const result = filterFormulas(formulas, { search: "", branch: "SURABAYA" });
    expect(result.map((f) => f.name)).toEqual(["Roti Tawar"]);
  });

  test("search + branch digabung (AND, bukan OR)", () => {
    const result = filterFormulas(formulas, { search: "bolu", branch: "SURABAYA" });
    expect(result).toHaveLength(0);
  });

  test("search tidak cocok apa pun -> kosong", () => {
    expect(filterFormulas(formulas, { search: "nasi goreng", branch: null })).toHaveLength(0);
  });
});
