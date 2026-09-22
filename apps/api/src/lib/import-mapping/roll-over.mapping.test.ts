import { describe, test, expect } from "bun:test";
import {
  buildDetailExpenseFromRow,
  buildDetailItemFromRow,
  buildRollOverPayload,
  extractDataClassificationValues,
  groupRollOverRows,
  resolveRollOverType,
  rollOverMapping,
  rollOverRowError,
  validateGroupConsistency,
} from "./roll-over.mapping";

// § Fase 146, architecture-roll-over.md — Roll Over: rollOverType per dokumen menentukan detailItem[] (Barang) vs detailExpense[] (Akun).
const map = rollOverMapping.defaultColumnMap;
const row = (id: string, data: Record<string, unknown>) => ({ id, rawData: data });

const itemRow = (over: Record<string, unknown> = {}) => ({
  Tanggal: "17/09/2026",
  "No Trans": "RO-1",
  "Job Order No": "JO-1",
  "Tipe Penyesuaian": "Barang",
  "Nama Cabang": "Pusat",
  "FG_Item No": "FG-1",
  FG_Qty: 10,
  ...over,
});
const accountRow = (over: Record<string, unknown> = {}) => ({
  Tanggal: "17/09/2026",
  "Job Order No": "JO-1",
  "Tipe Penyesuaian": "Akun",
  "Nama Cabang": "Pusat",
  "Expense Acc No": "5-1001",
  "Expense Amount": 250000,
  ...over,
});

describe("resolveRollOverType", () => {
  test("enum literal & dictionary (Akun/Barang), tidak peka huruf besar/kecil", () => {
    expect(resolveRollOverType("ITEM")).toBe("ITEM");
    expect(resolveRollOverType("account")).toBe("ACCOUNT");
    expect(resolveRollOverType("Barang")).toBe("ITEM");
    expect(resolveRollOverType(" AKUN ")).toBe("ACCOUNT");
    expect(resolveRollOverType("Finished Good")).toBe("ITEM");
  });
  test("tidak dikenali / kosong → null (BUKAN default diam-diam)", () => {
    expect(resolveRollOverType("lain-lain")).toBeNull();
    expect(resolveRollOverType("")).toBeNull();
    expect(resolveRollOverType(undefined)).toBeNull();
    expect(resolveRollOverType(null)).toBeNull();
  });
});

describe("rollOverRowError", () => {
  test("Barang: butuh itemNo & quantity; Akun: butuh accountNo & expenseAmount", () => {
    expect(rollOverRowError(itemRow(), map)).toEqual([]);
    expect(rollOverRowError(itemRow({ "FG_Item No": "", FG_Qty: "" }), map).sort()).toEqual(["itemNo", "quantity"]);
    expect(rollOverRowError(accountRow(), map)).toEqual([]);
    expect(rollOverRowError(accountRow({ "Expense Acc No": "" }), map)).toEqual(["accountNo"]);
  });
  test("tipe tidak dikenali → rollOverType (field lain tidak dilaporkan)", () => {
    expect(rollOverRowError(itemRow({ "Tipe Penyesuaian": "zzz" }), map)).toEqual(["rollOverType"]);
  });
  test("kolom Tipe tidak dipetakan → rollOverType", () => {
    expect(rollOverRowError(itemRow(), { Tanggal: "transDate" })).toEqual(["rollOverType"]);
  });
});

describe("groupRollOverRows", () => {
  test("digabung by No Trans (case-insensitive); kosong = 1 baris 1 dokumen", () => {
    const groups = groupRollOverRows([row("1", itemRow({ "No Trans": "RO-1" })), row("2", itemRow({ "No Trans": "ro-1" })), row("3", itemRow({ "No Trans": "" }))], map);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(groups[1]!.groupKey).toBeNull();
  });
  test("kolom No Trans tidak dipetakan → tiap baris dokumen sendiri", () => {
    expect(groupRollOverRows([row("1", itemRow()), row("2", itemRow())], { Tanggal: "transDate" })).toHaveLength(2);
  });
});

describe("validateGroupConsistency", () => {
  test("null bila semua baris bertipe & Job Order sama", () => {
    expect(validateGroupConsistency({ groupKey: "RO-1", groupColumn: "No Trans", rows: [row("1", itemRow()), row("2", itemRow({ "Job Order No": "jo-1" }))] }, map)).toBeNull();
  });
  test("tipe berbeda dalam 1 grup → galat menyebut baris", () => {
    const msg = validateGroupConsistency({ groupKey: "RO-1", groupColumn: "No Trans", rows: [row("1", itemRow()), row("2", itemRow({ "Tipe Penyesuaian": "Akun" }))] }, map);
    expect(msg).toContain("Tipe Penyesuaian tidak konsisten");
    expect(msg).toContain("baris 2");
  });
  test("Job Order berbeda dalam 1 grup → galat", () => {
    const msg = validateGroupConsistency({ groupKey: "RO-1", groupColumn: "No Trans", rows: [row("1", itemRow()), row("2", itemRow({ "Job Order No": "JO-2" }))] }, map);
    expect(msg).toContain("Job Order No tidak konsisten");
  });
});

describe("buildRollOverPayload", () => {
  test("ITEM: header + detailItem[] terisi, detailExpense = [] (kedua array SELALU ada)", () => {
    const payload = buildRollOverPayload([itemRow({ Keterangan: "Selesai", FG_Unit: "PCS", Warehouse: "GD-1", Portion: 100 }), itemRow({ "FG_Item No": "FG-2", FG_Qty: 5 })], map);
    expect(payload).toMatchObject({ transDate: "17/09/2026", jobOrderNumber: "JO-1", rollOverType: "ITEM", number: "RO-1", description: "Selesai", branchName: "Pusat" });
    expect(payload.detailExpense).toEqual([]);
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ itemNo: "FG-1", quantity: 10, itemUnitName: "PCS", warehouseName: "GD-1", portion: 100 });
    expect(items[1]).toMatchObject({ itemNo: "FG-2", quantity: 5 });
  });

  test("ACCOUNT: baris masuk detailExpense[], detailItem = []", () => {
    const payload = buildRollOverPayload([accountRow({ "Expense Name": "Biaya", Portion: 50 })], map);
    expect(payload.rollOverType).toBe("ACCOUNT");
    expect(payload.detailItem).toEqual([]);
    expect(payload.detailExpense).toEqual([{ accountNo: "5-1001", expenseAmount: 250000, expenseName: "Biaya", portion: 50 }]);
  });

  test("tanggal serial Excel & format ISO dinormalkan ke dd/mm/yyyy; header dari BARIS PERTAMA", () => {
    const payload = buildRollOverPayload([itemRow({ Tanggal: 46282 }), itemRow({ Tanggal: "2030-01-01" })], map);
    expect(payload.transDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(buildRollOverPayload([itemRow({ Tanggal: "2026-09-17" })], map).transDate).toBe("17/09/2026");
  });

  test("tipe tidak dikenali → rollOverType kosong (route/worker sudah menolaknya lebih dulu)", () => {
    expect(buildRollOverPayload([itemRow({ "Tipe Penyesuaian": "zzz" })], map).rollOverType).toBe("");
  });
});

describe("buildDetailItemFromRow", () => {
  test("serial bersarang, Atribut Tambahan (char/numeric/date), Kategori Keuangan", () => {
    const d = buildDetailItemFromRow(
      itemRow({ "Serial No": "SN-1", "SN - Qty": 3, "SN - Exp Date": "2027-05-01", "Atribut Tambahan 1": "A", "Atribut Number 2": "7", "Atribut Date 1": "2026-01-02", "Financial Category 3": "Divisi X", "Project No": "P1", "Dept Name": "Produksi" }),
      map,
    );
    expect(d.detailSerialNumber).toEqual([{ serialNumberNo: "SN-1", quantity: 3, expiredDate: "01/05/2027" }]);
    expect(d).toMatchObject({ charField1: "A", numericField2: 7, dateField1: "02/01/2026", dataClassification3Name: "Divisi X", projectNo: "P1", departmentName: "Produksi" });
  });
  test("tanpa kolom serial → tidak ada detailSerialNumber", () => {
    expect(buildDetailItemFromRow(itemRow(), map)).not.toHaveProperty("detailSerialNumber");
  });
});

describe("buildDetailExpenseFromRow", () => {
  test("Kategori Keuangan & departemen ikut ke detailExpense; Project No TIDAK (spec expense tidak punya projectNo)", () => {
    const d = buildDetailExpenseFromRow(accountRow({ "Dept Name": "Produksi", "Financial Category 1": "Divisi Y", "Project No": "P1" }), map);
    expect(d).toMatchObject({ departmentName: "Produksi", dataClassification1Name: "Divisi Y" });
    expect(d).not.toHaveProperty("projectNo");
  });
});

describe("extractDataClassificationValues", () => {
  test("hanya slot terisi (10 slot), nama di-trim", () => {
    expect(extractDataClassificationValues(itemRow({ "Financial Category 2": " A ", "Financial Category 10": "B", "Financial Category 4": "" }), map)).toEqual([
      { index: 2, name: "A" },
      { index: 10, name: "B" },
    ]);
  });
});

describe("rollOverMapping", () => {
  test("required: tanggal, cabang, job order, tipe", () => {
    expect([...rollOverMapping.requiredFields]).toEqual(["transDate", "branchName", "jobOrderNumber", "rollOverType"]);
  });
  test("semua field di defaultColumnMap valid di fieldToAccuratePath", () => {
    for (const field of Object.values(map)) expect(rollOverMapping.fieldToAccuratePath).toHaveProperty(field);
  });
});
