import { describe, test, expect } from "bun:test";
import {
  buildJobOrderPayload,
  buildMaterialAdjustmentDetailItems,
  extractDataClassificationValues,
  groupJobCostingRows,
  numberColumnOf,
  type ImportRowRecord,
} from "./job-costing.mapping";

// § Fase 139 — Job Costing BUKAN 1 payload, 2 fungsi builder TERPISAH:
// `buildJobOrderPayload` (header + detailExpense[], dipanggil job-order/save.do)
// dan `buildMaterialAdjustmentDetailItems` (RM detailItem[], dipanggil
// material-adjustment/save.do — jobOrderNumber diisi TERPISAH oleh
// caller/worker dari respons panggilan pertama, BUKAN di sini). 1 baris
// Excel bisa isi kolom RM SAJA, Expense SAJA, atau keduanya.
describe("groupJobCostingRows / numberColumnOf", () => {
  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan 'No. Job Order' sama digabung 1 grup", () => {
    const columnMapping = { "No. Job Order": "number" };
    const rows = [row("1", { "No. Job Order": "JO-1" }), row("2", { "No. Job Order": "JO-1" }), row("3", { "No. Job Order": "JO-2" })];
    const groups = groupJobCostingRows(rows, columnMapping);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toHaveLength(2);
    expect(groups[1]!.rows).toHaveLength(1);
  });

  test("kolom 'number' tidak dimapping -> tiap baris jadi grup sendiri (opsional)", () => {
    const rows = [row("1", { X: "a" }), row("2", { X: "b" })];
    expect(groupJobCostingRows(rows, {})).toHaveLength(2);
  });

  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ Tanggal: "transDate" })).toBeNull();
  });
});

describe("buildJobOrderPayload", () => {
  const columnMapping = {
    Tanggal: "transDate",
    "No. Job Order": "number",
    "Job Account No": "jobAccountNo",
    "Difference Account No": "differenceAccountNo",
    Keterangan: "description",
    "Nama Cabang": "branchName",
    "Expense No": "expenseAccountNo",
    "Expense Name": "expenseName",
    "Expense Amount": "expenseAmount",
    Note: "expenseNotes",
  };

  test("header dari baris PERTAMA, detailItem[] SELALU kosong (RM tidak di sini)", () => {
    const payload = buildJobOrderPayload(
      [{ Tanggal: "2026-09-17", "No. Job Order": "JO-001", "Job Account No": "1-2000", "Nama Cabang": "Kantor Pusat" }],
      columnMapping,
    );
    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.number).toBe("JO-001");
    expect(payload.jobAccountNo).toBe("1-2000");
    expect(payload.branchName).toBe("Kantor Pusat");
    expect(payload.detailItem).toEqual([]);
  });

  test("baris tanpa kolom Expense No -> TIDAK masuk detailExpense[]", () => {
    const payload = buildJobOrderPayload(
      [{ Tanggal: "2026-09-17", "Job Account No": "1-2000", "Nama Cabang": "Kantor Pusat" }],
      columnMapping,
    );
    expect(payload.detailExpense).toEqual([]);
  });

  test("baris dengan Expense No terisi -> masuk detailExpense[]", () => {
    const rows = [
      { Tanggal: "2026-09-17", "Job Account No": "1-2000", "Nama Cabang": "Kantor Pusat", "Expense No": "6-1000", "Expense Name": "Biaya Produksi", "Expense Amount": 50000, Note: "catatan biaya" },
    ];
    const payload = buildJobOrderPayload(rows, columnMapping);
    expect(payload.detailExpense).toEqual([
      { accountNo: "6-1000", expenseName: "Biaya Produksi", expenseAmount: 50000, expenseNotes: "catatan biaya" },
    ]);
  });

  test("multi-baris campuran (1 baris expense, 1 baris tanpa expense) -> cuma yang terisi masuk array", () => {
    const rows = [
      { Tanggal: "2026-09-17", "Job Account No": "1-2000", "Nama Cabang": "Kantor Pusat" },
      { "Expense No": "6-1000", "Expense Name": "Biaya Lembur", "Expense Amount": 100000 },
    ];
    const payload = buildJobOrderPayload(rows, columnMapping);
    expect(payload.detailExpense).toHaveLength(1);
    expect((payload.detailExpense as Record<string, unknown>[])[0]!.expenseName).toBe("Biaya Lembur");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildJobOrderPayload([{ Tanggal: 46660, "Job Account No": "1-2000" }], columnMapping);
    expect(payload.transDate).toBe("30/09/2027");
  });

  test("kolom root opsional kosong -> TIDAK ikut masuk payload", () => {
    const payload = buildJobOrderPayload([{ Tanggal: "2026-09-17" }], columnMapping);
    expect(payload.jobAccountNo).toBeUndefined();
    expect(payload.branchName).toBeUndefined();
    expect(payload.differenceAccountNo).toBeUndefined();
    expect(payload.description).toBeUndefined();
  });
});

describe("buildMaterialAdjustmentDetailItems", () => {
  const columnMapping = {
    "RM_Item No": "rmItemNo",
    RM_Qty: "rmQty",
    RM_Unit: "rmUnit",
    "Project No": "projectNo",
    "Dept Name": "deptName",
    Warehouse: "warehouseName",
    "Note Penting": "rmNotes",
    RM_CLS1: "rmCls1",
    RM_CLS2: "rmCls2",
    RM_CLS3: "rmCls3",
    "Serial No": "serialNo",
    "SN - Qty": "serialQty",
    "SN - Exp Date": "serialExpDate",
    "Expense No": "expenseAccountNo",
  };

  test("baris dengan RM_Item No terisi -> 1 detailItem lengkap", () => {
    const items = buildMaterialAdjustmentDetailItems(
      [{ "RM_Item No": "BRG-001", RM_Qty: 5, RM_Unit: "PCS", Warehouse: "GD-Utama", "Project No": "PRJ-1", "Dept Name": "Produksi" }],
      columnMapping,
    );
    expect(items).toEqual([
      { itemNo: "BRG-001", quantity: 5, itemUnitName: "PCS", warehouseName: "GD-Utama", projectNo: "PRJ-1", departmentName: "Produksi" },
    ]);
  });

  test("baris tanpa RM_Item No (murni Expense) -> TIDAK masuk detailItem[]", () => {
    const items = buildMaterialAdjustmentDetailItems([{ "Expense No": "6-1000" }], columnMapping);
    expect(items).toEqual([]);
  });

  test("RM_CLS1-3 -> dataClassification1-3Name", () => {
    const items = buildMaterialAdjustmentDetailItems(
      [{ "RM_Item No": "BRG-001", RM_Qty: 1, RM_CLS1: "Kategori A", RM_CLS3: "Kategori C" }],
      columnMapping,
    );
    expect(items[0]!.dataClassification1Name).toBe("Kategori A");
    expect(items[0]!.dataClassification2Name).toBeUndefined();
    expect(items[0]!.dataClassification3Name).toBe("Kategori C");
  });

  test("ketiga kolom serial terisi -> 1 elemen detailSerialNumber (RESMI didokumentasikan endpoint ini)", () => {
    const items = buildMaterialAdjustmentDetailItems(
      [{ "RM_Item No": "BRG-001", RM_Qty: 1, "Serial No": "SN-001", "SN - Qty": 1, "SN - Exp Date": "2027-01-01" }],
      columnMapping,
    );
    expect(items[0]!.detailSerialNumber).toEqual([{ serialNumberNo: "SN-001", quantity: 1, expiredDate: "01/01/2027" }]);
  });

  test("kolom serial semua kosong -> detailSerialNumber TIDAK ikut masuk", () => {
    const items = buildMaterialAdjustmentDetailItems([{ "RM_Item No": "BRG-001", RM_Qty: 1 }], columnMapping);
    expect(items[0]!.detailSerialNumber).toBeUndefined();
  });

  test("multi-baris -> tiap baris RM jadi 1 elemen array, baris Expense-only dilewati", () => {
    const rows = [
      { "RM_Item No": "BRG-1", RM_Qty: 5 },
      { "Expense No": "6-1000" },
      { "RM_Item No": "BRG-2", RM_Qty: 3 },
    ];
    const items = buildMaterialAdjustmentDetailItems(rows, columnMapping);
    expect(items).toHaveLength(2);
    expect(items[0]!.itemNo).toBe("BRG-1");
    expect(items[1]!.itemNo).toBe("BRG-2");
  });
});

describe("extractDataClassificationValues", () => {
  const columnMapping = { RM_CLS1: "rmCls1", RM_CLS2: "rmCls2", RM_CLS3: "rmCls3" };

  test("3 slot RM_CLS1-3 terisi -> 3 entri", () => {
    const values = extractDataClassificationValues({ RM_CLS1: "A", RM_CLS2: "B", RM_CLS3: "C" }, columnMapping);
    expect(values).toEqual([
      { index: 1, name: "A" },
      { index: 2, name: "B" },
      { index: 3, name: "C" },
    ]);
  });

  test("kolom kosong -> tidak masuk hasil", () => {
    const values = extractDataClassificationValues({ RM_CLS1: "A" }, columnMapping);
    expect(values).toEqual([{ index: 1, name: "A" }]);
  });
});
