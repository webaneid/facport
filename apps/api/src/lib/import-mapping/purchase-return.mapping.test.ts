import { describe, test, expect } from "bun:test";
import {
  buildPurchaseReturnPayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  numberColumnOf,
  returnTypeRowError,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  purchaseReturnMapping,
  groupPurchaseReturnRows,
  validateGroupVendorConsistency,
  type ImportRowRecord,
} from "./purchase-return.mapping";

// § Fase 122 — mirror `purchase-order.mapping.test.ts`, disesuaikan
// dengan perbedaan Purchase Return: grouping DEFAULT ADR-0011 (opsional
// by "TransNo", BUKAN wajib), TIDAK ada `warehouseName`/`projectNo` di
// detailExpense (dikonfirmasi tidak ada di API), dan validasi
// `returnType` (§ `returnTypeRowError`, fokus test terpisah di bawah).
describe("buildPurchaseReturnPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Vendor No": "V.00001",
      Date: "2026-08-19",
      "Return Type": "NO_INVOICE",
      "Tax Date": "19/08/2026",
      "Tax Num": "TX-001",
      "Item No": "9900012",
      "Item Price": 10000,
      "Item Qty": 5,
    };
    const columnMapping = {
      "Vendor No": "vendorNo",
      Date: "transDate",
      "Return Type": "returnType",
      "Tax Date": "taxDate",
      "Tax Num": "taxNumber",
      "Item No": "itemNo",
      "Item Price": "unitPrice",
      "Item Qty": "quantity",
    };

    const payload = buildPurchaseReturnPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.returnType).toBe("NO_INVOICE");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("returnType dinormalisasi ke UPPERCASE", () => {
    const payload = buildPurchaseReturnPayload(
      [{ "Vendor No": "V.001", "Return Type": "no_invoice" }],
      { "Vendor No": "vendorNo", "Return Type": "returnType" },
    );
    expect(payload.returnType).toBe("NO_INVOICE");
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Vendor No": "V.00001", Notes: "" };
    const columnMapping = { "Vendor No": "vendorNo", Notes: "description" };

    const payload = buildPurchaseReturnPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildPurchaseReturnPayload(
      [{ "Vendor No": "V.001", Date: "2026-08-19" }],
      { "Vendor No": "vendorNo", Date: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Vendor No": "V.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Vendor No": "vendorNo" };

    const payload = buildPurchaseReturnPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.detailItem).toEqual([{}]);
    expect(payload.detailExpense).toEqual([]);
  });

  test("`detailExpense` SELALU disertakan (default array kosong kalau tidak ada baris Beban) — BEDA dari Purchase Order", () => {
    const payload = buildPurchaseReturnPayload([{ "Vendor No": "V-1", "Item No": "BRG-1" }], { "Vendor No": "vendorNo", "Item No": "itemNo" });
    expect(payload.detailExpense).toEqual([]);
  });

  const groupColumnMapping = {
    Date: "transDate",
    TransNo: "number",
    "Vendor No": "vendorNo",
    "Item No": "itemNo",
    "Item Price": "unitPrice",
    "Item Qty": "quantity",
  };

  test("2 baris dengan TransNo sama jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { Date: "19/08/2026", TransNo: "PR-001", "Vendor No": "V1", "Item No": "BRG-1", "Item Price": 1000, "Item Qty": 2 },
      { Date: "20/08/2026", TransNo: "PR-001", "Vendor No": "V1-BEDA", "Item No": "BRG-2", "Item Price": 2000, "Item Qty": 3 },
    ];
    const payload = buildPurchaseReturnPayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026"); // dari baris pertama
    expect(payload.vendorNo).toBe("V1"); // dari baris pertama
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

// § grouping DEFAULT ADR-0011 by "TransNo" (OPSIONAL) — BEDA dari
// Receive Item (wajib by receiveNumber) dan Purchase Order (wajib by
// number).
describe("groupPurchaseReturnRows", () => {
  const columnMapping = { TransNo: "number", "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan TransNo sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { TransNo: "PR-001", "Vendor No": "V1" }),
      row("2", { TransNo: "PR-001", "Vendor No": "V1" }),
      row("3", { TransNo: "PR-002", "Vendor No": "V1" }),
    ];
    const groups = groupPurchaseReturnRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[1]!.rows.length).toBe(1);
  });

  test("TransNo kosong -> tetap 1 baris = 1 retur sendiri (behavior default, non-breaking)", () => {
    const rows = [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })];
    const groups = groupPurchaseReturnRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom TransNo tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { TransNo: "PR-001" }), row("2", { TransNo: "PR-001" })];
    const mappingTanpaNumber = { "Vendor No": "vendorNo" };
    const groups = groupPurchaseReturnRows(rows, mappingTanpaNumber);
    expect(groups.length).toBe(2);
  });

  test("TransNo sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { TransNo: " pr-001 " }), row("2", { TransNo: "PR-001" })];
    const groups = groupPurchaseReturnRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("numberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke number", () => {
    expect(numberColumnOf({ TransNo: "number", "Vendor No": "vendorNo" })).toBe("TransNo");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Vendor No": "vendorNo" })).toBeNull();
  });
});

describe("validateGroupVendorConsistency", () => {
  const columnMapping = { "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("vendorNo beda dalam 1 grup -> return pesan error", () => {
    const group = { groupKey: "PR-001", groupColumn: "TransNo", rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V2" })] };
    const result = validateGroupVendorConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("PR-001");
  });

  test("vendorNo sama dalam 1 grup -> return null", () => {
    const group = { groupKey: "PR-001", groupColumn: "TransNo", rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })] };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Vendor No": "V1" })] };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });
});

// § Fase 122 — inti kompleksitas modul ini: `returnType` menentukan
// field companion mana yang wajib. SEMUA 4 nilai didukung (dikonfirmasi
// user, § architecture doc "Keputusan Scope" update 2026-09-15).
describe("returnTypeRowError", () => {
  const columnMapping = {
    "Return Type": "returnType",
    "Invoice No": "invoiceNumber",
    "Receive Item No": "receiveItemNumber",
  };

  test("returnType di luar 4 nilai valid -> error ['returnType']", () => {
    expect(returnTypeRowError({ "Return Type": "SOMETHING_ELSE" }, columnMapping)).toEqual(["returnType"]);
  });

  test("returnType kosong/tidak di-mapping -> error ['returnType']", () => {
    expect(returnTypeRowError({}, columnMapping)).toEqual(["returnType"]);
  });

  test("returnType=INVOICE tanpa Invoice No -> error ['invoiceNumber']", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE" }, columnMapping)).toEqual(["invoiceNumber"]);
  });

  test("returnType=INVOICE_DP tanpa Invoice No -> error ['invoiceNumber'] (SAMA seperti INVOICE)", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE_DP" }, columnMapping)).toEqual(["invoiceNumber"]);
  });

  test("returnType=INVOICE dengan Invoice No terisi -> valid ([])", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE", "Invoice No": "INV-001" }, columnMapping)).toEqual([]);
  });

  test("returnType=INVOICE_DP dengan Invoice No terisi -> valid ([]) — dikonfirmasi user, TIDAK ditolak", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE_DP", "Invoice No": "INV-DP-001" }, columnMapping)).toEqual([]);
  });

  test("returnType=RECEIVE tanpa Receive Item No -> error ['receiveItemNumber']", () => {
    expect(returnTypeRowError({ "Return Type": "RECEIVE" }, columnMapping)).toEqual(["receiveItemNumber"]);
  });

  test("returnType=RECEIVE dengan Receive Item No terisi -> valid ([])", () => {
    expect(returnTypeRowError({ "Return Type": "RECEIVE", "Receive Item No": "RI-001" }, columnMapping)).toEqual([]);
  });

  test("returnType=NO_INVOICE tanpa Invoice No maupun Receive Item No -> valid ([])", () => {
    expect(returnTypeRowError({ "Return Type": "NO_INVOICE" }, columnMapping)).toEqual([]);
  });

  test("returnType case-insensitive ('invoice' huruf kecil) tetap valid kalau Invoice No terisi", () => {
    expect(returnTypeRowError({ "Return Type": "invoice", "Invoice No": "INV-001" }, columnMapping)).toEqual([]);
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildPurchaseReturnPayload (regresi)", () => {
    const rawRow = { "Item No": "9900012", "Item Price": 10000, "Item Qty": 5 };
    const columnMapping = { "Item No": "itemNo", "Item Price": "unitPrice", "Item Qty": "quantity" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Vendor No": "V.00001", "Item No": "BRG-1" };
    const columnMapping = { "Vendor No": "vendorNo", "Item No": "itemNo" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });

  test("Item Name -> detailName, Item Notes -> detailNotes (keduanya ADA, beda dari Receive Item yang Item Name terpisah dari ITEM: Description)", () => {
    const rawRow = { "Item No": "BRG-1", "Item Name": "Meja Kantor", "Item Notes": "Rusak sebagian" };
    const columnMapping = { "Item No": "itemNo", "Item Name": "itemName", "Item Notes": "itemNotes" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.detailName).toBe("Meja Kantor");
    expect(detail.detailNotes).toBe("Rusak sebagian");
  });
});

describe("Atribut Tambahan & Kategori Keuangan level ITEM (Excel client cuma minta versi ITEM)", () => {
  test("Kategori Keuangan level ITEM (dataClassificationNName) masuk ke detailItem", () => {
    const rawRow = { "Item No": "BRG-1", "ITEM: Finance Category 1": "KATKEG 1" };
    const columnMapping = { "Item No": "itemNo", "ITEM: Finance Category 1": "attribut1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dataClassification1Name).toBe("KATKEG 1");
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
    const payload = buildPurchaseReturnPayload([rawRow], columnMapping);
    expect(payload.charField1).toBeUndefined();
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBe("Karakter Item 1");
    expect(detail.charField15).toBe("Slot Terakhir");
    expect(detail.numericField1).toBe("500");
    expect(detail.dateField1).toBe("21/08/2026");
  });

  test("defaultColumnMap — TIDAK punya entri untuk 'Item Warehouse'/'Expense Project' (tidak ada field API)", () => {
    expect(purchaseReturnMapping.defaultColumnMap["Item Warehouse"]).toBeUndefined();
    expect(purchaseReturnMapping.defaultColumnMap["Expense Project"]).toBeUndefined();
  });

  test("defaultColumnMap — kolom Atribut Tambahan/Kategori Keuangan lengkap", () => {
    for (let i = 1; i <= 10; i++) {
      expect(purchaseReturnMapping.defaultColumnMap[`ITEM: Finance Category ${i}`]).toBe(`attribut${i}`);
      expect(purchaseReturnMapping.defaultColumnMap[`ITEM: Custom Character ${i}`]).toBe(`attributItemKarakter${i}`);
    }
    expect(purchaseReturnMapping.defaultColumnMap["ITEM: Custom Date 1"]).toBe("attributItemTanggal1");
  });
});

describe("buildDetailExpenseFromRow — TIDAK ADA projectNo (dikonfirmasi tidak ada di API)", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk dengan field lain ikut", () => {
    const rawRow = {
      "Expense Acc No": "6-10100",
      "Expense Name": "Ongkos Kirim",
      "Expense Amount": 50000,
      "Expense Notes": "Retur sebagian",
      "Expense Department": "Logistik",
    };
    const columnMapping = {
      "Expense Acc No": "expenseAccountNo",
      "Expense Name": "expenseName",
      "Expense Amount": "expenseAmount",
      "Expense Notes": "expenseNotes",
      "Expense Department": "expenseDepartmentName",
    };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense).toEqual({
      accountNo: "6-10100",
      expenseName: "Ongkos Kirim",
      expenseAmount: 50000,
      expenseNotes: "Retur sebagian",
      departmentName: "Logistik",
    });
  });

  test("accountNo TANPA expenseAmount (atau sebaliknya) -> null", () => {
    expect(buildDetailExpenseFromRow({ "Expense Acc No": "6-10100" }, { "Expense Acc No": "expenseAccountNo" })).toBeNull();
    expect(buildDetailExpenseFromRow({ "Expense Amount": 50000 }, { "Expense Amount": "expenseAmount" })).toBeNull();
  });

  test("Kategori Keuangan Beban (dataClassificationNName) ikut masuk ke detailExpense", () => {
    const rawRow = { "Expense Acc No": "6-10100", "Expense Amount": 50000, "EXPENSE: Finance Category 1": "KATKEG BEBAN 1" };
    const columnMapping = { "Expense Acc No": "expenseAccountNo", "Expense Amount": "expenseAmount", "EXPENSE: Finance Category 1": "expenseKategoriKeuangan1" };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense?.dataClassification1Name).toBe("KATKEG BEBAN 1");
  });
});

describe("extractDataClassificationValues & extractExpenseDataClassificationValues", () => {
  test("ambil index+name dari kolom attribut1-10/expenseKategoriKeuanganN yang terisi, skip yang kosong", () => {
    const rawRow = { "KK 1": "KATKEG 1", "KK Beban 1": "KATKEG BEBAN 1" };
    const columnMapping = { "KK 1": "attribut1", "KK Beban 1": "expenseKategoriKeuangan1" };
    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG 1" }]);
    expect(extractExpenseDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG BEBAN 1" }]);
  });
});

describe("requiredFields — branchName WAJIB sejak awal (pelajaran Fase 120)", () => {
  test("requiredFields memuat semua field bisnis wajib termasuk branchName, TIDAK termasuk invoiceNumber/receiveItemNumber (kondisional)", () => {
    expect(purchaseReturnMapping.requiredFields).toContain("branchName");
    expect(purchaseReturnMapping.requiredFields).toContain("returnType");
    expect(purchaseReturnMapping.requiredFields).toContain("taxDate");
    expect(purchaseReturnMapping.requiredFields).toContain("taxNumber");
    expect(purchaseReturnMapping.requiredFields).not.toContain("invoiceNumber");
    expect(purchaseReturnMapping.requiredFields).not.toContain("receiveItemNumber");
  });
});
