import { describe, test, expect } from "bun:test";
import {
  buildItemTransferPayload,
  buildDetailItemFromRow,
  numberColumnOf,
  groupItemTransferRows,
  itemTransferTypeRowError,
  extractDataClassificationValues,
  type ImportRowRecord,
} from "./item-transfer.mapping";

// § Fase 134 — mirror `receive-item.mapping.test.ts`/`purchase-order.mapping.test.ts`,
// disesuaikan dengan Item Transfer: grouping DEFAULT ADR-0011 by "No.
// Item Transfer" (field `number`), validasi enum `itemTransferType`,
// merge "Item Requisition No"/"Note Penting" ke `description`, dan
// `detailSerialNumber[]` BERSARANG di dalam detailItem.
describe("buildItemTransferPayload", () => {
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
      "No. Item Transfer": "IT-001",
      "Tipe Transfer": "transfer_out",
      "Item No": "BRG-001",
      Qty: 10,
      Unit: "PCS",
    };
    const payload = buildItemTransferPayload([rawRow], baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.number).toBe("IT-001");
    expect(payload.itemTransferType).toBe("TRANSFER_OUT"); // § dinormalisasi uppercase
    expect(payload.detailItem).toEqual([{ itemNo: "BRG-001", quantity: 10, itemUnitName: "PCS" }]);
  });

  test("multi-baris -> semua masuk detailItem[], header dari baris PERTAMA saja", () => {
    const rows = [
      { Tanggal: "2026-09-17", "No. Item Transfer": "IT-002", "Tipe Transfer": "TRANSFER_IN", "Item No": "BRG-1", Qty: 5, Unit: "PCS" },
      { Tanggal: "2026-09-18", "No. Item Transfer": "IT-002", "Tipe Transfer": "TRANSFER_OUT", "Item No": "BRG-2", Qty: 3, Unit: "BOX" },
    ];
    const payload = buildItemTransferPayload(rows, baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026"); // baris pertama
    expect(payload.itemTransferType).toBe("TRANSFER_IN"); // baris pertama, baris ke-2 diabaikan
    expect(payload.detailItem).toHaveLength(2);
    expect((payload.detailItem as unknown[])[1]).toEqual({ itemNo: "BRG-2", quantity: 3, itemUnitName: "BOX" });
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildItemTransferPayload(
      [{ Tanggal: 46660, "No. Item Transfer": "IT-003", "Tipe Transfer": "TRANSFER_IN", "Item No": "X", Qty: 1, Unit: "PCS" }],
      baseColumnMapping,
    );
    expect(payload.transDate).toBe("30/09/2027");
  });

  test("kolom root opsional yang kosong TIDAK ikut masuk payload", () => {
    const payload = buildItemTransferPayload(
      [{ Tanggal: "2026-09-17", "No. Item Transfer": "IT-004", "Tipe Transfer": "TRANSFER_IN", "Item No": "X", Qty: 1, Unit: "PCS" }],
      baseColumnMapping,
    );
    expect(payload.branchName).toBeUndefined();
    expect(payload.warehouseName).toBeUndefined();
    expect(payload.description).toBeUndefined();
  });

  test("Gudang Asal/Gudang Tujuan -> warehouseName/referenceWarehouseName apa adanya", () => {
    const columnMapping = { ...baseColumnMapping, "Gudang Asal": "warehouseName", "Gudang Tujuan": "referenceWarehouseName" };
    const payload = buildItemTransferPayload(
      [
        {
          Tanggal: "2026-09-17",
          "No. Item Transfer": "IT-005",
          "Tipe Transfer": "TRANSFER_OUT",
          "Item No": "X",
          Qty: 1,
          Unit: "PCS",
          "Gudang Asal": "Gudang Pusat",
          "Gudang Tujuan": "Gudang Cabang",
        },
      ],
      columnMapping,
    );
    expect(payload.warehouseName).toBe("Gudang Pusat");
    expect(payload.referenceWarehouseName).toBe("Gudang Cabang");
  });

  describe("merge 'Item Requisition No' + 'Note Penting' ke description", () => {
    const columnMapping = {
      ...baseColumnMapping,
      Keterangan: "description",
      "Item Requisition No": "requisitionNo",
      "Note Penting": "notePenting",
    };

    test("ketiganya terisi -> digabung dengan separator ' | '", () => {
      const payload = buildItemTransferPayload(
        [
          {
            Tanggal: "2026-09-17",
            "No. Item Transfer": "IT-006",
            "Tipe Transfer": "TRANSFER_IN",
            "Item No": "X",
            Qty: 1,
            Unit: "PCS",
            Keterangan: "Pindah stok akhir bulan",
            "Item Requisition No": "REQ-001",
            "Note Penting": "Hati-hati barang pecah belah",
          },
        ],
        columnMapping,
      );
      expect(payload.description).toBe("Pindah stok akhir bulan | No. Permintaan: REQ-001 | Catatan: Hati-hati barang pecah belah");
    });

    test("cuma requisitionNo terisi -> description cuma bagian itu, tanpa separator nyasar", () => {
      const payload = buildItemTransferPayload(
        [{ Tanggal: "2026-09-17", "No. Item Transfer": "IT-007", "Tipe Transfer": "TRANSFER_IN", "Item No": "X", Qty: 1, Unit: "PCS", "Item Requisition No": "REQ-002" }],
        columnMapping,
      );
      expect(payload.description).toBe("No. Permintaan: REQ-002");
    });

    test("semua kosong -> description tidak ikut masuk payload sama sekali", () => {
      const payload = buildItemTransferPayload(
        [{ Tanggal: "2026-09-17", "No. Item Transfer": "IT-008", "Tipe Transfer": "TRANSFER_IN", "Item No": "X", Qty: 1, Unit: "PCS" }],
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

  test("cuma Serial No terisi -> tetap 1 elemen, field lain tidak muncul", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, Unit: "PCS", "Serial No": "SN-002" }, columnMapping);
    expect(detail.detailSerialNumber).toEqual([{ serialNumberNo: "SN-002" }]);
  });
});

describe("numberColumnOf / groupItemTransferRows", () => {
  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan 'No. Item Transfer' sama digabung 1 grup", () => {
    const columnMapping = { "No. Item Transfer": "number" };
    const rows = [row("1", { "No. Item Transfer": "IT-1" }), row("2", { "No. Item Transfer": "IT-1" }), row("3", { "No. Item Transfer": "IT-2" })];
    const groups = groupItemTransferRows(rows, columnMapping);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toHaveLength(2);
    expect(groups[1]!.rows).toHaveLength(1);
  });

  test("kolom 'number' tidak dimapping -> tiap baris jadi grup sendiri", () => {
    const rows = [row("1", { X: "a" }), row("2", { X: "b" })];
    expect(groupItemTransferRows(rows, {})).toHaveLength(2);
  });

  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ Tanggal: "transDate" })).toBeNull();
  });
});

describe("itemTransferTypeRowError", () => {
  const columnMapping = { "Tipe Transfer": "itemTransferType" };

  test("TRANSFER_IN/TRANSFER_OUT (case-insensitive) -> valid, tidak ada error", () => {
    expect(itemTransferTypeRowError({ "Tipe Transfer": "transfer_in" }, columnMapping)).toEqual([]);
    expect(itemTransferTypeRowError({ "Tipe Transfer": "TRANSFER_OUT" }, columnMapping)).toEqual([]);
  });

  test("nilai selain enum -> return ['itemTransferType']", () => {
    expect(itemTransferTypeRowError({ "Tipe Transfer": "PINDAH" }, columnMapping)).toEqual(["itemTransferType"]);
  });

  test("kolom kosong/tidak dimapping -> dianggap invalid", () => {
    expect(itemTransferTypeRowError({}, columnMapping)).toEqual(["itemTransferType"]);
    expect(itemTransferTypeRowError({ "Tipe Transfer": "TRANSFER_IN" }, {})).toEqual(["itemTransferType"]);
  });
});

describe("extractDataClassificationValues", () => {
  test("cuma 3 slot (Item Cls1-3), beda dari modul lain yang 10 slot", () => {
    const columnMapping = { "Item Cls1": "attribut1", "Item Cls2": "attribut2", "Item Cls3": "attribut3" };
    const result = extractDataClassificationValues({ "Item Cls1": "Divisi A", "Item Cls3": "Proyek X" }, columnMapping);
    expect(result).toEqual([
      { index: 1, name: "Divisi A" },
      { index: 3, name: "Proyek X" },
    ]);
  });
});
