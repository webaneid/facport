import { describe, test, expect } from "bun:test";
import { extractItemUnits, parseItemNos, MAX_ITEM_NOS } from "./accurate-item-units";

describe("parseItemNos", () => {
  test("dipisah koma, dipangkas, duplikat dibuang", () => {
    expect(parseItemNos(" 100028, BENCH-INV1 ,100028,")).toEqual(["100028", "BENCH-INV1"]);
  });
  test("kosong, melebihi batas, atau kode > 100 karakter → null", () => {
    expect(parseItemNos(" , ")).toBeNull();
    expect(parseItemNos(Array.from({ length: MAX_ITEM_NOS + 1 }, (_, i) => `K${i}`).join(","))).toBeNull();
    expect(parseItemNos("X".repeat(101))).toBeNull();
  });
});

// § Fase 222 — respons ASLI Accurate (test call nyata 2026-11-17, barang uji dengan 3 satuan): `unit2`/`unit3` objek nested, `ratio2/3` angka, unit4/5 null, ratio4/5 0.
describe("extractItemUnits — respons nyata item/list.do", () => {
  test("Pcs + Box (12) + Karton (144); unit4/5 null diabaikan", () => {
    const real = { no: "UJI-MS-222", ratio2: 12, unit4: null, unit5: null, name: "Uji Multi Satuan 222", unit1: { codeUnitTax: null, name: "Pcs", id: 100 }, unit2: { codeUnitTax: null, name: "Box", id: 150 }, id: 450, unit3: { codeUnitTax: null, name: "Karton", id: 151 }, ratio4: 0, ratio3: 144, ratio5: 0 };
    expect(extractItemUnits(real)).toEqual([
      { name: "Pcs", ratio: 1 },
      { name: "Box", ratio: 12 },
      { name: "Karton", ratio: 144 },
    ]);
  });
});

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
