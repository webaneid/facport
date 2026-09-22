import { describe, test, expect } from "bun:test";
import {
  buildMaterialSlipPayload,
  extractDataClassificationValues,
  groupMaterialSlipRows,
  materialSlipHeaderMissing,
  materialSlipMapping,
  materialSlipRowError,
  resolveMaterialSlipType,
} from "./material-slip.mapping";
import { generateTemplateBuffer, parseExcelBuffer } from "../excel";
import { materialSlipTemplateGuide } from "./template-guide";

// § Fase 148, architecture-material-slip.md — Material Slip: grouping 2-level, materialSlipType enum literal (contoh riil client 2026-09-22).
const map = materialSlipMapping.defaultColumnMap;
const row = (id: string, data: Record<string, unknown>) => ({ id, rawData: data });

describe("resolveMaterialSlipType", () => {
  test("enum literal (contoh riil client: 'ITEM_PICK') & dictionary Indonesia", () => {
    expect(resolveMaterialSlipType("ITEM_PICK")).toBe("ITEM_PICK");
    expect(resolveMaterialSlipType("item_return")).toBe("ITEM_RETURN");
    expect(resolveMaterialSlipType("Pengambilan")).toBe("ITEM_PICK");
    expect(resolveMaterialSlipType(" Pengembalian ")).toBe("ITEM_RETURN");
  });
  test("tidak dikenali / kosong → null", () => {
    expect(resolveMaterialSlipType("lain")).toBeNull();
    expect(resolveMaterialSlipType("")).toBeNull();
    expect(resolveMaterialSlipType(undefined)).toBeNull();
  });
});

describe("materialSlipRowError", () => {
  test("baris item valid (itemNo terisi, tipe dikenali/tidak dipetakan di baris ini)", () => {
    expect(materialSlipRowError({ "Item No": 10001 }, map)).toEqual([]);
  });
  test("itemNo kosong → itemNo", () => {
    expect(materialSlipRowError({ "Item No": "" }, map)).toEqual(["itemNo"]);
  });
  test("tipe terisi tapi tidak dikenali → materialSlipType", () => {
    expect(materialSlipRowError({ "Item No": "A", "Material Slip Type": "zzz" }, map)).toEqual(["materialSlipType"]);
  });
});

describe("materialSlipHeaderMissing", () => {
  test("lengkap → kosong", () => {
    expect(materialSlipHeaderMissing({ "Trans Date": "02/02/2026", "Work Order No": "WO-001", "Material Slip Type": "ITEM_PICK" }, map)).toEqual([]);
  });
  test("kosong/tidak dikenali → label kolom", () => {
    expect(materialSlipHeaderMissing({ "Trans Date": "", "Work Order No": "WO-001", "Material Slip Type": "zzz" }, map)).toEqual(["Trans Date", "Material Slip Type"]);
  });
});

describe("groupMaterialSlipRows — data riil client 2026-09-22", () => {
  test("2 baris Trans No sama, Item No beda → 1 dokumen 2 barang, masing-masing bawa serial sendiri", () => {
    const groups = groupMaterialSlipRows(
      [
        row("1", { "Branch Name": "Jakarta", "Trans Date": "2026-02-02", "Trans No": "MS-001", "Material Slip Type": "ITEM_PICK", "Work Order No": "WO-001", "Item No": 10001, Qty: 10, "Unit Name": "PCS", "Warehouse Name": "GD. JAKARTA", "Serial No": "XX1", Qty_1: 10, "Expired Date": "2027-09-22" }),
        row("2", { "Branch Name": "Jakarta", "Trans Date": "2026-02-02", "Trans No": "MS-001", "Material Slip Type": "ITEM_PICK", "Work Order No": "WO-001", "Item No": 10002, Qty: 10, "Unit Name": "PCS", "Warehouse Name": "GD. JAKARTA", "Serial No": "XX2", Qty_1: 10, "Expired Date": "2027-09-22" }),
      ],
      map,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
    const payload = buildMaterialSlipPayload(groups[0]!, map);
    expect(payload).toMatchObject({ transDate: "02/02/2026", workOrderNumber: "WO-001", materialSlipType: "ITEM_PICK", number: "MS-001", branchName: "Jakarta" });
    expect(payload.detailItem).toEqual([
      { itemNo: "10001", quantity: 10, itemUnitName: "PCS", warehouseName: "GD. JAKARTA", detailSerialNumber: [{ serialNumberNo: "XX1", quantity: 10, expiredDate: "22/09/2027" }] },
      { itemNo: "10002", quantity: 10, itemUnitName: "PCS", warehouseName: "GD. JAKARTA", detailSerialNumber: [{ serialNumberNo: "XX2", quantity: 10, expiredDate: "22/09/2027" }] },
    ]); // § "Item Name" tidak diisi di contoh riil ini, jadi detailName tidak muncul
  });

  test("1 barang, banyak baris serial lanjutan (pola Finished Good Slip, tetap harus didukung di sini)", () => {
    const groups = groupMaterialSlipRows(
      [
        row("1", { "Trans No": "MS-002", "Trans Date": "2026-02-02", "Work Order No": "WO-002", "Material Slip Type": "ITEM_PICK", "Item No": "A", Qty: 100 }),
        row("2", { "Trans No": "MS-002", "Item No": "A", "Serial No": "S1", Qty_1: 40 }),
        row("3", { "Trans No": "MS-002", "Item No": "A", "Serial No": "S2", Qty_1: 60 }),
      ],
      map,
    );
    expect(groups[0]!.items).toHaveLength(1);
    const payload = buildMaterialSlipPayload(groups[0]!, map);
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]!.detailSerialNumber).toEqual([{ serialNumberNo: "S1", quantity: 40 }, { serialNumberNo: "S2", quantity: 60 }]);
  });
});

describe("extractDataClassificationValues", () => {
  test("5 slot, hanya yang terisi", () => {
    expect(extractDataClassificationValues({ CLS1: " A ", CLS3: "B", CLS2: "" }, map)).toEqual([
      { index: 1, name: "A" },
      { index: 3, name: "B" },
    ]);
  });
});

describe("materialSlipMapping", () => {
  test("required: tanggal, Work Order No, tipe (cabang & gudang OPSIONAL — § Quirk)", () => {
    expect([...materialSlipMapping.requiredFields]).toEqual(["transDate", "workOrderNumber", "materialSlipType"]);
  });
  test("semua field defaultColumnMap valid di fieldToAccuratePath", () => {
    for (const field of Object.values(map)) expect(materialSlipMapping.fieldToAccuratePath).toHaveProperty(field);
  });
});

describe("template unduhan — putaran template → parse → grouping (mirror route sesungguhnya)", () => {
  test("3 baris contoh (1 dokumen, 2 barang, barang ke-2 punya baris lanjutan serial) lolos tanpa galat", () => {
    const buffer = generateTemplateBuffer(materialSlipTemplateGuide, [
      [
        { column: "Branch Name", value: "Jakarta" },
        { column: "Trans Date", value: "02/02/2026" },
        { column: "Trans No", value: "MS-2026-0001" },
        { column: "Material Slip Type", value: "ITEM_PICK" },
        { column: "Work Order No", value: "WO-001" },
        { column: "Item No", value: "10002" },
        { column: "Qty", value: "10" },
        { column: "Unit Name", value: "PCS" },
        { column: "Warehouse Name", value: "GD. JAKARTA" },
        { column: "Serial No", value: "XX2" },
        { column: "Qty", value: "10" },
      ],
      [
        { column: "Trans No", value: "MS-2026-0001" },
        { column: "Item No", value: "10002" },
        { column: "Serial No", value: "XX3" },
        { column: "Qty", value: "" }, // kemunculan ke-1 "Qty" (item) dikosongkan — baris ini HANYA lanjutan serial
        { column: "Qty", value: "5" }, // kemunculan ke-2 "Qty" (serial)
      ],
    ]);
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.rows).toHaveLength(3);

    const columnMapping = Object.fromEntries(parsed.headers.filter((h) => materialSlipMapping.defaultColumnMap[h]).map((h) => [h, materialSlipMapping.defaultColumnMap[h]!]));
    const rows = parsed.rows.map((r, i) => ({ id: String(i), rawData: r }));
    for (const row of rows) expect(materialSlipRowError(row.rawData, columnMapping)).toEqual([]);
  });
});
