import { describe, test, expect } from "bun:test";
import {
  buildPurchaseOrderPayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  numberColumnOf,
  extractVendorCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  purchaseOrderMapping,
  groupPurchaseOrderRows,
  validateGroupVendorConsistency,
  type ImportRowRecord,
} from "./purchase-order.mapping";

// § Fase 120 — mirror `purchase-invoice.mapping.test.ts`, disesuaikan
// dengan perbedaan Purchase Order: grouping MURNI by "Trans No" (tidak
// ada fallback ke Bill No, § architecture-purchase-order.md), dan
// Atribut Tambahan HANYA level ITEM (tidak ada versi header di sheet
// client).
describe("buildPurchaseOrderPayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Vendor No": "V.00001",
      "Trans Date": "2026-08-19",
      "Item No": "9900012",
      "Item Price": 10000,
      Qty: 5,
    };
    const columnMapping = {
      "Vendor No": "vendorNo",
      "Trans Date": "transDate",
      "Item No": "itemNo",
      "Item Price": "unitPrice",
      Qty: "quantity",
    };

    const payload = buildPurchaseOrderPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Vendor No": "V.00001", Description: "" };
    const columnMapping = { "Vendor No": "vendorNo", Description: "description" };

    const payload = buildPurchaseOrderPayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY", () => {
    const payload = buildPurchaseOrderPayload(
      [{ "Vendor No": "V.001", "Trans Date": "2026-08-19" }],
      { "Vendor No": "vendorNo", "Trans Date": "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    // 46253 = 19 Agustus 2026 (basis epoch Excel 30 Des 1899)
    const payload = buildPurchaseOrderPayload(
      [{ "Vendor No": "V.001", "Trans Date": 46253 }],
      { "Vendor No": "vendorNo", "Trans Date": "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Vendor No": "V.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Vendor No": "vendorNo" };

    const payload = buildPurchaseOrderPayload([rawRow], columnMapping);

    expect(Object.keys(payload)).toEqual(["vendorNo", "detailItem"]);
  });

  const groupColumnMapping = {
    "Trans Date": "transDate",
    "Trans No": "number",
    "Vendor No": "vendorNo",
    "Item No": "itemNo",
    "Item Price": "unitPrice",
    Qty: "quantity",
  };

  test("2 baris jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { "Trans Date": "19/08/2026", "Trans No": "PO-001", "Vendor No": "V1", "Item No": "BRG-1", "Item Price": 1000, Qty: 2 },
      { "Trans Date": "20/08/2026", "Trans No": "PO-001", "Vendor No": "V1-BEDA", "Item No": "BRG-2", "Item Price": 2000, Qty: 3 },
    ];
    const payload = buildPurchaseOrderPayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026"); // dari baris pertama, baris kedua diabaikan
    expect(payload.vendorNo).toBe("V1"); // dari baris pertama
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

// § grouping MURNI by "Trans No" — "number" WAJIB sejak requiredFields,
// TIDAK ada fallback ke kolom lain (beda dari Purchase Invoice Fase 81).
describe("groupPurchaseOrderRows", () => {
  const columnMapping = { "Trans No": "number", "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Trans No sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { "Trans No": "PO-001", "Vendor No": "V1" }),
      row("2", { "Trans No": "PO-001", "Vendor No": "V1" }),
      row("3", { "Trans No": "PO-002", "Vendor No": "V1" }),
    ];
    const groups = groupPurchaseOrderRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[1]!.rows.length).toBe(1);
    expect(groups[0]!.groupColumn).toBe("Trans No");
  });

  test("Trans No kosong tetap jadi grup sendiri per baris", () => {
    const rows = [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })];
    const groups = groupPurchaseOrderRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom Trans No tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "Trans No": "PO-001" }), row("2", { "Trans No": "PO-001" })];
    const mappingTanpaNumber = { "Vendor No": "vendorNo" };
    const groups = groupPurchaseOrderRows(rows, mappingTanpaNumber);
    expect(groups.length).toBe(2);
  });

  test("Trans No sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "Trans No": " po-001 " }), row("2", { "Trans No": "PO-001" })];
    const groups = groupPurchaseOrderRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("numberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke number", () => {
    expect(numberColumnOf({ "Trans No": "number", "Vendor No": "vendorNo" })).toBe("Trans No");
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
    const group = {
      groupKey: "PO-001",
      groupColumn: "Trans No",
      rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V2" })],
    };
    const result = validateGroupVendorConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("PO-001");
  });

  test("vendorNo sama dalam 1 grup -> return null", () => {
    const group = {
      groupKey: "PO-001",
      groupColumn: "Trans No",
      rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })],
    };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Vendor No": "V1" })] };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });
});

describe("extractVendorCreateFields", () => {
  test("field opsional dipetakan ke path Accurate yang benar", () => {
    const rawRow = {
      "Nama Vendor": "CV Sumber Makmur",
      "Kategori Vendor": "Umum",
      "Telepon Bisnis": "0211234567",
      Handphone: "081234567890",
      "Email Vendor": "test@example.com",
      "Alamat Vendor": "Jl. Contoh No. 1",
      "Negara Vendor": "Indonesia",
      "Akun Hutang": "210101",
    };
    const columnMapping = {
      "Nama Vendor": "vendorName",
      "Kategori Vendor": "vendorCategoryName",
      "Telepon Bisnis": "vendorWorkPhone",
      Handphone: "vendorMobilePhone",
      "Email Vendor": "vendorEmail",
      "Alamat Vendor": "vendorAddress",
      "Negara Vendor": "vendorCountry",
      "Akun Hutang": "vendorPayableAccountNo",
    };

    const payload = extractVendorCreateFields(rawRow, columnMapping);

    expect(payload).toEqual({
      name: "CV Sumber Makmur",
      categoryName: "Umum",
      workPhone: "0211234567",
      mobilePhone: "081234567890",
      email: "test@example.com",
      billStreet: "Jl. Contoh No. 1",
      billCountry: "Indonesia",
      vendorPayableAccountListNo: "210101",
    });
  });

  test("WhatsApp masuk ke detailContact[0].bbmPin, pakai nama vendor sebagai nama kontak", () => {
    const rawRow = { "Nama Vendor": "CV Sumber Makmur", WhatsApp: "081234567890" };
    const columnMapping = { "Nama Vendor": "vendorName", WhatsApp: "vendorWhatsapp" };

    const payload = extractVendorCreateFields(rawRow, columnMapping);

    expect(payload.detailContact).toEqual([{ name: "CV Sumber Makmur", bbmPin: "081234567890" }]);
    expect(payload).not.toHaveProperty("vendorWhatsapp");
  });

  test("tidak ada kolom di-mapping -> object kosong (semua field ini opsional)", () => {
    expect(extractVendorCreateFields({}, {})).toEqual({});
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildPurchaseOrderPayload (regresi)", () => {
    const rawRow = {
      "Vendor No": "V.00001",
      "Trans Date": "2026-08-19",
      "Item No": "9900012",
      "Item Price": 10000,
      Qty: 5,
    };
    const columnMapping = {
      "Vendor No": "vendorNo",
      "Trans Date": "transDate",
      "Item No": "itemNo",
      "Item Price": "unitPrice",
      Qty: "quantity",
    };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Vendor No": "V.00001", "Item No": "BRG-1" };
    const columnMapping = { "Vendor No": "vendorNo", "Item No": "itemNo" };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });
});

describe("extractItemCreateFields", () => {
  test("name+unit1Name diambil dari field itemName/itemUnitName", () => {
    const rawRow = { "Item Name": "Meja Kantor", "Unit Name": "Unit", "Kategori Barang": "Umum" };
    const columnMapping = {
      "Item Name": "itemName",
      "Unit Name": "itemUnitName",
      "Kategori Barang": "itemCategoryName",
    };

    const payload = extractItemCreateFields(rawRow, columnMapping);

    expect(payload).toEqual({ name: "Meja Kantor", unit1Name: "Unit", itemCategoryName: "Umum" });
  });
});

describe("konversi tipe data — boolean & percent discount", () => {
  test("field boolean (taxable, useTax1-3) — teks 'TRUE'/'Y'/'1' jadi JSON boolean true, bukan string", () => {
    const rawRow = { "Item No": "BRG-1", Taxable: "TRUE", PPN: "Y", PPnBM: "1", PPh: "FALSE" };
    const columnMapping = { "Item No": "itemNo", Taxable: "taxable", PPN: "useTax1", PPnBM: "useTax2", PPh: "useTax3" };

    const header = buildPurchaseOrderPayload([rawRow], columnMapping);
    expect(header.taxable).toBe(true);

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.useTax1).toBe(true);
    expect(detail.useTax2).toBe(true);
    expect(detail.useTax3).toBe(false);
  });

  test("cashDiscPercent/itemDiscPercent — angka polos dari Excel dikonversi ke STRING, bukan number", () => {
    const rawRow = { "Item No": "BRG-1", "Cash Disc Percent": 5, "ITEM: Disc Percent": 10 };
    const columnMapping = { "Item No": "itemNo", "Cash Disc Percent": "cashDiscPercent", "ITEM: Disc Percent": "itemDiscPercent" };

    const header = buildPurchaseOrderPayload([rawRow], columnMapping);
    expect(header.cashDiscPercent).toBe("5");
    expect(typeof header.cashDiscPercent).toBe("string");

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.itemDiscPercent).toBe("10");
    expect(typeof detail.itemDiscPercent).toBe("string");
  });
});

// § Atribut Tambahan HANYA level ITEM (tidak ada versi header di sheet
// Purchase Order client) — beda dari Purchase Invoice/Sales Invoice yang
// punya keduanya.
describe("Atribut Tambahan & Kategori Keuangan level ITEM", () => {
  test("Kategori Keuangan level ITEM (dataClassificationNName) masuk ke detailItem", () => {
    const rawRow = { "Item No": "BRG-1", "ITEM: Finance Category 1": "KATKEG 1" };
    const columnMapping = { "Item No": "itemNo", "ITEM: Finance Category 1": "attribut1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dataClassification1Name).toBe("KATKEG 1");
  });

  test("Atribut Tambahan level ITEM (charField 15 slot/numericField/dateField) masuk ke detailItem, BUKAN root", () => {
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
    const payload = buildPurchaseOrderPayload([rawRow], columnMapping);
    expect(payload.charField1).toBeUndefined();
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBe("Karakter Item 1");
    expect(detail.charField15).toBe("Slot Terakhir");
    expect(detail.numericField1).toBe("500");
    expect(detail.dateField1).toBe("21/08/2026");
    expect(detail.dataClassification1Name).toBeUndefined();
  });

  test("defaultColumnMap — kolom Atribut Tambahan/Kategori Keuangan lengkap (sesuai kolom Excel client, 10 slot char/number)", () => {
    for (let i = 1; i <= 10; i++) {
      expect(purchaseOrderMapping.defaultColumnMap[`ITEM: Finance Category ${i}`]).toBe(`attribut${i}`);
      expect(purchaseOrderMapping.defaultColumnMap[`ITEM: Custom Character ${i}`]).toBe(`attributItemKarakter${i}`);
      expect(purchaseOrderMapping.defaultColumnMap[`ITEM: Custom Number ${i}`]).toBe(`attributItemAngka${i}`);
    }
    expect(purchaseOrderMapping.defaultColumnMap["ITEM: Custom Date 1"]).toBe("attributItemTanggal1");
    expect(purchaseOrderMapping.defaultColumnMap["ITEM: Custom Date 2"]).toBe("attributItemTanggal2");
  });
});

describe("buildDetailExpenseFromRow", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk dengan field lain ikut", () => {
    const rawRow = {
      "Expense Acc No": "6-10100",
      "Expense Name": "Ongkos Kirim",
      "Expense Amount": 50000,
      "Expense Note": "Kirim dari Surabaya",
      "EXPENSE: Department": "Logistik",
    };
    const columnMapping = {
      "Expense Acc No": "expenseAccountNo",
      "Expense Name": "expenseName",
      "Expense Amount": "expenseAmount",
      "Expense Note": "expenseNotes",
      "EXPENSE: Department": "expenseDepartmentName",
    };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense).toEqual({
      accountNo: "6-10100",
      expenseName: "Ongkos Kirim",
      expenseAmount: 50000,
      expenseNotes: "Kirim dari Surabaya",
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

describe("buildPurchaseOrderPayload — detailExpense", () => {
  test("baris dengan data Beban -> payload.detailExpense terisi, TIDAK masuk root ATAU detailItem", () => {
    const rawRows = [{ "Vendor No": "V-1", "Item No": "BRG-1", "Expense Acc No": "6-10100", "Expense Amount": 50000 }];
    const columnMapping = { "Vendor No": "vendorNo", "Item No": "itemNo", "Expense Acc No": "expenseAccountNo", "Expense Amount": "expenseAmount" };
    const payload = buildPurchaseOrderPayload(rawRows, columnMapping);
    expect(payload.accountNo).toBeUndefined();
    expect(payload.detailExpense).toEqual([{ accountNo: "6-10100", expenseAmount: 50000 }]);
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.accountNo).toBeUndefined();
  });

  test("TIDAK ada baris yang punya data Beban -> payload.detailExpense TIDAK disertakan sama sekali", () => {
    const rawRows = [{ "Vendor No": "V-1", "Item No": "BRG-1" }];
    const columnMapping = { "Vendor No": "vendorNo", "Item No": "itemNo" };
    const payload = buildPurchaseOrderPayload(rawRows, columnMapping);
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
