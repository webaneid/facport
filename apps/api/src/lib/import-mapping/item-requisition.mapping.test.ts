import { describe, test, expect } from "bun:test";
import {
  buildItemRequisitionPayload,
  buildDetailItemFromRow,
  numberColumnOf,
  groupItemRequisitionRows,
  requisitionTypeRowError,
  saveAsStatusTypeRowError,
  extractDataClassificationValues,
  type ImportRowRecord,
} from "./item-requisition.mapping";

// § Fase 164 — REBUILD TOTAL: modul ini SEKARANG panggil
// `/api/purchase-requisition/save.do` (draft client sebelumnya, yang
// dipakai untuk versi item-transfer-shaped lama, TERNYATA salah — lihat
// `docs/lessons-learned.md` & memory `project_item_requisition_vs_item_transfer`).
describe("buildItemRequisitionPayload", () => {
  const baseColumnMapping = {
    "Transaction Date": "transDate",
    "Transaction No": "number",
    "Requisition Type": "requisitionType",
    "Save as Status Type": "saveAsStatusType",
    "Item No": "itemNo",
    Qty: "quantity",
  };

  test("field root + detailItem[0] terisi benar dari 1 baris", () => {
    const rawRow = {
      "Transaction Date": "2026-09-17",
      "Transaction No": "PR-001",
      "Requisition Type": "purchase",
      "Save as Status Type": "approved",
      "Item No": "BRG-001",
      Qty: 10,
    };
    const payload = buildItemRequisitionPayload([rawRow], baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.number).toBe("PR-001");
    expect(payload.requisitionType).toBe("PURCHASE");
    expect(payload.saveAsStatusType).toBe("APPROVED");
    // § unitPrice/requiredDate WAJIB oleh spec Accurate meski kosong di Excel —
    // default 0 / fallback transDate, TIDAK PERNAH undefined (§ keputusan user).
    expect(payload.detailItem).toEqual([{ itemNo: "BRG-001", quantity: 10, unitPrice: 0, requiredDate: "17/09/2026" }]);
  });

  test("multi-baris -> semua masuk detailItem[], header dari baris PERTAMA saja", () => {
    const rows = [
      { "Transaction Date": "2026-09-17", "Transaction No": "PR-002", "Requisition Type": "TRANSFER", "Save as Status Type": "DRAFT", "Item No": "BRG-1", Qty: 5 },
      { "Transaction Date": "2026-09-18", "Transaction No": "PR-002", "Requisition Type": "PURCHASE", "Save as Status Type": "APPROVED", "Item No": "BRG-2", Qty: 3 },
    ];
    const payload = buildItemRequisitionPayload(rows, baseColumnMapping);

    expect(payload.transDate).toBe("17/09/2026");
    expect(payload.requisitionType).toBe("TRANSFER");
    expect(payload.saveAsStatusType).toBe("DRAFT");
    expect(payload.detailItem).toHaveLength(2);
  });

  test("Item Req Date kosong -> default ke Transaction Date (fallback), BUKAN kosong", () => {
    const payload = buildItemRequisitionPayload(
      [{ "Transaction Date": "2026-10-01", "Transaction No": "PR-005", "Requisition Type": "PURCHASE", "Save as Status Type": "APPROVED", "Item No": "X", Qty: 1 }],
      baseColumnMapping,
    );
    expect((payload.detailItem as Record<string, unknown>[])[0]!.requiredDate).toBe("01/10/2026");
  });

  test("Item Req Date terisi -> pakai nilainya sendiri, bukan fallback", () => {
    const columnMapping = { ...baseColumnMapping, "Item Req Date": "requiredDate" };
    const payload = buildItemRequisitionPayload(
      [{ "Transaction Date": "2026-10-01", "Transaction No": "PR-006", "Requisition Type": "PURCHASE", "Save as Status Type": "APPROVED", "Item No": "X", Qty: 1, "Item Req Date": "2026-12-25" }],
      columnMapping,
    );
    expect((payload.detailItem as Record<string, unknown>[])[0]!.requiredDate).toBe("25/12/2026");
  });

  describe("root optional: branchName/warehouseName/description", () => {
    const columnMapping = { ...baseColumnMapping, "Branch Name": "branchName", Warehouse: "warehouseName", Description: "description" };

    test("terisi -> masuk payload", () => {
      const payload = buildItemRequisitionPayload(
        [
          {
            "Transaction Date": "2026-09-17",
            "Transaction No": "PR-003",
            "Requisition Type": "PURCHASE",
            "Save as Status Type": "APPROVED",
            "Item No": "X",
            Qty: 1,
            "Branch Name": "JAKARTA",
            Warehouse: "Others",
            Description: "Permintaan rutin",
          },
        ],
        columnMapping,
      );
      expect(payload.branchName).toBe("JAKARTA");
      expect(payload.warehouseName).toBe("Others");
      expect(payload.description).toBe("Permintaan rutin");
    });

    test("kosong semua -> tidak ikut masuk payload", () => {
      const payload = buildItemRequisitionPayload(
        [{ "Transaction Date": "2026-09-17", "Transaction No": "PR-004", "Requisition Type": "PURCHASE", "Save as Status Type": "APPROVED", "Item No": "X", Qty: 1 }],
        columnMapping,
      );
      expect(payload.branchName).toBeUndefined();
      expect(payload.warehouseName).toBeUndefined();
      expect(payload.description).toBeUndefined();
    });
  });
});

describe("buildDetailItemFromRow", () => {
  const columnMapping = {
    "Item No": "itemNo",
    Qty: "quantity",
    "Item Price": "unitPrice",
    "Item Unit Name": "itemUnitName",
    PPN: "ppn",
    PPnBM: "ppnbm",
    PPH: "pph",
    "Item Cash Disc Percent": "itemCashDiscPercent",
    "Item CLS1": "attribut1",
    "Atribut Tambahan 1": "attributTambahan1",
    "Atribut Number 1": "attributNumber1",
    "Atribut Tanggal 1": "attributTanggal1",
  };

  test("Item Unit Name kosong (item non-fisik, mis. promo) -> TIDAK dikirim sebagai string kosong, key di-skip", () => {
    const detail = buildDetailItemFromRow({ "Item No": "14007", Qty: 2 }, columnMapping, "17/09/2026");
    expect(detail).not.toHaveProperty("itemUnitName");
  });

  test("Item Unit Name terisi -> dikirim apa adanya", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, "Item Unit Name": "KG" }, columnMapping, "17/09/2026");
    expect(detail.itemUnitName).toBe("KG");
  });

  test("Item Price kosong -> default 0 (bukan undefined)", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1 }, columnMapping, "17/09/2026");
    expect(detail.unitPrice).toBe(0);
  });

  test("PPN/PPnBM/PPH 'Y' -> useTax1/2/3 true, selain itu false", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, PPN: "Y", PPnBM: "y", PPH: "N" }, columnMapping, "17/09/2026");
    expect(detail.useTax1).toBe(true);
    expect(detail.useTax2).toBe(true);
    expect(detail.useTax3).toBe(false);
  });

  test("Item Cash Disc Percent dikirim sebagai STRING (support diskon bertingkat)", () => {
    const detail = buildDetailItemFromRow({ "Item No": "X", Qty: 1, "Item Cash Disc Percent": "5 + 2" }, columnMapping, "17/09/2026");
    expect(detail.itemDiscPercent).toBe("5 + 2");
    expect(typeof detail.itemDiscPercent).toBe("string");
  });

  test("Atribut Tambahan/Number/Tanggal -> charField1/numericField1/dateField1", () => {
    const detail = buildDetailItemFromRow(
      { "Item No": "X", Qty: 1, "Atribut Tambahan 1": "Merah", "Atribut Number 1": "5", "Atribut Tanggal 1": "2026-12-01" },
      columnMapping,
      "17/09/2026",
    );
    expect(detail.charField1).toBe("Merah");
    expect(detail.numericField1).toBe(5);
    expect(detail.dateField1).toBe("01/12/2026");
  });
});

describe("numberColumnOf / groupItemRequisitionRows", () => {
  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan 'Transaction No' sama digabung 1 grup", () => {
    const columnMapping = { "Transaction No": "number" };
    const rows = [row("1", { "Transaction No": "PR-1" }), row("2", { "Transaction No": "PR-1" }), row("3", { "Transaction No": "PR-2" })];
    const groups = groupItemRequisitionRows(rows, columnMapping);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows).toHaveLength(2);
  });

  test("kolom 'number' tidak dimapping -> tiap baris jadi grup sendiri", () => {
    const rows = [row("1", { X: "a" }), row("2", { X: "b" })];
    expect(groupItemRequisitionRows(rows, {})).toHaveLength(2);
  });
});

describe("requisitionTypeRowError", () => {
  const columnMapping = { "Requisition Type": "requisitionType" };

  test("PURCHASE/TRANSFER/ALL (case-insensitive) -> valid", () => {
    expect(requisitionTypeRowError({ "Requisition Type": "purchase" }, columnMapping)).toEqual([]);
    expect(requisitionTypeRowError({ "Requisition Type": "transfer" }, columnMapping)).toEqual([]);
    expect(requisitionTypeRowError({ "Requisition Type": "ALL" }, columnMapping)).toEqual([]);
  });

  test("nilai selain enum -> return ['requisitionType']", () => {
    expect(requisitionTypeRowError({ "Requisition Type": "BELI" }, columnMapping)).toEqual(["requisitionType"]);
  });
});

describe("saveAsStatusTypeRowError", () => {
  const columnMapping = { "Save as Status Type": "saveAsStatusType" };

  test("APPROVED/DRAFT (case-insensitive) -> valid", () => {
    expect(saveAsStatusTypeRowError({ "Save as Status Type": "approved" }, columnMapping)).toEqual([]);
    expect(saveAsStatusTypeRowError({ "Save as Status Type": "draft" }, columnMapping)).toEqual([]);
  });

  test("nilai selain enum -> return ['saveAsStatusType']", () => {
    expect(saveAsStatusTypeRowError({ "Save as Status Type": "DISETUJUI" }, columnMapping)).toEqual(["saveAsStatusType"]);
  });
});

describe("extractDataClassificationValues", () => {
  test("cuma 3 slot (Item CLS1-3)", () => {
    const columnMapping = { "Item CLS1": "attribut1", "Item CLS2": "attribut2", "Item CLS3": "attribut3" };
    const result = extractDataClassificationValues({ "Item CLS2": "Divisi B" }, columnMapping);
    expect(result).toEqual([{ index: 2, name: "Divisi B" }]);
  });
});
