import { describe, test, expect } from "bun:test";
import {
  buildSalesQuotationPayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  numberColumnOf,
  extractCustomerCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  salesQuotationMapping,
  groupSalesQuotationRows,
  validateGroupCustomerConsistency,
  type ImportRowRecord,
} from "./sales-quotation.mapping";

// § Fase 123 — mirror `purchase-order.mapping.test.ts` (auto-create +
// generic prefix-based mapping), disesuaikan: kunci customer (bukan
// vendor), grouping DEFAULT (opsional), field `salesmanNo` bertipe
// ARRAY (fokus test terpisah di bawah), TIDAK ada `warehouseName`
// (tidak diminta Excel client), `detailExpense[]` TIDAK punya
// `projectNo` (dikonfirmasi tidak ada di API).
describe("buildSalesQuotationPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Customer Number": "C.00001",
      Date: "2026-08-19",
      "Item Number": "9900012",
      "Item price": 10000,
      "Item Quantity": 5,
    };
    const columnMapping = {
      "Customer Number": "customerNo",
      Date: "transDate",
      "Item Number": "itemNo",
      "Item price": "unitPrice",
      "Item Quantity": "quantity",
    };

    const payload = buildSalesQuotationPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Customer Number": "C.00001", Description: "" };
    const columnMapping = { "Customer Number": "customerNo", Description: "description" };

    const payload = buildSalesQuotationPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildSalesQuotationPayload(
      [{ "Customer Number": "C.001", Date: "2026-08-19" }],
      { "Customer Number": "customerNo", Date: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Customer Number": "C.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Customer Number": "customerNo" };

    const payload = buildSalesQuotationPayload([rawRow], columnMapping);

    expect(Object.keys(payload)).toEqual(["customerNo", "detailItem"]);
  });

  const groupColumnMapping = {
    Date: "transDate",
    "Trans Number": "number",
    "Customer Number": "customerNo",
    "Item Number": "itemNo",
    "Item price": "unitPrice",
    "Item Quantity": "quantity",
  };

  test("2 baris dengan Trans Number sama jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { Date: "19/08/2026", "Trans Number": "SQ-001", "Customer Number": "C1", "Item Number": "BRG-1", "Item price": 1000, "Item Quantity": 2 },
      { Date: "20/08/2026", "Trans Number": "SQ-001", "Customer Number": "C1-BEDA", "Item Number": "BRG-2", "Item price": 2000, "Item Quantity": 3 },
    ];
    const payload = buildSalesQuotationPayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.customerNo).toBe("C1");
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

describe("groupSalesQuotationRows — grouping DEFAULT ADR-0011 (opsional by Trans Number)", () => {
  const columnMapping = { "Trans Number": "number", "Customer Number": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Trans Number sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { "Trans Number": "SQ-001", "Customer Number": "C1" }),
      row("2", { "Trans Number": "SQ-001", "Customer Number": "C1" }),
      row("3", { "Trans Number": "SQ-002", "Customer Number": "C1" }),
    ];
    const groups = groupSalesQuotationRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
  });

  test("Trans Number kosong -> tetap 1 baris = 1 quotation sendiri (default, non-breaking)", () => {
    const rows = [row("1", { "Customer Number": "C1" }), row("2", { "Customer Number": "C1" })];
    const groups = groupSalesQuotationRows(rows, columnMapping);
    expect(groups.length).toBe(2);
  });

  test("kolom Trans Number tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "Trans Number": "SQ-001" }), row("2", { "Trans Number": "SQ-001" })];
    const groups = groupSalesQuotationRows(rows, { "Customer Number": "customerNo" });
    expect(groups.length).toBe(2);
  });
});

describe("numberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Trans Number": "number", "Customer Number": "customerNo" })).toBe("Trans Number");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Customer Number": "customerNo" })).toBeNull();
  });
});

describe("validateGroupCustomerConsistency", () => {
  const columnMapping = { "Customer Number": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { groupKey: "SQ-001", groupColumn: "Trans Number", rows: [row("1", { "Customer Number": "C1" }), row("2", { "Customer Number": "C2" })] };
    const result = validateGroupCustomerConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("SQ-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { groupKey: "SQ-001", groupColumn: "Trans Number", rows: [row("1", { "Customer Number": "C1" }), row("2", { "Customer Number": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Customer Number": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });
});

describe("extractCustomerCreateFields", () => {
  test("field opsional dipetakan ke path Accurate yang benar", () => {
    const rawRow = {
      "Nama Customer": "PT Sumber Makmur",
      "Kategori Customer": "Umum",
      "Telepon Bisnis": "0211234567",
      Handphone: "081234567890",
      "Email Customer": "test@example.com",
      "Alamat Customer": "Jl. Contoh No. 1",
      "Negara Customer": "Indonesia",
      "Akun Piutang": "110101",
    };
    const columnMapping = {
      "Nama Customer": "customerName",
      "Kategori Customer": "customerCategoryName",
      "Telepon Bisnis": "customerWorkPhone",
      Handphone: "customerMobilePhone",
      "Email Customer": "customerEmail",
      "Alamat Customer": "customerAddress",
      "Negara Customer": "customerCountry",
      "Akun Piutang": "customerReceivableAccountListNo",
    };

    const payload = extractCustomerCreateFields(rawRow, columnMapping);

    expect(payload).toEqual({
      name: "PT Sumber Makmur",
      categoryName: "Umum",
      workPhone: "0211234567",
      mobilePhone: "081234567890",
      email: "test@example.com",
      billStreet: "Jl. Contoh No. 1",
      billCountry: "Indonesia",
      customerReceivableAccountListNo: "110101",
    });
  });

  test("tidak ada kolom di-mapping -> object kosong (semua field ini opsional)", () => {
    expect(extractCustomerCreateFields({}, {})).toEqual({});
  });
});

describe("extractItemCreateFields", () => {
  test("name+unit1Name diambil dari field itemName/itemUnitName", () => {
    const rawRow = { "Item Name": "Meja Kantor", "Item Unit Name": "Unit", "Kategori Barang": "Umum" };
    const columnMapping = { "Item Name": "itemName", "Item Unit Name": "itemUnitName", "Kategori Barang": "itemCategoryName" };
    const payload = extractItemCreateFields(rawRow, columnMapping);
    expect(payload).toEqual({ name: "Meja Kantor", unit1Name: "Unit", itemCategoryName: "Umum" });
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildSalesQuotationPayload (regresi)", () => {
    const rawRow = { "Item Number": "9900012", "Item price": 10000, "Item Quantity": 5 };
    const columnMapping = { "Item Number": "itemNo", "Item price": "unitPrice", "Item Quantity": "quantity" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Customer Number": "C.00001", "Item Number": "BRG-1" };
    const columnMapping = { "Customer Number": "customerNo", "Item Number": "itemNo" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });
});

// § Fase 123 — inti keunikan modul ini: `salesmanListNumber` bertipe
// ARRAY of string di API, Excel client cuma 1 kolom → dipetakan sebagai
// array 1-elemen.
describe("Item Salesman No -> salesmanListNumber (ARRAY, bukan string biasa)", () => {
  test("1 nilai Excel jadi array 1-elemen", () => {
    const rawRow = { "Item Number": "BRG-1", "Item Salesman No": "SM-001" };
    const columnMapping = { "Item Number": "itemNo", "Item Salesman No": "salesmanNo" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.salesmanListNumber).toEqual(["SM-001"]);
  });

  test("kolom kosong -> field TIDAK muncul sama sekali (bukan array kosong)", () => {
    const rawRow = { "Item Number": "BRG-1", "Item Salesman No": "" };
    const columnMapping = { "Item Number": "itemNo", "Item Salesman No": "salesmanNo" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.salesmanListNumber).toBeUndefined();
  });
});

describe("konversi tipe data — boolean & percent discount", () => {
  test("field boolean (taxable, useTax1-3) — teks 'TRUE'/'Y'/'1' jadi JSON boolean true, bukan string", () => {
    const rawRow = { "Item Number": "BRG-1", Taxable: "TRUE", "Item Tax1": "Y", "Item Tax2": "1", "Item Tax3": "FALSE" };
    const columnMapping = { "Item Number": "itemNo", Taxable: "taxable", "Item Tax1": "useTax1", "Item Tax2": "useTax2", "Item Tax3": "useTax3" };

    const header = buildSalesQuotationPayload([rawRow], columnMapping);
    expect(header.taxable).toBe(true);

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.useTax1).toBe(true);
    expect(detail.useTax2).toBe(true);
    expect(detail.useTax3).toBe(false);
  });

  test("cashDiscPercent/itemDiscPercent — angka polos dikonversi ke STRING, bukan number", () => {
    const rawRow = { "Item Number": "BRG-1", "Cash Discount Percent": 5, "Item Discount Percent": 10 };
    const columnMapping = { "Item Number": "itemNo", "Cash Discount Percent": "cashDiscPercent", "Item Discount Percent": "itemDiscPercent" };

    const header = buildSalesQuotationPayload([rawRow], columnMapping);
    expect(header.cashDiscPercent).toBe("5");
    expect(typeof header.cashDiscPercent).toBe("string");

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.itemDiscPercent).toBe("10");
    expect(typeof detail.itemDiscPercent).toBe("string");
  });
});

describe("Atribut Tambahan & Kategori Keuangan — level HEADER dan ITEM", () => {
  test("Atribut Tambahan level HEADER masuk ke ROOT payload, BUKAN detailItem", () => {
    const rawRows = [
      { "Customer Number": "C-1", "Item Number": "BRG-1", "Custom Character 1": "Proyek A", "Custom Number 1": "100", "Custom Date 1": "20/08/2026" },
    ];
    const columnMapping = {
      "Customer Number": "customerNo",
      "Item Number": "itemNo",
      "Custom Character 1": "attributHeaderKarakter1",
      "Custom Number 1": "attributHeaderAngka1",
      "Custom Date 1": "attributHeaderTanggal1",
    };
    const payload = buildSalesQuotationPayload(rawRows, columnMapping);
    expect(payload.charField1).toBe("Proyek A");
    expect(payload.numericField1).toBe("100");
    expect(payload.dateField1).toBe("20/08/2026");
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBeUndefined();
  });

  test("Atribut Tambahan level ITEM (15 slot char) masuk ke detailItem, BUKAN root", () => {
    const rawRow = {
      "Item Number": "BRG-1",
      "ITEM: Custom Character 1": "Karakter Item 1",
      "ITEM: Custom Character 15": "Slot Terakhir",
      "ITEM: Custom Number 1": "500",
      "ITEM: Custom Date 1": "21/08/2026",
    };
    const columnMapping = {
      "Item Number": "itemNo",
      "ITEM: Custom Character 1": "attributItemKarakter1",
      "ITEM: Custom Character 15": "attributItemKarakter15",
      "ITEM: Custom Number 1": "attributItemAngka1",
      "ITEM: Custom Date 1": "attributItemTanggal1",
    };
    const payload = buildSalesQuotationPayload([rawRow], columnMapping);
    expect(payload.charField1).toBeUndefined();
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBe("Karakter Item 1");
    expect(detail.charField15).toBe("Slot Terakhir");
    expect(detail.numericField1).toBe("500");
    expect(detail.dateField1).toBe("21/08/2026");
  });

  test("Kategori Keuangan level ITEM (dataClassificationNName) masuk ke detailItem", () => {
    const rawRow = { "Item Number": "BRG-1", "ITEM: Finance Category 1": "KATKEG 1" };
    const columnMapping = { "Item Number": "itemNo", "ITEM: Finance Category 1": "attribut1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dataClassification1Name).toBe("KATKEG 1");
  });

  test("defaultColumnMap — TIDAK punya entri untuk 'Expense Project No' (tidak ada field API)", () => {
    expect(salesQuotationMapping.defaultColumnMap["Expense Project No"]).toBeUndefined();
  });

  test("defaultColumnMap — kolom Atribut Tambahan/Kategori Keuangan lengkap", () => {
    for (let i = 1; i <= 10; i++) {
      expect(salesQuotationMapping.defaultColumnMap[`Custom Character ${i}`]).toBe(`attributHeaderKarakter${i}`);
      expect(salesQuotationMapping.defaultColumnMap[`ITEM: Custom Character ${i}`]).toBe(`attributItemKarakter${i}`);
      expect(salesQuotationMapping.defaultColumnMap[`ITEM: Finance Category ${i}`]).toBe(`attribut${i}`);
    }
  });
});

describe("buildDetailExpenseFromRow — TIDAK ADA projectNo (dikonfirmasi tidak ada di API)", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk dengan field lain ikut", () => {
    const rawRow = {
      "Expense Account no": "6-10100",
      "Expense Name": "Ongkos Kirim",
      "Expense Amount": 50000,
      "Expense Note": "Diskon khusus",
      "Expense Department": "Marketing",
    };
    const columnMapping = {
      "Expense Account no": "expenseAccountNo",
      "Expense Name": "expenseName",
      "Expense Amount": "expenseAmount",
      "Expense Note": "expenseNotes",
      "Expense Department": "expenseDepartmentName",
    };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense).toEqual({
      accountNo: "6-10100",
      expenseName: "Ongkos Kirim",
      expenseAmount: 50000,
      expenseNotes: "Diskon khusus",
      departmentName: "Marketing",
    });
  });

  test("accountNo TANPA expenseAmount (atau sebaliknya) -> null", () => {
    expect(buildDetailExpenseFromRow({ "Expense Account no": "6-10100" }, { "Expense Account no": "expenseAccountNo" })).toBeNull();
    expect(buildDetailExpenseFromRow({ "Expense Amount": 50000 }, { "Expense Amount": "expenseAmount" })).toBeNull();
  });
});

describe("buildSalesQuotationPayload — detailExpense", () => {
  test("baris dengan data Beban -> payload.detailExpense terisi", () => {
    const rawRows = [{ "Customer Number": "C-1", "Item Number": "BRG-1", "Expense Account no": "6-10100", "Expense Amount": 50000 }];
    const columnMapping = { "Customer Number": "customerNo", "Item Number": "itemNo", "Expense Account no": "expenseAccountNo", "Expense Amount": "expenseAmount" };
    const payload = buildSalesQuotationPayload(rawRows, columnMapping);
    expect(payload.detailExpense).toEqual([{ accountNo: "6-10100", expenseAmount: 50000 }]);
  });

  test("TIDAK ada baris yang punya data Beban -> payload.detailExpense TIDAK disertakan sama sekali", () => {
    const rawRows = [{ "Customer Number": "C-1", "Item Number": "BRG-1" }];
    const columnMapping = { "Customer Number": "customerNo", "Item Number": "itemNo" };
    const payload = buildSalesQuotationPayload(rawRows, columnMapping);
    expect(payload.detailExpense).toBeUndefined();
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
  test("requiredFields memuat semua field bisnis wajib termasuk branchName", () => {
    expect(salesQuotationMapping.requiredFields).toContain("branchName");
    expect(salesQuotationMapping.requiredFields).toContain("customerNo");
  });
});
