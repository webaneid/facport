import { describe, test, expect } from "bun:test";
import {
  buildSalesReturnPayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  buildDetailSerialNumberFromRow,
  numberColumnOf,
  returnTypeRowError,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  salesReturnMapping,
  groupSalesReturnRows,
  validateGroupCustomerConsistency,
  type ImportRowRecord,
} from "./sales-return.mapping";

// § Fase 124 — mirror `purchase-return.mapping.test.ts`, disesuaikan
// dengan perbedaan Sales Return: `returnType` 4 nilai BEDA susunan
// (DELIVERY bukan RECEIVE), `returnStatusType` (root) vs
// `itemReturnStatusType` (item) 2 field terpisah, dan `detailSerialNumber[]`
// nested 2 level (fokus test terpisah di bawah).
describe("buildSalesReturnPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Customer No": "C.00001",
      "Transaction Date": "2026-08-19",
      "Return Type": "NO_INVOICE",
      "Tax Date": "19/08/2026",
      "Tax Number": "TX-001",
      "Item No": "9900012",
      "Item Unit Price": 10000,
      "Item Qty": 5,
    };
    const columnMapping = {
      "Customer No": "customerNo",
      "Transaction Date": "transDate",
      "Return Type": "returnType",
      "Tax Date": "taxDate",
      "Tax Number": "taxNumber",
      "Item No": "itemNo",
      "Item Unit Price": "unitPrice",
      "Item Qty": "quantity",
    };

    const payload = buildSalesReturnPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.returnType).toBe("NO_INVOICE");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("returnType dinormalisasi ke UPPERCASE", () => {
    const payload = buildSalesReturnPayload(
      [{ "Customer No": "C.001", "Return Type": "no_invoice" }],
      { "Customer No": "customerNo", "Return Type": "returnType" },
    );
    expect(payload.returnType).toBe("NO_INVOICE");
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Customer No": "C.00001", "Transaction Description": "" };
    const columnMapping = { "Customer No": "customerNo", "Transaction Description": "description" };
    const payload = buildSalesReturnPayload([rawRow], columnMapping);
    expect(payload.customerNo).toBe("C.00001");
    expect(payload.description).toBeUndefined();
  });

  test("`detailExpense` SELALU disertakan (default array kosong kalau tidak ada baris Beban)", () => {
    const payload = buildSalesReturnPayload([{ "Customer No": "C-1", "Item No": "BRG-1" }], { "Customer No": "customerNo", "Item No": "itemNo" });
    expect(payload.detailExpense).toEqual([]);
  });

  test("returnStatusType (root) dan itemReturnStatusType (item) TIDAK saling ketuker", () => {
    const rawRow = { "Customer No": "C-1", "Item No": "BRG-1", "Return Status Type": "PARTIALLY_RETURNED", "Item Return Status Type": "RETURNED" };
    const columnMapping = { "Customer No": "customerNo", "Item No": "itemNo", "Return Status Type": "returnStatusType", "Item Return Status Type": "itemReturnStatusType" };
    const payload = buildSalesReturnPayload([rawRow], columnMapping);
    expect(payload.returnStatusType).toBe("PARTIALLY_RETURNED");
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.returnDetailStatusType).toBe("RETURNED");
    expect(payload.returnDetailStatusType).toBeUndefined();
    expect(detail.returnStatusType).toBeUndefined();
  });
});

describe("groupSalesReturnRows — grouping DEFAULT ADR-0011 (opsional by Retur No)", () => {
  const columnMapping = { "Retur No": "number", "Customer No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Retur No sama digabung jadi 1 grup", () => {
    const rows = [row("1", { "Retur No": "SR-001", "Customer No": "C1" }), row("2", { "Retur No": "SR-001", "Customer No": "C1" })];
    const groups = groupSalesReturnRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });

  test("Retur No kosong -> tetap 1 baris = 1 retur sendiri (default)", () => {
    const rows = [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C1" })];
    const groups = groupSalesReturnRows(rows, columnMapping);
    expect(groups.length).toBe(2);
  });
});

describe("numberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Retur No": "number", "Customer No": "customerNo" })).toBe("Retur No");
  });
  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Customer No": "customerNo" })).toBeNull();
  });
});

describe("validateGroupCustomerConsistency", () => {
  const columnMapping = { "Customer No": "customerNo" };
  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { groupKey: "SR-001", groupColumn: "Retur No", rows: [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C2" })] };
    const result = validateGroupCustomerConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("SR-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { groupKey: "SR-001", groupColumn: "Retur No", rows: [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });
});

// § Fase 124 — inti kompleksitas modul ini: `returnType` 4 nilai, SEMUA
// didukung (dikonfirmasi user, § architecture doc update 2026-09-15).
// SUSUNAN BEDA dari Purchase Return: DELIVERY (bukan RECEIVE) +
// deliveryOrderNumber (bukan receiveItemNumber).
describe("returnTypeRowError", () => {
  const columnMapping = {
    "Return Type": "returnType",
    "Invoice No": "invoiceNumber",
    "Delivery Order No": "deliveryOrderNumber",
  };

  test("returnType di luar 4 nilai valid -> error ['returnType']", () => {
    expect(returnTypeRowError({ "Return Type": "SOMETHING_ELSE" }, columnMapping)).toEqual(["returnType"]);
  });

  test("returnType kosong/tidak di-mapping -> error ['returnType']", () => {
    expect(returnTypeRowError({}, columnMapping)).toEqual(["returnType"]);
  });

  test("returnType=DELIVERY tanpa Delivery Order No -> error ['deliveryOrderNumber']", () => {
    expect(returnTypeRowError({ "Return Type": "DELIVERY" }, columnMapping)).toEqual(["deliveryOrderNumber"]);
  });

  test("returnType=DELIVERY dengan Delivery Order No terisi -> valid ([]) — dikonfirmasi user, TIDAK ditolak", () => {
    expect(returnTypeRowError({ "Return Type": "DELIVERY", "Delivery Order No": "DO-001" }, columnMapping)).toEqual([]);
  });

  test("returnType=INVOICE tanpa Invoice No -> error ['invoiceNumber']", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE" }, columnMapping)).toEqual(["invoiceNumber"]);
  });

  test("returnType=INVOICE_DP tanpa Invoice No -> error ['invoiceNumber'] (SAMA seperti INVOICE)", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE_DP" }, columnMapping)).toEqual(["invoiceNumber"]);
  });

  test("returnType=INVOICE_DP dengan Invoice No terisi -> valid ([]) — dikonfirmasi user, TIDAK ditolak", () => {
    expect(returnTypeRowError({ "Return Type": "INVOICE_DP", "Invoice No": "INV-DP-001" }, columnMapping)).toEqual([]);
  });

  test("returnType=NO_INVOICE tanpa field companion apa pun -> valid ([])", () => {
    expect(returnTypeRowError({ "Return Type": "NO_INVOICE" }, columnMapping)).toEqual([]);
  });

  test("returnType case-insensitive tetap valid kalau field companion terisi", () => {
    expect(returnTypeRowError({ "Return Type": "delivery", "Delivery Order No": "DO-001" }, columnMapping)).toEqual([]);
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildSalesReturnPayload (regresi)", () => {
    const rawRow = { "Item No": "9900012", "Item Unit Price": 10000, "Item Qty": 5 };
    const columnMapping = { "Item No": "itemNo", "Item Unit Price": "unitPrice", "Item Qty": "quantity" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("warehouseName DIDUKUNG di detailItem (beda dari Purchase Return yang tidak punya)", () => {
    const rawRow = { "Item No": "BRG-1", "Item Warehouse": "Gudang Utama" };
    const columnMapping = { "Item No": "itemNo", "Item Warehouse": "warehouseName" };
    expect(buildDetailItemFromRow(rawRow, columnMapping).warehouseName).toBe("Gudang Utama");
  });
});

// § Fase 124 — struktur BARU di project ini: nested 2 level.
describe("buildDetailSerialNumberFromRow & integrasi ke buildDetailItemFromRow", () => {
  test("serialNumberNo + quantity terisi -> detailSerialNumber terbentuk", () => {
    const rawRow = { "Item Serial No": "SN-001", "Item Serial Number Qty": 2, "Item Serial Number Exp Date": "31/03/2027" };
    const columnMapping = { "Item Serial No": "itemSerialNo", "Item Serial Number Qty": "itemSerialQty", "Item Serial Number Exp Date": "itemSerialExpDate" };
    const serial = buildDetailSerialNumberFromRow(rawRow, columnMapping);
    expect(serial).toEqual({ serialNumberNo: "SN-001", quantity: 2, expiredDate: "31/03/2027" });
  });

  test("serialNumberNo TANPA quantity (atau sebaliknya) -> null (tidak dikirim setengah-setengah)", () => {
    expect(buildDetailSerialNumberFromRow({ "Item Serial No": "SN-001" }, { "Item Serial No": "itemSerialNo" })).toBeNull();
    expect(buildDetailSerialNumberFromRow({ "Item Serial Number Qty": 2 }, { "Item Serial Number Qty": "itemSerialQty" })).toBeNull();
  });

  test("buildDetailItemFromRow — detailSerialNumber TERLAMPIR sebagai array 1-elemen kalau data lengkap", () => {
    const rawRow = { "Item No": "BRG-1", "Item Serial No": "SN-001", "Item Serial Number Qty": 2 };
    const columnMapping = { "Item No": "itemNo", "Item Serial No": "itemSerialNo", "Item Serial Number Qty": "itemSerialQty" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.detailSerialNumber).toEqual([{ serialNumberNo: "SN-001", quantity: 2 }]);
  });

  test("buildDetailItemFromRow — TIDAK ada detailSerialNumber kalau data serial kosong/tidak lengkap", () => {
    const rawRow = { "Item No": "BRG-1" };
    const columnMapping = { "Item No": "itemNo" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.detailSerialNumber).toBeUndefined();
  });

  test("tanggal expired dinormalisasi DD/MM/YYYY", () => {
    const rawRow = { "Item Serial No": "SN-001", "Item Serial Number Qty": 1, "Item Serial Number Exp Date": "2027-03-31" };
    const columnMapping = { "Item Serial No": "itemSerialNo", "Item Serial Number Qty": "itemSerialQty", "Item Serial Number Exp Date": "itemSerialExpDate" };
    const serial = buildDetailSerialNumberFromRow(rawRow, columnMapping);
    expect(serial?.expiredDate).toBe("31/03/2027");
  });
});

describe("Atribut Tambahan level HEADER — cuma 3 Karakter + 2 Tanggal, TIDAK ADA Angka", () => {
  test("Header CF1-3/DF1-2 masuk ke ROOT payload", () => {
    const rawRows = [{ "Customer No": "C-1", "Item No": "BRG-1", "Header - CF1": "Proyek A", "Header - DF1": "20/08/2026" }];
    const columnMapping = { "Customer No": "customerNo", "Item No": "itemNo", "Header - CF1": "attributHeaderKarakter1", "Header - DF1": "attributHeaderTanggal1" };
    const payload = buildSalesReturnPayload(rawRows, columnMapping);
    expect(payload.charField1).toBe("Proyek A");
    expect(payload.dateField1).toBe("20/08/2026");
  });

  test("defaultColumnMap — TIDAK punya field Angka (numericField) sama sekali", () => {
    expect(Object.values(salesReturnMapping.defaultColumnMap)).not.toContain("attributHeaderAngka1");
    expect(salesReturnMapping.defaultColumnMap["Header - CF1"]).toBe("attributHeaderKarakter1");
    expect(salesReturnMapping.defaultColumnMap["Header - CF3"]).toBe("attributHeaderKarakter3");
    expect(salesReturnMapping.defaultColumnMap["Header - DF2"]).toBe("attributHeaderTanggal2");
  });

  test("Kategori Keuangan level ITEM — cuma 3 slot (CLS1-3)", () => {
    const rawRow = { "Item No": "BRG-1", "Item CLS1": "KATKEG 1" };
    const columnMapping = { "Item No": "itemNo", "Item CLS1": "attribut1" };
    expect(buildDetailItemFromRow(rawRow, columnMapping).dataClassification1Name).toBe("KATKEG 1");
    expect(salesReturnMapping.defaultColumnMap["Item CLS3"]).toBe("attribut3");
    expect(salesReturnMapping.defaultColumnMap["Item CLS4"]).toBeUndefined();
  });
});

describe("buildDetailExpenseFromRow", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk, termasuk salesOrderNumber/salesQuotationNumber", () => {
    const rawRow = {
      "Expense Account No": "6-10100",
      "Expense Amount": 50000,
      "Expense Sales Order No": "SO-001",
      "Expense Sales Quotation No": "SQ-001",
    };
    const columnMapping = {
      "Expense Account No": "expenseAccountNo",
      "Expense Amount": "expenseAmount",
      "Expense Sales Order No": "expenseSalesOrderNo",
      "Expense Sales Quotation No": "expenseSalesQuotationNo",
    };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense).toEqual({ accountNo: "6-10100", expenseAmount: 50000, salesOrderNumber: "SO-001", salesQuotationNumber: "SQ-001" });
  });

  test("accountNo TANPA expenseAmount -> null", () => {
    expect(buildDetailExpenseFromRow({ "Expense Account No": "6-10100" }, { "Expense Account No": "expenseAccountNo" })).toBeNull();
  });
});

describe("extractDataClassificationValues & extractExpenseDataClassificationValues", () => {
  test("ambil index+name dari kolom attribut1-10/expenseKategoriKeuanganN yang terisi", () => {
    const rawRow = { "KK 1": "KATKEG 1", "KK Beban 1": "KATKEG BEBAN 1" };
    const columnMapping = { "KK 1": "attribut1", "KK Beban 1": "expenseKategoriKeuangan1" };
    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG 1" }]);
    expect(extractExpenseDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG BEBAN 1" }]);
  });
});

describe("requiredFields — branchName WAJIB sejak awal (pelajaran Fase 120)", () => {
  test("requiredFields memuat semua field bisnis wajib, TIDAK termasuk invoiceNumber/deliveryOrderNumber (kondisional)", () => {
    expect(salesReturnMapping.requiredFields).toContain("branchName");
    expect(salesReturnMapping.requiredFields).toContain("returnType");
    expect(salesReturnMapping.requiredFields).toContain("taxDate");
    expect(salesReturnMapping.requiredFields).toContain("taxNumber");
    expect(salesReturnMapping.requiredFields).not.toContain("invoiceNumber");
    expect(salesReturnMapping.requiredFields).not.toContain("deliveryOrderNumber");
  });
});
