import { describe, test, expect } from "bun:test";
import type { SalesQuotationDetail, SalesQuotationLine } from "../accurate-sales-quotation";
import {
  buildSalesOrderPayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  numberColumnOf,
  extractCustomerCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  salesOrderMapping,
  groupSalesOrderRows,
  validateGroupCustomerConsistency,
  type ImportRowRecord,
  isQuotationExpansionRow,
  missingRequiredFieldsForRow,
  expandQuotationRowsInPayload,
} from "./sales-order.mapping";

// § Fase 137 — mirror `sales-quotation.mapping.test.ts`, disesuaikan:
// field BARU `poNumber` (header) dan `salesmanListNumber` bertipe ARRAY
// beneran (di-split dari 1 kolom "dipisah koma" — BEDA dari Sales
// Quotation yang cuma wrap 1 nilai).
describe("buildSalesOrderPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Cust No": "C.00001",
      "Trans Date": "2026-08-19",
      "Item No": "9900012",
      "Item Price": 10000,
      Qty: 5,
    };
    const columnMapping = {
      "Cust No": "customerNo",
      "Trans Date": "transDate",
      "Item No": "itemNo",
      "Item Price": "unitPrice",
      Qty: "quantity",
    };

    const payload = buildSalesOrderPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Cust No": "C.00001", Description: "" };
    const columnMapping = { "Cust No": "customerNo", Description: "description" };

    const payload = buildSalesOrderPayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildSalesOrderPayload(
      [{ "Cust No": "C.001", "Trans Date": "2026-08-19" }],
      { "Cust No": "customerNo", "Trans Date": "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("PO Number (field BARU vs Sales Quotation) masuk ke root payload", () => {
    const payload = buildSalesOrderPayload(
      [{ "Cust No": "C.001", "PO Number": "PO-2026-001" }],
      { "Cust No": "customerNo", "PO Number": "poNumber" },
    );
    expect(payload.poNumber).toBe("PO-2026-001");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Cust No": "C.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Cust No": "customerNo" };

    const payload = buildSalesOrderPayload([rawRow], columnMapping);

    expect(Object.keys(payload)).toEqual(["customerNo", "detailItem"]);
  });

  const groupColumnMapping = {
    "Trans Date": "transDate",
    "Trans No": "number",
    "Cust No": "customerNo",
    "Item No": "itemNo",
    "Item Price": "unitPrice",
    Qty: "quantity",
  };

  test("2 baris dengan Trans No sama jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { "Trans Date": "19/08/2026", "Trans No": "SO-001", "Cust No": "C1", "Item No": "BRG-1", "Item Price": 1000, Qty: 2 },
      { "Trans Date": "20/08/2026", "Trans No": "SO-001", "Cust No": "C1-BEDA", "Item No": "BRG-2", "Item Price": 2000, Qty: 3 },
    ];
    const payload = buildSalesOrderPayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.customerNo).toBe("C1");
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

describe("groupSalesOrderRows — grouping DEFAULT ADR-0011 (opsional by Trans No)", () => {
  const columnMapping = { "Trans No": "number", "Cust No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Trans No sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { "Trans No": "SO-001", "Cust No": "C1" }),
      row("2", { "Trans No": "SO-001", "Cust No": "C1" }),
      row("3", { "Trans No": "SO-002", "Cust No": "C1" }),
    ];
    const groups = groupSalesOrderRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
  });

  test("Trans No kosong -> tetap 1 baris = 1 sales order sendiri (default, non-breaking)", () => {
    const rows = [row("1", { "Cust No": "C1" }), row("2", { "Cust No": "C1" })];
    const groups = groupSalesOrderRows(rows, columnMapping);
    expect(groups.length).toBe(2);
  });

  test("kolom Trans No tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "Trans No": "SO-001" }), row("2", { "Trans No": "SO-001" })];
    const groups = groupSalesOrderRows(rows, { "Cust No": "customerNo" });
    expect(groups.length).toBe(2);
  });
});

describe("numberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Trans No": "number", "Cust No": "customerNo" })).toBe("Trans No");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Cust No": "customerNo" })).toBeNull();
  });
});

describe("validateGroupCustomerConsistency", () => {
  const columnMapping = { "Cust No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { groupKey: "SO-001", groupColumn: "Trans No", rows: [row("1", { "Cust No": "C1" }), row("2", { "Cust No": "C2" })] };
    const result = validateGroupCustomerConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("SO-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { groupKey: "SO-001", groupColumn: "Trans No", rows: [row("1", { "Cust No": "C1" }), row("2", { "Cust No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Cust No": "C1" })] };
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
    const rawRow = { "Item Name": "Meja Kantor", "Unit Name": "Unit", "Kategori Barang": "Umum" };
    const columnMapping = { "Item Name": "itemName", "Unit Name": "itemUnitName", "Kategori Barang": "itemCategoryName" };
    const payload = extractItemCreateFields(rawRow, columnMapping);
    expect(payload).toEqual({ name: "Meja Kantor", unit1Name: "Unit", itemCategoryName: "Umum" });
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildSalesOrderPayload (regresi)", () => {
    const rawRow = { "Item No": "9900012", "Item Price": 10000, Qty: 5 };
    const columnMapping = { "Item No": "itemNo", "Item Price": "unitPrice", Qty: "quantity" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Cust No": "C.00001", "Item No": "BRG-1" };
    const columnMapping = { "Cust No": "customerNo", "Item No": "itemNo" };
    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });
});

// § Fase 137 — inti keunikan modul ini vs Sales Quotation:
// `salesmanListNumber` di-SPLIT dari 1 kolom Excel "dipisah koma" jadi
// ARRAY BENERAN (multi-elemen), bukan cuma wrap 1 nilai.
describe("Sales List No (separate with comma) -> salesmanListNumber (ARRAY hasil split koma)", () => {
  test("1 nilai tanpa koma jadi array 1-elemen", () => {
    const rawRow = { "Item No": "BRG-1", "Sales List No (separate with comma)": "SLS-01" };
    const columnMapping = { "Item No": "itemNo", "Sales List No (separate with comma)": "salesmanListNumber" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.salesmanListNumber).toEqual(["SLS-01"]);
  });

  test("beberapa nilai dipisah koma jadi array multi-elemen, spasi di-trim", () => {
    const rawRow = { "Item No": "BRG-1", "Sales List No (separate with comma)": "SLS-01, SLS-02 ,SLS-03" };
    const columnMapping = { "Item No": "itemNo", "Sales List No (separate with comma)": "salesmanListNumber" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.salesmanListNumber).toEqual(["SLS-01", "SLS-02", "SLS-03"]);
  });

  test("kolom kosong -> field TIDAK muncul sama sekali (bukan array kosong)", () => {
    const rawRow = { "Item No": "BRG-1", "Sales List No (separate with comma)": "" };
    const columnMapping = { "Item No": "itemNo", "Sales List No (separate with comma)": "salesmanListNumber" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.salesmanListNumber).toBeUndefined();
  });
});

describe("konversi tipe data — boolean & percent discount", () => {
  test("field boolean (taxable, useTax1-3/PPN-PPnBM-PPh) — teks 'TRUE'/'Y'/'1' jadi JSON boolean true, bukan string", () => {
    const rawRow = { "Item No": "BRG-1", Taxable: "TRUE", PPN: "Y", PPnBM: "1", PPh: "FALSE" };
    const columnMapping = { "Item No": "itemNo", Taxable: "taxable", PPN: "useTax1", PPnBM: "useTax2", PPh: "useTax3" };

    const header = buildSalesOrderPayload([rawRow], columnMapping);
    expect(header.taxable).toBe(true);

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.useTax1).toBe(true);
    expect(detail.useTax2).toBe(true);
    expect(detail.useTax3).toBe(false);
  });

  test("cashDiscPercent/itemDiscPercent — angka polos dikonversi ke STRING, bukan number", () => {
    const rawRow = { "Item No": "BRG-1", "Cash Disc Percent": 5, "Item Disc Percent": 10 };
    const columnMapping = { "Item No": "itemNo", "Cash Disc Percent": "cashDiscPercent", "Item Disc Percent": "itemDiscPercent" };

    const header = buildSalesOrderPayload([rawRow], columnMapping);
    expect(header.cashDiscPercent).toBe("5");
    expect(typeof header.cashDiscPercent).toBe("string");

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.itemDiscPercent).toBe("10");
    expect(typeof detail.itemDiscPercent).toBe("string");
  });
});

describe("Kategori Keuangan (Item CLS1-3 / Expense CLS1-3) — TIDAK ada Atribut Tambahan (tidak diminta client)", () => {
  test("Item CLS1-3 masuk ke detailItem sebagai dataClassificationNName", () => {
    const rawRow = { "Item No": "BRG-1", "Item CLS1": "KATKEG 1" };
    const columnMapping = { "Item No": "itemNo", "Item CLS1": "attribut1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dataClassification1Name).toBe("KATKEG 1");
  });

  test("defaultColumnMap — kolom CLS lengkap 1-3 (Excel client cuma minta 3, bukan 10)", () => {
    for (let i = 1; i <= 3; i++) {
      expect(salesOrderMapping.defaultColumnMap[`Item CLS${i}`]).toBe(`attribut${i}`);
      expect(salesOrderMapping.defaultColumnMap[`Expense CLS${i}`]).toBe(`expenseKategoriKeuangan${i}`);
    }
  });

  test("defaultColumnMap — TIDAK punya entri Custom Character/Number/Date (tidak diminta Excel client)", () => {
    expect(salesOrderMapping.defaultColumnMap["Custom Character 1"]).toBeUndefined();
    expect(salesOrderMapping.defaultColumnMap["ITEM: Custom Character 1"]).toBeUndefined();
  });
});

describe("buildDetailExpenseFromRow", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk dengan field lain ikut", () => {
    const rawRow = {
      "Expense Acc No": "6-10100",
      "Expense Name": "Ongkos Kirim",
      "Expense Amount": 50000,
      "Expense Note": "Diskon khusus",
      "Expense Dept": "Marketing",
    };
    const columnMapping = {
      "Expense Acc No": "expenseAccountNo",
      "Expense Name": "expenseName",
      "Expense Amount": "expenseAmount",
      "Expense Note": "expenseNotes",
      "Expense Dept": "expenseDepartmentName",
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
    expect(buildDetailExpenseFromRow({ "Expense Acc No": "6-10100" }, { "Expense Acc No": "expenseAccountNo" })).toBeNull();
    expect(buildDetailExpenseFromRow({ "Expense Amount": 50000 }, { "Expense Amount": "expenseAmount" })).toBeNull();
  });
});

describe("buildSalesOrderPayload — detailExpense", () => {
  test("baris dengan data Beban -> payload.detailExpense terisi", () => {
    const rawRows = [{ "Cust No": "C-1", "Item No": "BRG-1", "Expense Acc No": "6-10100", "Expense Amount": 50000 }];
    const columnMapping = { "Cust No": "customerNo", "Item No": "itemNo", "Expense Acc No": "expenseAccountNo", "Expense Amount": "expenseAmount" };
    const payload = buildSalesOrderPayload(rawRows, columnMapping);
    expect(payload.detailExpense).toEqual([{ accountNo: "6-10100", expenseAmount: 50000 }]);
  });

  test("TIDAK ada baris yang punya data Beban -> payload.detailExpense TIDAK disertakan sama sekali", () => {
    const rawRows = [{ "Cust No": "C-1", "Item No": "BRG-1" }];
    const columnMapping = { "Cust No": "customerNo", "Item No": "itemNo" };
    const payload = buildSalesOrderPayload(rawRows, columnMapping);
    expect(payload.detailExpense).toBeUndefined();
  });
});

describe("extractDataClassificationValues & extractExpenseDataClassificationValues", () => {
  test("ambil index+name dari kolom attribut1-3/expenseKategoriKeuanganN yang terisi, skip yang kosong", () => {
    const rawRow = { "KK 1": "KATKEG 1", "KK Beban 1": "KATKEG BEBAN 1" };
    const columnMapping = { "KK 1": "attribut1", "KK Beban 1": "expenseKategoriKeuangan1" };
    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG 1" }]);
    expect(extractExpenseDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG BEBAN 1" }]);
  });
});

describe("requiredFields — branchName WAJIB sejak awal (pelajaran Fase 120)", () => {
  test("requiredFields memuat semua field bisnis wajib termasuk branchName", () => {
    expect(salesOrderMapping.requiredFields).toContain("branchName");
    expect(salesOrderMapping.requiredFields).toContain("customerNo");
  });
});

// § Fase 169 — Sales Order menarik baris item dari Sales Quotation.
describe("Fase 169 — baris perluasan Sales Quotation", () => {
  const mapping = {
    "Cust No": "customerNo",
    "Item No": "itemNo",
    "Item Name": "itemName",
    "Item Price": "unitPrice",
    Qty: "quantity",
    "Unit Name": "itemUnitName",
    "Item Note": "itemNotes",
    "Sales Quot No": "salesQuotationNumber",
    "Item Dept": "departmentName",
    PPN: "useTax1",
    Description: "description",
    "Branch Name": "branchName",
    "Trans Date": "transDate",
  };
  const header = { "Cust No": "C1", "Branch Name": "JAKARTA", "Trans Date": "06/10/2026" };
  const quotation: SalesQuotationLine[] = [
    { itemNo: "A-1", itemName: "Barang A", unitPrice: 5000, quantity: 10, unitName: "PCS", notes: "catatan A" },
    { itemNo: "B-2", itemName: null, unitPrice: 7500, quantity: 3, unitName: "KG", notes: null },
  ];

  test("isQuotationExpansionRow: Sales Quot No terisi + keenam kolom item kosong = true; salah satu terisi / tanpa nomor penawaran = false", () => {
    expect(isQuotationExpansionRow({ ...header, "Sales Quot No": "SQ-1" }, mapping)).toBe(true);
    // 'Description' header & kolom lain (dept, PPN) TIDAK ikut syarat "kosong"
    expect(isQuotationExpansionRow({ ...header, "Sales Quot No": "SQ-1", Description: "x", "Item Dept": "D", PPN: "Y" }, mapping)).toBe(true);
    for (const col of ["Item No", "Item Name", "Item Price", "Qty", "Unit Name", "Item Note"]) {
      expect(isQuotationExpansionRow({ ...header, "Sales Quot No": "SQ-1", [col]: "1" }, mapping)).toBe(false);
    }
    expect(isQuotationExpansionRow({ ...header }, mapping)).toBe(false);
    expect(isQuotationExpansionRow({ ...header, "Sales Quot No": "  " }, mapping)).toBe(false);
  });

  test("missingRequiredFieldsForRow: baris perluasan tidak wajib Item No/Harga/Qty/Satuan, tapi customer/tanggal/cabang tetap wajib", () => {
    expect(missingRequiredFieldsForRow({ ...header, "Sales Quot No": "SQ-1" }, mapping)).toEqual([]);
    expect(missingRequiredFieldsForRow({ "Sales Quot No": "SQ-1" }, mapping).sort()).toEqual(["branchName", "customerNo", "transDate"]);
    // tanpa Sales Quot No → semua wajib seperti biasa
    expect(missingRequiredFieldsForRow({ ...header }, mapping).sort()).toEqual(["itemNo", "itemNo", "itemUnitName", "quantity", "unitPrice"].filter((v, i, a) => a.indexOf(v) === i).sort());
    // sebagian terisi → semua wajib lagi (aturan: Excel saja, harga kosong = salah)
    expect(missingRequiredFieldsForRow({ ...header, "Sales Quot No": "SQ-1", "Item No": "A-1" }, mapping).sort()).toEqual(["itemUnitName", "quantity", "unitPrice"]);
  });

  test("expandQuotationRowsInPayload: 1 baris → semua baris penawaran; kolom lain berlaku ke SEMUA baris hasil; tiap baris membawa Sales Quot No", async () => {
    const rawRows = [{ ...header, "Sales Quot No": "SQ-1", "Item Dept": "Penjualan", PPN: "Y" }];
    const payload = buildSalesOrderPayload(rawRows, mapping);
    await expandQuotationRowsInPayload(payload, rawRows, mapping, async () => ({ header: {}, lines: quotation, expenses: [] }));
    expect(payload.detailItem).toEqual([
      { salesQuotationNumber: "SQ-1", departmentName: "Penjualan", useTax1: true, itemNo: "A-1", unitPrice: 5000, quantity: 10, itemUnitName: "PCS", detailName: "Barang A", detailNotes: "catatan A" },
      { salesQuotationNumber: "SQ-1", departmentName: "Penjualan", useTax1: true, itemNo: "B-2", unitPrice: 7500, quantity: 3, itemUnitName: "KG" },
    ]);
  });

  test("baris dengan kolom item terisi (qty order 5 dari penawaran 10) TIDAK disentuh — Excel dipakai apa adanya, penawaran tidak dibaca", async () => {
    const rawRows = [{ ...header, "Sales Quot No": "SQ-1", "Item No": "A-1", "Item Price": 5000, Qty: 5, "Unit Name": "PCS" }];
    const payload = buildSalesOrderPayload(rawRows, mapping);
    let fetched = 0;
    await expandQuotationRowsInPayload(payload, rawRows, mapping, async () => {
      fetched++;
      return { header: {}, lines: quotation, expenses: [] };
    });
    expect(fetched).toBe(0);
    expect(payload.detailItem).toEqual([{ salesQuotationNumber: "SQ-1", itemNo: "A-1", unitPrice: 5000, quantity: 5, itemUnitName: "PCS" }]);
  });

  test("campuran: baris biasa + baris perluasan di 1 order — urutan terjaga; penawaran yang sama dibaca SEKALI (cache)", async () => {
    const rawRows = [
      { ...header, "Item No": "Z-9", "Item Price": 100, Qty: 1, "Unit Name": "PCS" },
      { ...header, "Sales Quot No": "SQ-1" },
      { ...header, "Sales Quot No": "SQ-1", "Item Dept": "X" },
    ];
    const payload = buildSalesOrderPayload(rawRows, mapping);
    let fetched = 0;
    await expandQuotationRowsInPayload(payload, rawRows, mapping, async () => {
      fetched++;
      return { header: {}, lines: quotation, expenses: [] };
    });
    expect(fetched).toBe(1);
    expect((payload.detailItem as Record<string, unknown>[]).map((d) => d.itemNo)).toEqual(["Z-9", "A-1", "B-2", "A-1", "B-2"]);
  });

  // § Fase 172 — header/atribut baris/Beban ikut ditarik; isian Excel menang.
  const richQuotation: SalesQuotationDetail = {
    header: { paymentTermName: "net 30", toAddress: "Jl. Mawar 1", description: "Penawaran Q3", cashDiscount: 1000, cashDiscPercent: "5", currencyCode: "IDR" },
    lines: [
      { itemNo: "A-1", itemName: "Barang A", unitPrice: 5000, quantity: 10, unitName: "PCS", notes: null, itemCashDiscount: 250, itemDiscPercent: "2", departmentName: "Penjualan", projectNo: "PRJ-1", salesmanListNumber: ["S-1", "S-2"], useTax1: true, useTax3: false },
      { itemNo: "B-2", itemName: null, unitPrice: 7500, quantity: 3, unitName: "KG", notes: null },
    ],
    expenses: [{ accountNo: "6101", expenseName: "Ongkir", expenseAmount: 15000, expenseNotes: "kirim" }],
  };
  const richMapping: Record<string, string> = {
    ...mapping,
    "Pay Term Name": "paymentTermName",
    "To Address": "toAddress",
    "Currency Code": "currencyCode",
    "Cash Discount": "cashDiscount",
    "Item Project No": "projectNo",
    "Item Disc Percent": "itemDiscPercent",
    "Expense Acc No": "expenseAccountNo",
    "Expense Amount": "expenseAmount",
  };

  test("Fase 172: kolom header, diskon/dept/proyek/penjual/PPN/PPh baris kosong → diisi dari penawaran; baris tanpa data itu tidak dikarang", async () => {
    const rawRows = [{ ...header, "Sales Quot No": "SQ-1" }];
    const payload = buildSalesOrderPayload(rawRows, richMapping);
    await expandQuotationRowsInPayload(payload, rawRows, richMapping, async () => richQuotation);
    expect(payload).toMatchObject({ paymentTermName: "net 30", toAddress: "Jl. Mawar 1", description: "Penawaran Q3", cashDiscount: 1000, cashDiscPercent: "5", currencyCode: "IDR" });
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ itemCashDiscount: 250, itemDiscPercent: "2", departmentName: "Penjualan", projectNo: "PRJ-1", salesmanListNumber: ["S-1", "S-2"], useTax1: true, useTax3: false });
    expect(Object.keys(items[1]!)).not.toContain("departmentName");
    expect(Object.keys(items[1]!)).not.toContain("useTax1");
  });

  test("Fase 172: isian Excel MENANG atas penawaran (header, atribut baris, dan Beban)", async () => {
    const rawRows = [{ ...header, "Sales Quot No": "SQ-1", "Pay Term Name": "cash", Description: "dari excel", "Item Dept": "Gudang", "Item Project No": "PRJ-9", PPN: "N", "Expense Acc No": "7000", "Expense Amount": 1 }];
    const payload = buildSalesOrderPayload(rawRows, richMapping);
    await expandQuotationRowsInPayload(payload, rawRows, richMapping, async () => richQuotation);
    expect(payload.paymentTermName).toBe("cash");
    expect(payload.description).toBe("dari excel");
    expect(payload.toAddress).toBe("Jl. Mawar 1"); // yang kosong tetap ditarik
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ departmentName: "Gudang", projectNo: "PRJ-9", useTax1: false });
    // Excel punya baris Beban → Beban penawaran TIDAK ditarik (tidak digandakan)
    expect(payload.detailExpense).toEqual([{ accountNo: "7000", expenseAmount: 1 }]);
  });

  test("Fase 172: Beban penawaran ditarik bila Excel tidak punya Beban; membawa nomor penawaran; dua penawaran → Beban keduanya", async () => {
    const rawRows = [
      { ...header, "Sales Quot No": "SQ-1" },
      { ...header, "Sales Quot No": "SQ-2" },
    ];
    const payload = buildSalesOrderPayload(rawRows, richMapping);
    await expandQuotationRowsInPayload(payload, rawRows, richMapping, async () => richQuotation);
    expect(payload.detailExpense).toEqual([
      { accountNo: "6101", expenseAmount: 15000, salesQuotationNumber: "SQ-1", expenseName: "Ongkir", expenseNotes: "kirim" },
      { accountNo: "6101", expenseAmount: 15000, salesQuotationNumber: "SQ-2", expenseName: "Ongkir", expenseNotes: "kirim" },
    ]);
  });

  test("Fase 172: tanpa baris perluasan header & Beban tidak disentuh", async () => {
    const rawRows = [{ ...header, "Item No": "Z-9", "Item Price": 100, Qty: 1, "Unit Name": "PCS" }];
    const payload = buildSalesOrderPayload(rawRows, richMapping);
    await expandQuotationRowsInPayload(payload, rawRows, richMapping, async () => richQuotation);
    expect(payload.paymentTermName).toBeUndefined();
    expect(payload.detailExpense).toBeUndefined();
  });

  test("penawaran tidak ketemu/tidak terbaca → error dari fetcher diteruskan apa adanya (baris gagal dengan pesan jelas)", async () => {
    const rawRows = [{ ...header, "Sales Quot No": "SQ-404" }];
    const payload = buildSalesOrderPayload(rawRows, mapping);
    await expect(
      expandQuotationRowsInPayload(payload, rawRows, mapping, async (n) => {
        throw new Error(`Penawaran "${n}" tidak ditemukan di Accurate`);
      }),
    ).rejects.toThrow('Penawaran "SQ-404" tidak ditemukan');
  });
});
