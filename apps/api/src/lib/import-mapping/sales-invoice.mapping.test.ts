import { describe, test, expect } from "bun:test";
import {
  buildSalesInvoicePayload,
  buildDetailItemFromRow,
  poNumberColumnOf,
  extractCustomerCreateFields,
  extractItemCreateFields,
  groupSalesInvoiceRows,
  validateGroupCustomerConsistency,
  type ImportRowRecord,
} from "./sales-invoice.mapping";

// § Fase 13 — mirror 1:1 `purchase-invoice.mapping.test.ts` (customerNo↔
// vendorNo, poNumber↔billNumber).
describe("buildSalesInvoicePayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Customer No": "C.00001",
      Tanggal: "2026-08-19",
      "Kode Barang": "9900012",
      Harga: 10000,
      Qty: 5,
    };
    const columnMapping = {
      "Customer No": "customerNo",
      Tanggal: "transDate",
      "Kode Barang": "itemNo",
      Harga: "unitPrice",
      Qty: "quantity",
    };

    const payload = buildSalesInvoicePayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Customer No": "C.00001", Note: "" };
    const columnMapping = { "Customer No": "customerNo", Note: "description" };

    const payload = buildSalesInvoicePayload([rawRow], columnMapping);

    expect(payload.customerNo).toBe("C.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY (format yang diterima Accurate)", () => {
    const payload = buildSalesInvoicePayload([{ "Customer No": "C.001", Tanggal: "2026-08-19" }], { "Customer No": "customerNo", Tanggal: "transDate" });
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal yang sudah DD/MM/YYYY dibiarkan apa adanya", () => {
    const payload = buildSalesInvoicePayload([{ "Customer No": "C.001", Tanggal: "19/08/2026" }], { "Customer No": "customerNo", Tanggal: "transDate" });
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    // 46253 = 19 Agustus 2026 (basis epoch Excel 30 Des 1899)
    const payload = buildSalesInvoicePayload([{ "Customer No": "C.001", Tanggal: 46253 }], { "Customer No": "customerNo", Tanggal: "transDate" });
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Customer No": "C.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Customer No": "customerNo" };

    const payload = buildSalesInvoicePayload([rawRow], columnMapping);

    expect(Object.keys(payload)).toEqual(["customerNo", "detailItem"]);
  });

  const groupColumnMapping = {
    Tanggal: "transDate",
    "PO Number": "poNumber",
    "Customer No": "customerNo",
    "Item No": "itemNo",
    "Unit Price": "unitPrice",
    "Item Qty": "quantity",
  };

  test("2 baris jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { Tanggal: "19/08/2026", "Customer No": "C1", "Item No": "BRG-1", "Unit Price": 1000, "Item Qty": 2 },
      { Tanggal: "20/08/2026", "Customer No": "C1-BEDA", "Item No": "BRG-2", "Unit Price": 2000, "Item Qty": 3 },
    ];
    const payload = buildSalesInvoicePayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026");
    expect(payload.customerNo).toBe("C1");
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

describe("groupSalesInvoiceRows", () => {
  const columnMapping = { "PO Number": "poNumber", "Customer No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan PO Number sama digabung jadi 1 grup", () => {
    const rows = [row("1", { "PO Number": "PO-001", "Customer No": "C1" }), row("2", { "PO Number": "PO-001", "Customer No": "C1" }), row("3", { "PO Number": "PO-002", "Customer No": "C1" })];
    const groups = groupSalesInvoiceRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[1]!.rows.length).toBe(1);
  });

  test("PO Number kosong tetap jadi grup sendiri per baris (behavior lama, non-breaking)", () => {
    const rows = [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C1" })];
    const groups = groupSalesInvoiceRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom PO Number tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "PO Number": "PO-001" }), row("2", { "PO Number": "PO-001" })];
    const mappingTanpaPoNumber = { "Customer No": "customerNo" };
    const groups = groupSalesInvoiceRows(rows, mappingTanpaPoNumber);
    expect(groups.length).toBe(2);
  });

  test("PO Number sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "PO Number": " po-001 " }), row("2", { "PO Number": "PO-001" })];
    const groups = groupSalesInvoiceRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("validateGroupCustomerConsistency", () => {
  const columnMapping = { "Customer No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { poNumber: "PO-001", rows: [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C2" })] };
    const result = validateGroupCustomerConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("PO-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { poNumber: "PO-001", rows: [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { poNumber: null, rows: [row("1", { "Customer No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });
});

describe("extractCustomerCreateFields", () => {
  test("field opsional dipetakan ke path Accurate yang benar", () => {
    const rawRow = {
      "Nama Customer": "PT Pembeli Jaya",
      "Kategori Customer": "Umum",
      "Telepon Bisnis": "0211234567",
      Handphone: "081234567890",
      "Email Customer": "test@example.com",
      "Alamat Customer": "Jl. Contoh No. 1",
      "Negara Customer": "Indonesia",
      "Akun Piutang": "110500",
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
      name: "PT Pembeli Jaya",
      categoryName: "Umum",
      workPhone: "0211234567",
      mobilePhone: "081234567890",
      email: "test@example.com",
      billStreet: "Jl. Contoh No. 1",
      billCountry: "Indonesia",
      customerReceivableAccountListNo: "110500",
    });
  });

  test("tidak ada kolom di-mapping -> object kosong (semua field ini opsional)", () => {
    expect(extractCustomerCreateFields({}, {})).toEqual({});
  });
});

describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildSalesInvoicePayload (regresi refactor)", () => {
    const rawRow = {
      "Customer No": "C.00001",
      Tanggal: "2026-08-19",
      "Kode Barang": "9900012",
      Harga: 10000,
      Qty: 5,
    };
    const columnMapping = {
      "Customer No": "customerNo",
      Tanggal: "transDate",
      "Kode Barang": "itemNo",
      Harga: "unitPrice",
      Qty: "quantity",
    };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Customer No": "C.00001", "Kode Barang": "BRG-1" };
    const columnMapping = { "Customer No": "customerNo", "Kode Barang": "itemNo" };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });
});

describe("poNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke poNumber", () => {
    expect(poNumberColumnOf({ "PO Number": "poNumber", "Customer No": "customerNo" })).toBe("PO Number");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke poNumber", () => {
    expect(poNumberColumnOf({ "Customer No": "customerNo" })).toBeNull();
  });
});

describe("extractItemCreateFields", () => {
  test("name+unit1Name diambil dari field itemName/itemUnitName yang sudah ada di mapping SI", () => {
    const rawRow = { "Item Name": "Meja Kantor", "Item Unit Name": "Unit", "Kategori Barang": "Umum" };
    const columnMapping = {
      "Item Name": "itemName",
      "Item Unit Name": "itemUnitName",
      "Kategori Barang": "itemCategoryName",
    };

    const payload = extractItemCreateFields(rawRow, columnMapping);

    expect(payload).toEqual({ name: "Meja Kantor", unit1Name: "Unit", itemCategoryName: "Umum" });
  });
});
