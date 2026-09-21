import { describe, test, expect } from "bun:test";
import {
  buildInventoryAdjustmentPayload,
  buildDetailItemFromRow,
  numberColumnOf,
  groupInventoryAdjustmentRows,
  itemAdjustmentTypeRowError,
  resolveItemAdjustmentType,
  type ImportRowRecord,
} from "./inventory-adjustment.mapping";

// § Fase 138 — mirror `item-transfer.mapping.test.ts`, disesuaikan
// dengan Inventory Adjustment: grouping DEFAULT ADR-0011 by "No. Item
// Adjustment" (OPSIONAL, beda dari Item Transfer yang wajib), dictionary
// istilah Indonesia untuk `itemAdjustmentType` (BUKAN exact-match enum
// literal seperti `itemTransferType`), `unitCost` default 0, dan
// `detailSerialNumber[]` BERSARANG di dalam detailItem.
describe("resolveItemAdjustmentType", () => {
  test("istilah dictionary Indonesia -> enum resmi", () => {
    expect(resolveItemAdjustmentType("Tambah")).toBe("ADJUSTMENT_IN");
    expect(resolveItemAdjustmentType("masuk")).toBe("ADJUSTMENT_IN");
    expect(resolveItemAdjustmentType("Kurang")).toBe("ADJUSTMENT_OUT");
    expect(resolveItemAdjustmentType("KELUAR")).toBe("ADJUSTMENT_OUT");
    expect(resolveItemAdjustmentType("Stok Opname")).toBe("ADJUSTMENT_STOCK");
    expect(resolveItemAdjustmentType("penyesuaian stok")).toBe("ADJUSTMENT_STOCK");
  });

  test("enum literal langsung (case-insensitive) -> tetap diterima", () => {
    expect(resolveItemAdjustmentType("adjustment_in")).toBe("ADJUSTMENT_IN");
    expect(resolveItemAdjustmentType("ADJUSTMENT_STOCK")).toBe("ADJUSTMENT_STOCK");
  });

  test("nilai tidak dikenal -> null", () => {
    expect(resolveItemAdjustmentType("Pindah")).toBeNull();
    expect(resolveItemAdjustmentType(undefined)).toBeNull();
    expect(resolveItemAdjustmentType("")).toBeNull();
  });
});

describe("buildInventoryAdjustmentPayload", () => {
  const baseColumnMapping = {
    Tanggal: "transDate",
    "No. Item Adjustment": "number",
    "Item No": "itemNo",
    Qty: "quantity",
    "Tipe Adj": "itemAdjustmentType",
  };

  test("field root + detailItem[0] terisi benar dari 1 baris", () => {
    const rawRow = {
      Tanggal: "2026-09-17",
      "No. Item Adjustment": "IA-001",
      "Item No": "BRG-001",
      Qty: 10,
      "Tipe Adj": "Tambah",
    };
    const payload = buildInventoryAdjustmentPayload([rawRow], baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.number).toBe("IA-001");
    expect(payload.detailItem).toEqual([{ itemNo: "BRG-001", quantity: 10, itemAdjustmentType: "ADJUSTMENT_IN", unitCost: 0 }]);
  });

  test("unitCost kosong -> default 0, TIDAK PERNAH undefined", () => {
    const payload = buildInventoryAdjustmentPayload(
      [{ Tanggal: "2026-09-17", "Item No": "X", Qty: 1, "Tipe Adj": "Kurang" }],
      baseColumnMapping,
    );
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.unitCost).toBe(0);
  });

  test("unitCost terisi -> nilai apa adanya", () => {
    const columnMapping = { ...baseColumnMapping, "Unit Price": "unitCost" };
    const payload = buildInventoryAdjustmentPayload(
      [{ Tanggal: "2026-09-17", "Item No": "X", Qty: 1, "Tipe Adj": "Tambah", "Unit Price": 15000 }],
      columnMapping,
    );
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.unitCost).toBe(15000);
  });

  test("multi-baris -> semua masuk detailItem[], header dari baris PERTAMA saja", () => {
    const rows = [
      { Tanggal: "2026-09-17", "No. Item Adjustment": "IA-002", "Item No": "BRG-1", Qty: 5, "Tipe Adj": "Tambah" },
      { Tanggal: "2026-09-18", "No. Item Adjustment": "IA-002", "Item No": "BRG-2", Qty: 3, "Tipe Adj": "Kurang" },
    ];
    const payload = buildInventoryAdjustmentPayload(rows, baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026"); // baris pertama
    expect(payload.detailItem).toHaveLength(2);
    const second = (payload.detailItem as Record<string, unknown>[])[1]!;
    expect(second.itemNo).toBe("BRG-2");
    expect(second.itemAdjustmentType).toBe("ADJUSTMENT_OUT");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildInventoryAdjustmentPayload(
      [{ Tanggal: 46660, "Item No": "X", Qty: 1, "Tipe Adj": "Tambah" }],
      baseColumnMapping,
    );
    expect(payload.transDate).toBe("30/09/2027");
  });

  test("kolom root opsional yang kosong TIDAK ikut masuk payload", () => {
    const payload = buildInventoryAdjustmentPayload(
      [{ Tanggal: "2026-09-17", "Item No": "X", Qty: 1, "Tipe Adj": "Tambah" }],
      baseColumnMapping,
    );
    expect(payload.branchName).toBeUndefined();
    expect(payload.adjustmentAccountNo).toBeUndefined();
    expect(payload.description).toBeUndefined();
  });

  test("Cabang/Adj Account No/Keterangan -> field root apa adanya", () => {
    const columnMapping = { ...baseColumnMapping, Cabang: "branchName", "Adj Account No": "adjustmentAccountNo", Keterangan: "description" };
    const payload = buildInventoryAdjustmentPayload(
      [
        {
          Tanggal: "2026-09-17",
          "Item No": "X",
          Qty: 1,
          "Tipe Adj": "Tambah",
          Cabang: "Kantor Pusat",
          "Adj Account No": "1-2000",
          Keterangan: "Stok opname akhir bulan",
        },
      ],
      columnMapping,
    );
    expect(payload.branchName).toBe("Kantor Pusat");
    expect(payload.adjustmentAccountNo).toBe("1-2000");
    expect(payload.description).toBe("Stok opname akhir bulan");
  });
});

describe("buildDetailItemFromRow — detailSerialNumber[] & Atribut Tambahan", () => {
  const columnMapping = {
    "Item No": "itemNo",
    Qty: "quantity",
    "Tipe Adj": "itemAdjustmentType",
    "Serial No": "serialNo",
    "Serial Qty": "serialQty",
    "Serial ExpDate": "serialExpDate",
    "Atribut Tambahan 1": "attributTambahan1",
    "Atribut Number 1": "attributNumber1",
    "Atribut Date 1": "attributTanggal1",
  };

  test("ketiga kolom serial terisi -> 1 elemen detailSerialNumber", () => {
    const detail = buildDetailItemFromRow(
      { "Item No": "X", Qty: 1, "Tipe Adj": "Tambah", "Serial No": "SN-001", "Serial Qty": 1, "Serial ExpDate": "2027-01-01" },
      columnMapping,
    );
    expect(detail.detailSerialNumber).toEqual([{ serialNumberNo: "SN-001", quantity: 1, expiredDate: "01/01/2027" }]);
  });

  test("kolom serial semua kosong -> detailSerialNumber TIDAK ikut masuk", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, "Tipe Adj": "Tambah" }, columnMapping);
    expect(detail.detailSerialNumber).toBeUndefined();
  });

  test("Atribut Tambahan/Number/Date -> charField1/numericField1/dateField1", () => {
    const detail = buildDetailItemFromRow(
      { "Item No": "X", Qty: 1, "Tipe Adj": "Tambah", "Atribut Tambahan 1": "Batch-A", "Atribut Number 1": 5, "Atribut Date 1": "2027-03-01" },
      columnMapping,
    );
    expect(detail.charField1).toBe("Batch-A");
    expect(detail.numericField1).toBe(5);
    expect(detail.dateField1).toBe("01/03/2027");
  });

  test("itemAdjustmentType tidak dikenal -> kosong string (divalidasi terpisah via itemAdjustmentTypeRowError)", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, "Tipe Adj": "Pindah" }, columnMapping);
    expect(detail.itemAdjustmentType).toBe("");
  });
});

describe("numberColumnOf / groupInventoryAdjustmentRows", () => {
  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan 'No. Item Adjustment' sama digabung 1 grup", () => {
    const columnMapping = { "No. Item Adjustment": "number" };
    const rows = [row("1", { "No. Item Adjustment": "IA-1" }), row("2", { "No. Item Adjustment": "IA-1" }), row("3", { "No. Item Adjustment": "IA-2" })];
    const groups = groupInventoryAdjustmentRows(rows, columnMapping);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toHaveLength(2);
    expect(groups[1]!.rows).toHaveLength(1);
  });

  test("kolom 'number' tidak dimapping -> tiap baris jadi grup sendiri (opsional, konsisten Excel client)", () => {
    const rows = [row("1", { X: "a" }), row("2", { X: "b" })];
    expect(groupInventoryAdjustmentRows(rows, {})).toHaveLength(2);
  });

  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ Tanggal: "transDate" })).toBeNull();
  });
});

describe("itemAdjustmentTypeRowError", () => {
  const columnMapping = { "Tipe Adj": "itemAdjustmentType" };

  test("istilah dictionary ATAU enum literal (case-insensitive) -> valid, tidak ada error", () => {
    expect(itemAdjustmentTypeRowError({ "Tipe Adj": "tambah" }, columnMapping)).toEqual([]);
    expect(itemAdjustmentTypeRowError({ "Tipe Adj": "STOK OPNAME" }, columnMapping)).toEqual([]);
    expect(itemAdjustmentTypeRowError({ "Tipe Adj": "ADJUSTMENT_OUT" }, columnMapping)).toEqual([]);
  });

  test("nilai selain dictionary/enum -> return ['itemAdjustmentType']", () => {
    expect(itemAdjustmentTypeRowError({ "Tipe Adj": "PINDAH" }, columnMapping)).toEqual(["itemAdjustmentType"]);
  });

  test("kolom kosong/tidak dimapping -> dianggap invalid", () => {
    expect(itemAdjustmentTypeRowError({}, columnMapping)).toEqual(["itemAdjustmentType"]);
    expect(itemAdjustmentTypeRowError({ "Tipe Adj": "Tambah" }, {})).toEqual(["itemAdjustmentType"]);
  });
});
