import { describe, test, expect } from "bun:test";
import * as XLSX from "xlsx";
import { generateTemplateBuffer, parseExcelBuffer } from "../excel";
import { workOrderTemplateGuide } from "./template-guide";
import {
  buildWorkOrderPayload,
  extractDataClassificationValues,
  extractPersonInCharge,
  groupWorkOrderRows,
  resolveWorkOrderType,
  validateGroupConsistency,
  workOrderHeaderMissing,
  workOrderMapping,
  workOrderRowError,
} from "./work-order.mapping";

// § Fase 147, architecture-work-order.md — Work Order: 1 baris lebar = header + maks. 1 entri per section (bahan, biaya, proses, produk sampingan).
const map = workOrderMapping.defaultColumnMap;
const row = (id: string, data: Record<string, unknown>) => ({ id, rawData: data });

const header = {
  "Transaction Date": "17/09/2026",
  "Trans No": "WO-1",
  "Work Acc No": "1-1500",
  "Work Order Type": "Nomor Formula",
  "Bill Material no": "BOM-1",
  "Branch Name": "Pusat",
  "Product: Item No": "FG-1",
  "Product: Qty": 10,
  "Variance Acc No": "5-9000",
  "Start Date": "18/09/2026",
  "End Date": "25/09/2026",
};

describe("resolveWorkOrderType", () => {
  test("enum literal & istilah client (Kode Produk / Nomor Formula / Nomor Rencana Produksi)", () => {
    expect(resolveWorkOrderType("PRODUCT")).toBe("PRODUCT");
    expect(resolveWorkOrderType("bill_of_material")).toBe("BILL_OF_MATERIAL");
    expect(resolveWorkOrderType("Kode Produk")).toBe("PRODUCT");
    expect(resolveWorkOrderType(" Nomor Formula ")).toBe("BILL_OF_MATERIAL");
    expect(resolveWorkOrderType("Nomor Rencana Produksi")).toBe("MANUFACTURE_ORDER");
  });
  test("tidak dikenali / kosong → null (bukan default diam-diam)", () => {
    expect(resolveWorkOrderType("lain")).toBeNull();
    expect(resolveWorkOrderType("")).toBeNull();
    expect(resolveWorkOrderType(undefined)).toBeNull();
  });
});

describe("defaultColumnMap", () => {
  test("semua field-nya valid di fieldToAccuratePath", () => {
    for (const field of Object.values(map)) expect(workOrderMapping.fieldToAccuratePath).toHaveProperty(field);
  });
  test("semua requiredFields punya kolom di defaultColumnMap", () => {
    const mapped = new Set(Object.values(map));
    for (const field of workOrderMapping.requiredFields) expect(mapped.has(field)).toBe(true);
  });
  test('"Save As Status Type" TIDAK dipetakan (keputusan client: approval ditunda)', () => {
    expect(map).not.toHaveProperty("Save As Status Type");
  });
});

describe("header duplikat Excel client — dari parseExcelBuffer sampai mapping", () => {
  test("nama kolom berulang antar-section masuk ke field section yang benar", () => {
    const columns = [
      "Item No", "Qty", "Project No", "CLS1",
      "Expense No", "Expense Qty", "Project No", "CLS1",
      "Extra FG: Item No", "Extra FG: Qty", "Extra FG: Portion", "Project No", "CLS1",
    ];
    const values = ["RM-1", 5, "P-MAT", "K-MAT", "JS-1", 2, "P-EXP", "K-EXP", "FG-2", 1, 30, "P-FG", "K-FG"];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, values]), "Sheet1");
    const parsed = parseExcelBuffer(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
    const columnMapping = Object.fromEntries(parsed.headers.map((h) => [h, map[h] ?? ""]).filter(([, f]) => f));
    expect(Object.keys(columnMapping)).toHaveLength(13);

    const payload = buildWorkOrderPayload([parsed.rows[0]!], columnMapping);
    expect(payload.detailMaterial).toEqual([{ itemNo: "RM-1", quantity: 5, projectNo: "P-MAT", dataClassification1Name: "K-MAT" }]);
    expect(payload.detailExpense).toEqual([{ itemNo: "JS-1", quantity: 2, projectNo: "P-EXP", dataClassification1Name: "K-EXP" }]);
    expect(payload.detailExtraFinishGood).toEqual([{ itemNo: "FG-2", quantity: 1, portion: 30, projectNo: "P-FG", dataClassification1Name: "K-FG" }]);
  });
});

describe("workOrderRowError", () => {
  test("baris hanya header (tanpa section) valid", () => {
    expect(workOrderRowError(header, map)).toEqual([]);
  });
  test("bahan baku: itemNo & quantity wajib bila section tersentuh", () => {
    expect(workOrderRowError({ ...header, Qty: 5 }, map)).toEqual(["matItemNo"]);
    expect(workOrderRowError({ ...header, "Item No": "RM-1" }, map)).toEqual(["matQuantity"]);
    expect(workOrderRowError({ ...header, "Item Notes": "catatan saja" }, map).sort()).toEqual(["matItemNo", "matQuantity"]);
  });
  test("produk sampingan: itemNo, quantity, portion wajib (portal live)", () => {
    expect(workOrderRowError({ ...header, "Extra FG: Item No": "FG-2" }, map).sort()).toEqual(["fgPortion", "fgQuantity"]);
  });
  test("nilai non-numerik di kolom angka ditandai", () => {
    expect(workOrderRowError({ ...header, "Item No": "RM-1", Qty: "abc" }, map)).toEqual(["matQuantity"]);
    expect(workOrderRowError({ ...header, "Product: Qty": "x" }, map)).toEqual(["productQuantity"]);
  });
  test("Work Order Type terisi tapi tidak dikenali → workOrderType", () => {
    expect(workOrderRowError({ ...header, "Work Order Type": "zzz" }, map)).toEqual(["workOrderType"]);
  });
});

describe("workOrderHeaderMissing", () => {
  test("lengkap → kosong; kosong/tipe tak dikenali → label kolom Excel", () => {
    expect(workOrderHeaderMissing(header, map)).toEqual([]);
    expect(workOrderHeaderMissing({ ...header, "Bill Material no": "", "End Date": "" }, map)).toEqual(["End Date", "Bill Material no"]);
    expect(workOrderHeaderMissing({ ...header, "Work Order Type": "zzz" }, map)).toEqual(["Work Order Type"]);
  });
});

describe("groupWorkOrderRows & validateGroupConsistency", () => {
  test("digabung by Trans No; kosong = 1 baris 1 dokumen", () => {
    const groups = groupWorkOrderRows([row("1", header), row("2", { "Trans No": "wo-1" }), row("3", { "Trans No": "" })], map);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["1", "2"]);
  });
  test("baris berikutnya boleh mengosongkan header", () => {
    const group = { groupKey: "WO-1", groupColumn: "Trans No", rows: [row("1", header), row("2", { "Trans No": "WO-1", "Item No": "RM-2", Qty: 1 })] };
    expect(validateGroupConsistency(group, map)).toBeNull();
  });
  test("baris berikutnya mengisi header BEDA → galat menyebut kolom & baris", () => {
    const group = { groupKey: "WO-1", groupColumn: "Trans No", rows: [row("1", header), row("2", { ...header, "Bill Material no": "BOM-2" })] };
    const msg = validateGroupConsistency(group, map);
    expect(msg).toContain("Bill Material no tidak konsisten");
    expect(msg).toContain("baris 2");
  });
  test("tipe sama tapi beda penulisan (Kode Produk vs PRODUCT) tetap konsisten", () => {
    const g = { groupKey: "WO-1", groupColumn: "Trans No", rows: [row("1", { ...header, "Work Order Type": "Kode Produk" }), row("2", { ...header, "Work Order Type": "PRODUCT" })] };
    expect(validateGroupConsistency(g, map)).toBeNull();
  });
});

describe("buildWorkOrderPayload", () => {
  test("header dari baris pertama + array section dikumpulkan lintas baris; keempat array selalu ada", () => {
    const payload = buildWorkOrderPayload(
      [
        row("1", { ...header, Description: "Batch A", "Product: Unit Name": "PCS", "Manual Closed": "Y", "Item No": "RM-1", Qty: 5, "Standard Cost Date": "2026-09-01", "Sort No": "2", "Process Category Name_2": "Potong", subCon: "TRUE" }).rawData,
        { "Trans No": "WO-1", "Item No": "RM-2", Qty: 3, "Expense No": "JS-1", "Expense Qty": 1 },
      ],
      map,
    );
    expect(payload).toMatchObject({
      transDate: "17/09/2026", startDate: "18/09/2026", endDate: "25/09/2026", number: "WO-1", workOrderType: "BILL_OF_MATERIAL",
      billOfMaterialNo: "BOM-1", itemNo: "FG-1", quantity: 10, itemUnitName: "PCS", workAccountNo: "1-1500", varianceAccountNo: "5-9000",
      branchName: "Pusat", description: "Batch A", manualClosed: true,
    });
    expect(payload.detailMaterial).toEqual([
      { itemNo: "RM-1", quantity: 5, standardCostDate: "01/09/2026" },
      { itemNo: "RM-2", quantity: 3 },
    ]);
    expect(payload.detailExpense).toEqual([{ itemNo: "JS-1", quantity: 1 }]);
    expect(payload.detailProcess).toEqual([{ processCategoryName: "Potong", sortNumber: 2, subCon: true }]);
    expect(payload.detailExtraFinishGood).toEqual([]);
  });
  test("tanpa Manual Closed → field tidak dikirim (bukan false)", () => {
    expect(buildWorkOrderPayload([header], map)).not.toHaveProperty("manualClosed");
  });
});

describe("extractPersonInCharge", () => {
  test("nama PIC dari baris pertama, null bila kosong/tidak dipetakan", () => {
    expect(extractPersonInCharge({ "PIC ID": " Budi " }, map)).toBe("Budi");
    expect(extractPersonInCharge({ "PIC ID": "" }, map)).toBeNull();
    expect(extractPersonInCharge({ "PIC ID": "Budi" }, {})).toBeNull();
  });
});

describe("extractDataClassificationValues", () => {
  test("CLS1-3 dari semua section, index = nomor slot", () => {
    expect(extractDataClassificationValues({ CLS1: "A", CLS2_1: " B ", CLS3_2: "C", CLS2: "" }, map)).toEqual([
      { index: 1, name: "A" },
      { index: 2, name: "B" },
      { index: 3, name: "C" },
    ]);
  });
});

describe("template unduhan", () => {
  test("putaran template → parse → mapping: semua kolom dikenali (kecuali Save As Status Type), 61 kolom, dedupe benar", () => {
    const parsed = parseExcelBuffer(generateTemplateBuffer(workOrderTemplateGuide));
    expect(parsed.headers).toHaveLength(61);
    expect(new Set(parsed.headers).size).toBe(61);
    const unmapped = parsed.headers.filter((h) => !map[h]);
    expect(unmapped).toEqual(["Save As Status Type"]);
    // baris contoh dalam template lolos validasi baris & header
    const columnMapping = Object.fromEntries(parsed.headers.filter((h) => map[h]).map((h) => [h, map[h]!]));
    expect(workOrderRowError(parsed.rows[0]!, columnMapping)).toEqual([]);
    expect(workOrderHeaderMissing(parsed.rows[0]!, columnMapping)).toEqual([]);
  });
});
