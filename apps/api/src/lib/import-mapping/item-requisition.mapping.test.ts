import { describe, test, expect } from "bun:test";
import {
  buildItemRequisitionPayload,
  buildDetailItemFromRow,
  numberColumnOf,
  groupItemRequisitionRows,
  itemTransferTypeRowError,
  extractDataClassificationValues,
  type ImportRowRecord,
} from "./item-requisition.mapping";

// § Fase 135 — kembaran `item-transfer.mapping.test.ts` (§ architecture-item-requisition.md).
// SATU-SATUNYA beda perilaku: TIDAK ADA field `requisitionNo` (sheet ini
// tidak punya kolom "Item Requisition No") — `description` cuma digabung
// "Note Penting" saja.
describe("buildItemRequisitionPayload", () => {
  const baseColumnMapping = {
    Tanggal: "transDate",
    "No. Item Transfer": "number",
    "Tipe Transfer": "itemTransferType",
    "Item No": "itemNo",
    Qty: "quantity",
    Unit: "itemUnitName",
  };

  test("field root + detailItem[0] terisi benar dari 1 baris", () => {
    const rawRow = {
      Tanggal: "2026-09-17",
      "No. Item Transfer": "IR-001",
      "Tipe Transfer": "transfer_out",
      "Item No": "BRG-001",
      Qty: 10,
      Unit: "PCS",
    };
    const payload = buildItemRequisitionPayload([rawRow], baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.number).toBe("IR-001");
    expect(payload.itemTransferType).toBe("TRANSFER_OUT");
    expect(payload.detailItem).toEqual([{ itemNo: "BRG-001", quantity: 10, itemUnitName: "PCS" }]);
  });

  test("multi-baris -> semua masuk detailItem[], header dari baris PERTAMA saja", () => {
    const rows = [
      { Tanggal: "2026-09-17", "No. Item Transfer": "IR-002", "Tipe Transfer": "TRANSFER_IN", "Item No": "BRG-1", Qty: 5, Unit: "PCS" },
      { Tanggal: "2026-09-18", "No. Item Transfer": "IR-002", "Tipe Transfer": "TRANSFER_OUT", "Item No": "BRG-2", Qty: 3, Unit: "BOX" },
    ];
    const payload = buildItemRequisitionPayload(rows, baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.itemTransferType).toBe("TRANSFER_IN");
    expect(payload.detailItem).toHaveLength(2);
  });

  describe("merge 'Note Penting' saja ke description (TANPA Item Requisition No)", () => {
    const columnMapping = { ...baseColumnMapping, Keterangan: "description", "Note Penting": "notePenting" };

    test("description + notePenting terisi -> digabung", () => {
      const payload = buildItemRequisitionPayload(
        [
          {
            Tanggal: "2026-09-17",
            "No. Item Transfer": "IR-003",
            "Tipe Transfer": "TRANSFER_IN",
            "Item No": "X",
            Qty: 1,
            Unit: "PCS",
            Keterangan: "Permintaan gudang produksi",
            "Note Penting": "Segera, stok menipis",
          },
        ],
        columnMapping,
      );
      expect(payload.description).toBe("Permintaan gudang produksi | Catatan: Segera, stok menipis");
    });

    test("keduanya kosong -> description tidak ikut masuk payload", () => {
      const payload = buildItemRequisitionPayload(
        [{ Tanggal: "2026-09-17", "No. Item Transfer": "IR-004", "Tipe Transfer": "TRANSFER_IN", "Item No": "X", Qty: 1, Unit: "PCS" }],
        columnMapping,
      );
      expect(payload.description).toBeUndefined();
    });
  });
});

describe("buildDetailItemFromRow — detailSerialNumber[] bersarang", () => {
  const columnMapping = {
    "Item No": "itemNo",
    Qty: "quantity",
    Unit: "itemUnitName",
    "Serial No": "serialNo",
    "Serial Qty": "serialQty",
    "Serial ExpDate": "serialExpDate",
  };

  test("ketiga kolom serial terisi -> 1 elemen detailSerialNumber", () => {
    const detail = buildDetailItemFromRow(
      { "Item No": "X", Qty: 1, Unit: "PCS", "Serial No": "SN-001", "Serial Qty": 1, "Serial ExpDate": "2027-01-01" },
      columnMapping,
    );
    expect(detail.detailSerialNumber).toEqual([{ serialNumberNo: "SN-001", quantity: 1, expiredDate: "01/01/2027" }]);
  });

  test("kolom serial semua kosong -> detailSerialNumber TIDAK ikut masuk", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, Unit: "PCS" }, columnMapping);
    expect(detail.detailSerialNumber).toBeUndefined();
  });
});

describe("numberColumnOf / groupItemRequisitionRows", () => {
  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan 'No. Item Transfer' sama digabung 1 grup", () => {
    const columnMapping = { "No. Item Transfer": "number" };
    const rows = [row("1", { "No. Item Transfer": "IR-1" }), row("2", { "No. Item Transfer": "IR-1" }), row("3", { "No. Item Transfer": "IR-2" })];
    const groups = groupItemRequisitionRows(rows, columnMapping);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toHaveLength(2);
  });

  test("kolom 'number' tidak dimapping -> tiap baris jadi grup sendiri", () => {
    const rows = [row("1", { X: "a" }), row("2", { X: "b" })];
    expect(groupItemRequisitionRows(rows, {})).toHaveLength(2);
  });
});

describe("itemTransferTypeRowError", () => {
  const columnMapping = { "Tipe Transfer": "itemTransferType" };

  test("TRANSFER_IN/TRANSFER_OUT (case-insensitive) -> valid", () => {
    expect(itemTransferTypeRowError({ "Tipe Transfer": "transfer_in" }, columnMapping)).toEqual([]);
  });

  test("nilai selain enum -> return ['itemTransferType']", () => {
    expect(itemTransferTypeRowError({ "Tipe Transfer": "PINDAH" }, columnMapping)).toEqual(["itemTransferType"]);
  });
});

describe("extractDataClassificationValues", () => {
  test("cuma 3 slot (Item Cls1-3)", () => {
    const columnMapping = { "Item Cls1": "attribut1", "Item Cls2": "attribut2", "Item Cls3": "attribut3" };
    const result = extractDataClassificationValues({ "Item Cls2": "Divisi B" }, columnMapping);
    expect(result).toEqual([{ index: 2, name: "Divisi B" }]);
  });
});
