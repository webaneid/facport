import { describe, test, expect } from "bun:test";
import {
  buildReceiveItemPayload,
  buildDetailItemFromRow,
  receiveNumberColumnOf,
  extractDataClassificationValues,
  receiveItemMapping,
  groupReceiveItemRows,
  validateGroupVendorConsistency,
  type ImportRowRecord,
} from "./receive-item.mapping";

// § Fase 121 — mirror `purchase-order.mapping.test.ts`, disesuaikan
// dengan perbedaan Receive Item: grouping by "Receive Number" (BUKAN
// "Trans No"), Atribut Tambahan level HEADER *dan* ITEM (Purchase Order
// cuma level ITEM), dan TIDAK ADA detailExpense sama sekali (jadi tidak
// ada test untuk itu).
describe("buildReceiveItemPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Vendor No": "V.00001",
      Date: "2026-08-19",
      "Item No": "9900012",
      "Item Price": 10000,
      Quantity: 5,
    };
    const columnMapping = {
      "Vendor No": "vendorNo",
      Date: "transDate",
      "Item No": "itemNo",
      "Item Price": "unitPrice",
      Quantity: "quantity",
    };

    const payload = buildReceiveItemPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Vendor No": "V.00001", Description: "" };
    const columnMapping = { "Vendor No": "vendorNo", Description: "description" };

    const payload = buildReceiveItemPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildReceiveItemPayload(
      [{ "Vendor No": "V.001", Date: "2026-08-19" }],
      { "Vendor No": "vendorNo", Date: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    // 46253 = 19 Agustus 2026 (basis epoch Excel 30 Des 1899)
    const payload = buildReceiveItemPayload(
      [{ "Vendor No": "V.001", Date: 46253 }],
      { "Vendor No": "vendorNo", Date: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Vendor No": "V.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Vendor No": "vendorNo" };

    const payload = buildReceiveItemPayload([rawRow], columnMapping);

    expect(Object.keys(payload)).toEqual(["vendorNo", "detailItem"]);
  });

  const groupColumnMapping = {
    Date: "transDate",
    "Receive Number": "receiveNumber",
    "Vendor No": "vendorNo",
    "Item No": "itemNo",
    "Item Price": "unitPrice",
    Quantity: "quantity",
  };

  test("2 baris jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { Date: "19/08/2026", "Receive Number": "SJ-001", "Vendor No": "V1", "Item No": "BRG-1", "Item Price": 1000, Quantity: 2 },
      { Date: "20/08/2026", "Receive Number": "SJ-001", "Vendor No": "V1-BEDA", "Item No": "BRG-2", "Item Price": 2000, Quantity: 3 },
    ];
    const payload = buildReceiveItemPayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026"); // dari baris pertama, baris kedua diabaikan
    expect(payload.vendorNo).toBe("V1"); // dari baris pertama
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

// § grouping MURNI by "Receive Number" — BEDA dari semua modul lain
// (Purchase Order dst) yang grouping by "Trans No"/"number".
describe("groupReceiveItemRows", () => {
  const columnMapping = { "Receive Number": "receiveNumber", "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Receive Number sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { "Receive Number": "SJ-001", "Vendor No": "V1" }),
      row("2", { "Receive Number": "SJ-001", "Vendor No": "V1" }),
      row("3", { "Receive Number": "SJ-002", "Vendor No": "V1" }),
    ];
    const groups = groupReceiveItemRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[1]!.rows.length).toBe(1);
    expect(groups[0]!.groupColumn).toBe("Receive Number");
  });

  test("Receive Number kosong tetap jadi grup sendiri per baris", () => {
    const rows = [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })];
    const groups = groupReceiveItemRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom Receive Number tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "Receive Number": "SJ-001" }), row("2", { "Receive Number": "SJ-001" })];
    const mappingTanpaReceiveNumber = { "Vendor No": "vendorNo" };
    const groups = groupReceiveItemRows(rows, mappingTanpaReceiveNumber);
    expect(groups.length).toBe(2);
  });

  test("Receive Number sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "Receive Number": " sj-001 " }), row("2", { "Receive Number": "SJ-001" })];
    const groups = groupReceiveItemRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("receiveNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke receiveNumber", () => {
    expect(receiveNumberColumnOf({ "Receive Number": "receiveNumber", "Vendor No": "vendorNo" })).toBe("Receive Number");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke receiveNumber", () => {
    expect(receiveNumberColumnOf({ "Vendor No": "vendorNo" })).toBeNull();
  });
});

describe("validateGroupVendorConsistency", () => {
  const columnMapping = { "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("vendorNo beda dalam 1 grup -> return pesan error", () => {
    const group = {
      groupKey: "SJ-001",
      groupColumn: "Receive Number",
      rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V2" })],
    };
    const result = validateGroupVendorConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("SJ-001");
  });

  test("vendorNo sama dalam 1 grup -> return null", () => {
    const group = {
      groupKey: "SJ-001",
      groupColumn: "Receive Number",
      rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })],
    };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Vendor No": "V1" })] };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildReceiveItemPayload (regresi)", () => {
    const rawRow = {
      "Vendor No": "V.00001",
      Date: "2026-08-19",
      "Item No": "9900012",
      "Item Price": 10000,
      Quantity: 5,
    };
    const columnMapping = {
      "Vendor No": "vendorNo",
      Date: "transDate",
      "Item No": "itemNo",
      "Item Price": "unitPrice",
      Quantity: "quantity",
    };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Vendor No": "V.00001", "Item No": "BRG-1" };
    const columnMapping = { "Vendor No": "vendorNo", "Item No": "itemNo" };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });

  test("'ITEM: Description' masuk ke detailNotes, BUKAN detailName (§ keputusan Fase 121)", () => {
    const rawRow = { "Item No": "BRG-1", "Item Name": "Meja Kantor", "ITEM: Description": "Kondisi baik" };
    const columnMapping = { "Item No": "itemNo", "Item Name": "itemName", "ITEM: Description": "itemNotes" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.detailName).toBe("Meja Kantor");
    expect(detail.detailNotes).toBe("Kondisi baik");
  });

  test("'ITEM: Purchase Order No' masuk ke detailItem.purchaseOrderNumber (kolom tambahan Fase 121)", () => {
    const rawRow = { "Item No": "BRG-1", "ITEM: Purchase Order No": "PO-001" };
    const columnMapping = { "Item No": "itemNo", "ITEM: Purchase Order No": "purchaseOrderNumber" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.purchaseOrderNumber).toBe("PO-001");
  });
});

describe("Atribut Tambahan level HEADER (beda dari Purchase Order yang cuma level ITEM)", () => {
  test("Custom Character/Number/Date level HEADER masuk ke ROOT payload, BUKAN detailItem", () => {
    const rawRows = [
      {
        "Vendor No": "V-1",
        "Item No": "BRG-1",
        "Custom Character 1": "Proyek A",
        "Custom Number 1": "100",
        "Custom Date 1": "20/08/2026",
      },
    ];
    const columnMapping = {
      "Vendor No": "vendorNo",
      "Item No": "itemNo",
      "Custom Character 1": "attributHeaderKarakter1",
      "Custom Number 1": "attributHeaderAngka1",
      "Custom Date 1": "attributHeaderTanggal1",
    };
    const payload = buildReceiveItemPayload(rawRows, columnMapping);
    expect(payload.charField1).toBe("Proyek A");
    expect(payload.numericField1).toBe("100");
    expect(payload.dateField1).toBe("20/08/2026");
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBeUndefined();
  });

  test("Atribut Tambahan level ITEM (15 slot char) masuk ke detailItem, BUKAN root", () => {
    const rawRow = {
      "Item No": "BRG-1",
      "ITEM: Custom Character 1": "Karakter Item 1",
      "ITEM: Custom Character 15": "Slot Terakhir",
      "ITEM: Custom Number 1": "500",
      "ITEM: Custom Date 1": "21/08/2026",
    };
    const columnMapping = {
      "Item No": "itemNo",
      "ITEM: Custom Character 1": "attributItemKarakter1",
      "ITEM: Custom Character 15": "attributItemKarakter15",
      "ITEM: Custom Number 1": "attributItemAngka1",
      "ITEM: Custom Date 1": "attributItemTanggal1",
    };
    const payload = buildReceiveItemPayload([rawRow], columnMapping);
    expect(payload.charField1).toBeUndefined();
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBe("Karakter Item 1");
    expect(detail.charField15).toBe("Slot Terakhir");
    expect(detail.numericField1).toBe("500");
    expect(detail.dateField1).toBe("21/08/2026");
  });

  test("Kategori Keuangan level ITEM (dataClassificationNName) masuk ke detailItem", () => {
    const rawRow = { "Item No": "BRG-1", "ITEM: Finance Category 1": "KATKEG 1" };
    const columnMapping = { "Item No": "itemNo", "ITEM: Finance Category 1": "attribut1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dataClassification1Name).toBe("KATKEG 1");
  });

  test("defaultColumnMap — kolom Atribut Tambahan level header & item lengkap", () => {
    for (let i = 1; i <= 10; i++) {
      expect(receiveItemMapping.defaultColumnMap[`Custom Character ${i}`]).toBe(`attributHeaderKarakter${i}`);
      expect(receiveItemMapping.defaultColumnMap[`ITEM: Custom Character ${i}`]).toBe(`attributItemKarakter${i}`);
      expect(receiveItemMapping.defaultColumnMap[`ITEM: Finance Category ${i}`]).toBe(`attribut${i}`);
    }
    expect(receiveItemMapping.defaultColumnMap["Custom Date 1"]).toBe("attributHeaderTanggal1");
    expect(receiveItemMapping.defaultColumnMap["ITEM: Custom Date 1"]).toBe("attributItemTanggal1");
    expect(receiveItemMapping.defaultColumnMap["ITEM: Purchase Order No"]).toBe("purchaseOrderNumber");
    expect(receiveItemMapping.defaultColumnMap["ITEM: Description"]).toBe("itemNotes");
  });
});

describe("extractDataClassificationValues", () => {
  test("ambil index+name dari kolom attribut1-10 yang terisi, skip yang kosong", () => {
    const rawRow = { "KK 1": "KATKEG 1", "KK 2": "" };
    const columnMapping = { "KK 1": "attribut1", "KK 2": "attribut2" };
    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG 1" }]);
  });
});

describe("requiredFields — branchName WAJIB sejak awal (pelajaran Fase 120)", () => {
  test("requiredFields memuat semua field bisnis wajib termasuk branchName", () => {
    expect(receiveItemMapping.requiredFields).toContain("branchName");
    expect(receiveItemMapping.requiredFields).toContain("receiveNumber");
    expect(receiveItemMapping.requiredFields).toContain("vendorNo");
  });
});
