import { describe, test, expect } from "bun:test";
import {
  resolveAutoproduksiItemType,
  groupAutoproduksiFormulaRows,
  autoproduksiFormulaRowError,
  validateAutoproduksiFormulaGroup,
  buildAutoproduksiFormulaRecord,
  type ImportRowRecord,
} from "./autoproduksi-formula.mapping";

// § kasus nyata dari Autoproduksi_Formula Produksi.xlsx (client, 2026-10-02):
// "Bolu Kukus SP (Spesial)" = Telur 0.5kg + Tepung 0.2kg per 1 Loyang.
const columnMapping: Record<string, string> = {
  "Nama Resep/Formula": "formulaName",
  Cabang: "branchName",
  Gudang: "warehouseName",
  "Akun Perantara": "adjustmentAccountNo",
  "Tipe Barang": "itemType",
  "Nomor Item": "itemNo",
  "Nama Item": "itemName",
  Jumlah: "quantity",
  "Nama Unit": "itemUnitName",
  "Unit Cost": "unitCost",
  "Nomor Project": "projectNo",
  Departemen: "departmentName",
};

const rows: ImportRowRecord[] = [
  {
    id: "r1",
    rawData: {
      "Nama Resep/Formula": "Bolu Kukus SP (Spesial)",
      Cabang: "JAKARTA",
      Gudang: "Utama",
      "Akun Perantara": 110501,
      "Tipe Barang": "BB",
      "Nomor Item": 100006,
      "Nama Item": "Telur",
      Jumlah: "0.5",
      "Nama Unit": "Kg",
    },
  },
  {
    id: "r2",
    rawData: {
      "Nama Resep/Formula": "Bolu Kukus SP (Spesial)",
      Cabang: "JAKARTA",
      Gudang: "Utama",
      "Akun Perantara": 110501,
      "Tipe Barang": "BB",
      "Nomor Item": 100007,
      "Nama Item": "Tepung",
      Jumlah: "0.2",
      "Nama Unit": "Kg",
    },
  },
  {
    id: "r3",
    rawData: {
      "Nama Resep/Formula": "Bolu Kukus SP (Spesial)",
      Cabang: "JAKARTA",
      Gudang: "Utama",
      "Akun Perantara": 110501,
      "Tipe Barang": "BJ",
      "Nomor Item": 100005,
      "Nama Item": "Bolu Kukus SP (Spesial)",
      Jumlah: 1,
      "Nama Unit": "Loyang",
      "Unit Cost": 17000,
    },
  },
];

describe("resolveAutoproduksiItemType", () => {
  test("BB/BJ (literal client) dikenali", () => {
    expect(resolveAutoproduksiItemType("BB")).toBe("BB");
    expect(resolveAutoproduksiItemType("bj")).toBe("BJ");
  });

  test("alias dari komentar client (1/2, Bahan Baku/Barang Jadi) juga dikenali", () => {
    expect(resolveAutoproduksiItemType("1")).toBe("BB");
    expect(resolveAutoproduksiItemType("2")).toBe("BJ");
    expect(resolveAutoproduksiItemType("Bahan Baku")).toBe("BB");
    expect(resolveAutoproduksiItemType("Barang Jadi")).toBe("BJ");
  });

  test("nilai tidak dikenali -> null", () => {
    expect(resolveAutoproduksiItemType("XX")).toBeNull();
    expect(resolveAutoproduksiItemType(undefined)).toBeNull();
  });
});

describe("groupAutoproduksiFormulaRows", () => {
  test("3 baris nama sama -> 1 grup berisi 3 baris", () => {
    const groups = groupAutoproduksiFormulaRows(rows, columnMapping);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.groupKey).toBe("Bolu Kukus SP (Spesial)");
    expect(groups[0]!.rows).toHaveLength(3);
  });

  test("2 formula beda nama -> 2 grup terpisah", () => {
    const otherRow: ImportRowRecord = { id: "r4", rawData: { ...rows[2]!.rawData, "Nama Resep/Formula": "Roti Tawar" } };
    const groups = groupAutoproduksiFormulaRows([...rows, otherRow], columnMapping);
    expect(groups).toHaveLength(2);
  });
});

describe("autoproduksiFormulaRowError", () => {
  test("baris BB tanpa Jumlah -> error quantity", () => {
    const bad = { ...rows[0]!.rawData, Jumlah: undefined };
    expect(autoproduksiFormulaRowError(bad, columnMapping)).toEqual(["quantity"]);
  });

  test("baris BJ TANPA Jumlah tetap valid (takaran formula selalu per 1 unit, Jumlah BJ tidak dipakai)", () => {
    const bjNoQty = { ...rows[2]!.rawData, Jumlah: undefined };
    expect(autoproduksiFormulaRowError(bjNoQty, columnMapping)).toEqual([]);
  });

  test("itemType tidak dikenali -> error itemType", () => {
    const bad = { ...rows[0]!.rawData, "Tipe Barang": "ZZ" };
    expect(autoproduksiFormulaRowError(bad, columnMapping)).toEqual(["itemType"]);
  });

  // § security review Fase 166 — modul ini insert LANGSUNG ke kolom
  // varchar kita sendiri (beda dari 24 modul lain yang cuma teruskan ke
  // Accurate) — field kepanjangan HARUS ditolak di sini, bukan baru
  // ketahuan saat INSERT Postgres gagal dengan pesan mentah.
  test("Nomor Item lebih panjang dari varchar(100) -> error itemNo, bukan nge-insert lalu gagal", () => {
    const bad = { ...rows[0]!.rawData, "Nomor Item": "X".repeat(101) };
    expect(autoproduksiFormulaRowError(bad, columnMapping)).toContain("itemNo");
  });

  test("Nama Resep/Formula persis 255 karakter -> TIDAK error (batas inklusif)", () => {
    const bad = { ...rows[0]!.rawData, "Nama Resep/Formula": "X".repeat(255) };
    expect(autoproduksiFormulaRowError(bad, columnMapping)).not.toContain("formulaName");
  });
});

describe("validateAutoproduksiFormulaGroup", () => {
  test("1 BJ + >=1 BB -> valid (null)", () => {
    const groups = groupAutoproduksiFormulaRows(rows, columnMapping);
    expect(validateAutoproduksiFormulaGroup(groups[0]!, columnMapping)).toBeNull();
  });

  test("0 baris BJ -> error jelas", () => {
    const group = { groupKey: "X", rows: [rows[0]!, rows[1]!] };
    expect(validateAutoproduksiFormulaGroup(group, columnMapping)).toMatch(/TEPAT 1 baris Tipe Barang=BJ/);
  });

  test("2 baris BJ -> error jelas", () => {
    const group = { groupKey: "X", rows: [rows[2]!, rows[2]!] };
    expect(validateAutoproduksiFormulaGroup(group, columnMapping)).toMatch(/TEPAT 1 baris Tipe Barang=BJ/);
  });

  test("0 baris BB -> error jelas", () => {
    const group = { groupKey: "X", rows: [rows[2]!] };
    expect(validateAutoproduksiFormulaGroup(group, columnMapping)).toMatch(/minimal 1 baris Tipe Barang=BB/);
  });
});

describe("buildAutoproduksiFormulaRecord — kasus nyata client", () => {
  test("susun formula + 2 bahan baku dari 3 baris Excel", () => {
    const groups = groupAutoproduksiFormulaRows(rows, columnMapping);
    const record = buildAutoproduksiFormulaRecord(groups[0]!, columnMapping);

    expect(record.name).toBe("Bolu Kukus SP (Spesial)");
    expect(record.finishedGoodItemNo).toBe("100005");
    expect(record.finishedGoodItemUnitName).toBe("Loyang");
    expect(record.standardCost).toBe("17000");
    expect(record.adjustmentAccountNo).toBe("110501");
    expect(record.branchName).toBe("JAKARTA");
    expect(record.warehouseName).toBe("Utama");

    expect(record.items).toHaveLength(2);
    expect(record.items[0]).toMatchObject({ itemNo: "100006", itemUnitName: "Kg", quantity: "0.5" });
    expect(record.items[1]).toMatchObject({ itemNo: "100007", itemUnitName: "Kg", quantity: "0.2" });
  });

  test("Nomor Project/Departemen disertakan kalau diisi (baris BB maupun BJ)", () => {
    const rowsWithProject: ImportRowRecord[] = rows.map((r) => ({
      ...r,
      rawData: { ...r.rawData, "Nomor Project": "PRJ-1", Departemen: "Produksi" },
    }));
    const groups = groupAutoproduksiFormulaRows(rowsWithProject, columnMapping);
    const record = buildAutoproduksiFormulaRecord(groups[0]!, columnMapping);
    expect(record.finishedGoodProjectNo).toBe("PRJ-1");
    expect(record.finishedGoodDepartmentName).toBe("Produksi");
    expect(record.items[0]).toMatchObject({ projectNo: "PRJ-1", departmentName: "Produksi" });
  });
});
