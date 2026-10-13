import { describe, test, expect } from "bun:test";
import * as XLSX from "xlsx";
import { buildFormulaExportRows, FORMULA_EXPORT_HEADERS, generateFormulaExportBuffer } from "./autoproduksi-formula-export";
import { autoproduksiFormulaMapping, groupAutoproduksiFormulaRows, buildAutoproduksiFormulaRecord, validateAutoproduksiFormulaGroup } from "./import-mapping/autoproduksi-formula.mapping";

const formulas = [
  {
    formulaNumber: 2,
    name: "Roti Tawar",
    finishedGoodItemNo: "FG-2",
    finishedGoodItemName: "Roti",
    finishedGoodItemUnitName: "Pcs",
    standardCost: "1500.00",
    adjustmentAccountNo: "110501",
    isActive: false,
    items: [
      { itemNo: "RM-B", itemName: "Gula", itemUnitName: "Kg", quantity: "0.2500", sortOrder: 1 },
      { itemNo: "RM-A", itemName: null, itemUnitName: "Kg", quantity: "1.0000", sortOrder: 0 },
    ],
  },
  {
    formulaNumber: 1,
    name: "Bolu",
    finishedGoodItemNo: "FG-1",
    finishedGoodItemName: null,
    finishedGoodItemUnitName: "Loyang",
    standardCost: null,
    adjustmentAccountNo: "110501",
    isActive: true,
    items: [{ itemNo: "RM-A", itemName: "Telur", itemUnitName: "Kg", quantity: "0.5000", sortOrder: 0 }],
  },
];

describe("export Formula (Fase 193)", () => {
  test("header = semua kolom peta Import (urutan sama, termasuk Status) + No. Formula di akhir", () => {
    expect(FORMULA_EXPORT_HEADERS.slice(0, -1)).toEqual(Object.keys(autoproduksiFormulaMapping.defaultColumnMap));
    expect(FORMULA_EXPORT_HEADERS.at(-1)).toBe("No. Formula");
    expect(FORMULA_EXPORT_HEADERS).toContain("Status");
  });

  test("urut nomor Formula; per Formula: BJ dulu lalu BB menurut sortOrder; angka numerik", () => {
    const rows = buildFormulaExportRows(formulas);
    expect(rows.map((r) => [r["Nama Resep/Formula"], r["Tipe Barang"], r["Nomor Item"]])).toEqual([
      ["Bolu", "BJ", "FG-1"],
      ["Bolu", "BB", "RM-A"],
      ["Roti Tawar", "BJ", "FG-2"],
      ["Roti Tawar", "BB", "RM-A"],
      ["Roti Tawar", "BB", "RM-B"],
    ]);
    const bj = rows[2]!;
    expect(bj["Unit Cost"]).toBe(1500);
    expect(bj.Jumlah).toBe("");
    expect(rows[4]!.Jumlah).toBe(0.25);
    expect(rows[0]!["Unit Cost"]).toBe("");
    expect(rows[0]!["Nama Item"]).toBe("");
  });

  test("No. Formula (F-001) dan Status (Aktif/Nonaktif) terisi di setiap baris", () => {
    const rows = buildFormulaExportRows(formulas);
    expect(rows.filter((r) => r["Nama Resep/Formula"] === "Roti Tawar").every((r) => r["No. Formula"] === "F-002" && r.Status === "Nonaktif")).toBe(true);
    expect(rows.filter((r) => r["Nama Resep/Formula"] === "Bolu").every((r) => r["No. Formula"] === "F-001" && r.Status === "Aktif")).toBe(true);
  });

  test("ROUND-TRIP: hasil export dibaca balik oleh pipeline Import → Formula identik (termasuk nonaktif)", () => {
    const buffer = generateFormulaExportBuffer(formulas);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const mapping = { ...autoproduksiFormulaMapping.defaultColumnMap, Status: "status" };
    const groups = groupAutoproduksiFormulaRows(parsed.map((rawData, i) => ({ id: String(i), rawData })), mapping);
    expect(groups).toHaveLength(2);
    const records = groups.map((g) => {
      expect(validateAutoproduksiFormulaGroup(g, mapping)).toBeNull();
      return buildAutoproduksiFormulaRecord(g, mapping);
    });
    const roti = records.find((r) => r.name === "Roti Tawar")!;
    expect(roti.isActive).toBe(false);
    expect(roti.standardCost).toBe("1500");
    expect(roti.items.map((i) => [i.itemNo, i.quantity])).toEqual([["RM-A", "1"], ["RM-B", "0.25"]]);
    expect(records.find((r) => r.name === "Bolu")!.isActive).toBe(true);
  });

  test("tanpa Formula → hanya baris header (bukan galat)", () => {
    const wb = XLSX.read(generateFormulaExportBuffer([]), { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, { header: 1 })).toHaveLength(1);
  });

  test("nilai berawalan = + - @ tetap SEL TEKS di xlsx (bukan rumus) dan tidak diubah — round-trip tetap persis", () => {
    const evil = [{ ...formulas[1]!, name: '=HYPERLINK("http://x")', items: [{ itemNo: "@SUM(1)", itemName: "+cmd", itemUnitName: "Kg", quantity: "1", sortOrder: 0 }] }];
    const wb = XLSX.read(generateFormulaExportBuffer(evil), { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    expect(sheet.A2!.t).toBe("s");
    expect(sheet.A2!.f).toBeUndefined();
    expect(sheet.A2!.v).toBe('=HYPERLINK("http://x")');
  });
});
