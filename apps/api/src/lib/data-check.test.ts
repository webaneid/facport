import { describe, expect, test } from "bun:test";
import { buildDataCheck } from "./data-check";

describe("buildDataCheck", () => {
  const mapping = { "Cust No": "customerNo", "Item No": "itemNo", Description: "description", "Trans No": "number" };

  test("data bersih -> tanpa peringatan, hitungan sesuai", () => {
    const rows = [{ "Cust No": "C.001", "Item No": "A1", Description: "x" }];
    expect(buildDataCheck(rows, mapping, 0)).toEqual({ cleanedCells: 0, normalizedKeyCells: 0, warnings: [] });
  });

  test("cleanedCells dari parse diteruskan apa adanya", () => {
    expect(buildDataCheck([], mapping, 7).cleanedCells).toBe(7);
  });

  test("spasi ganda & huruf lebar penuh di kolom kunci dihitung sebagai dirapikan; kolom non-kunci tidak", () => {
    const rows = [
      { "Cust No": "CUST  IN", "Item No": "\uff211", Description: "dua  spasi", "Trans No": "INV  1" },
      { "Cust No": "C.002", "Item No": "A2" },
    ];
    const check = buildDataCheck(rows, mapping, 0);
    expect(check.normalizedKeyCells).toBe(2);
    expect(check.warnings).toEqual([]);
  });

  test("karakter non-ASCII yang tersisa di kolom kunci -> peringatan dengan contoh, nomor baris, kode karakter", () => {
    const rows = [
      { "Cust No": "C.001" },
      { "Cust No": "\u0421.002" },
      { "Cust No": "C\u2013003" },
    ];
    const [w] = buildDataCheck(rows, mapping, 0).warnings;
    expect(w!.column).toBe("Cust No");
    expect(w!.count).toBe(2);
    expect(w!.rows).toEqual([2, 3]);
    expect(w!.example).toContain("U+0421");
  });

  test("non-ASCII di kolom teks bebas TIDAK diperingatkan (en dash di Description itu wajar)", () => {
    const rows = [{ Description: "barang \u2013 baru", "Trans No": "INV\u20131" }];
    expect(buildDataCheck(rows, mapping, 0).warnings).toEqual([]);
  });

  test("contoh baris dibatasi 5, hitungan tetap lengkap", () => {
    const rows = Array.from({ length: 9 }, () => ({ "Cust No": "\u0421-1" }));
    const [w] = buildDataCheck(rows, mapping, 0).warnings;
    expect(w!.count).toBe(9);
    expect(w!.rows.length).toBe(5);
  });
});
