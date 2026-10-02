import { describe, test, expect } from "bun:test";
import { extractItemUnits } from "./accurate-item-units";

describe("extractItemUnits", () => {
  test("GULA: satuan 1 KG + satuan 2 Pouch rasio 10 (bentuk objek nested)", () => {
    expect(extractItemUnits({ unit1: { name: "KG" }, unit2: { name: "Pouch" }, ratio2: 10 })).toEqual([
      { name: "KG", ratio: 1 },
      { name: "Pouch", ratio: 10 },
    ]);
  });

  test("hanya satuan 1 — satu entri, rasio 1", () => {
    expect(extractItemUnits({ unit1: { name: "PCS" }, unit2: null })).toEqual([{ name: "PCS", ratio: 1 }]);
  });

  test("bentuk flat unitNName & string polos juga dibaca, rasio string dikonversi", () => {
    expect(extractItemUnits({ unit1Name: "KG", unit2: "Dus", ratio2: "12", unit3Name: "Palet", ratio3: "abc" })).toEqual([
      { name: "KG", ratio: 1 },
      { name: "Dus", ratio: 12 },
      { name: "Palet", ratio: 1 },
    ]);
  });

  test("nama kosong/duplikat dilewati; tanpa satuan sama sekali → array kosong", () => {
    expect(extractItemUnits({ unit1: { name: "KG" }, unit2: { name: " " }, unit3: { name: "KG" } })).toEqual([{ name: "KG", ratio: 1 }]);
    expect(extractItemUnits({})).toEqual([]);
  });
});
