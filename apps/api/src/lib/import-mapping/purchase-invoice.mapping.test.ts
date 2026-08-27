import { describe, test, expect } from "bun:test";
import {
  buildPurchaseInvoicePayload,
  extractVendorCreateFields,
  extractItemCreateFields,
  groupPurchaseInvoiceRows,
  validateGroupVendorConsistency,
  type ImportRowRecord,
} from "./purchase-invoice.mapping";

// § Fase 06, ADR-0011 — buildPurchaseInvoicePayload() sekarang terima
// ARRAY baris (1 grup = 1 faktur), bukan 1 baris tunggal lagi. Test di
// bawah (asalnya Fase 02) disesuaikan ke signature baru — dibungkus
// `[rawRow]` — tapi INTENT tiap test (normalisasi tanggal, exclude kolom
// kosong/tidak dikenal) TIDAK berubah sama sekali.
describe("buildPurchaseInvoicePayload", () => {
  test("field header masuk ke root payload, field item masuk ke detailItem[0]", () => {
    const rawRow = {
      "Vendor No": "V.00001",
      Tanggal: "2026-08-19",
      "Kode Barang": "9900012",
      Harga: 10000,
      Qty: 5,
    };
    const columnMapping = {
      "Vendor No": "vendorNo",
      Tanggal: "transDate",
      "Kode Barang": "itemNo",
      Harga: "unitPrice",
      Qty: "quantity",
    };

    const payload = buildPurchaseInvoicePayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.transDate).toBe("19/08/2026"); // dinormalisasi dari ISO ke format Accurate DD/MM/YYYY
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Vendor No": "V.00001", Note: "" };
    const columnMapping = { "Vendor No": "vendorNo", Note: "description" };

    const payload = buildPurchaseInvoicePayload([rawRow], columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY (format yang diterima Accurate)", () => {
    const payload = buildPurchaseInvoicePayload(
      [{ "Vendor No": "V.001", Tanggal: "2026-08-19" }],
      { "Vendor No": "vendorNo", Tanggal: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal yang sudah DD/MM/YYYY dibiarkan apa adanya", () => {
    const payload = buildPurchaseInvoicePayload(
      [{ "Vendor No": "V.001", Tanggal: "19/08/2026" }],
      { "Vendor No": "vendorNo", Tanggal: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    // 46253 = 19 Agustus 2026 (basis epoch Excel 30 Des 1899)
    const payload = buildPurchaseInvoicePayload(
      [{ "Vendor No": "V.001", Tanggal: 46253 }],
      { "Vendor No": "vendorNo", Tanggal: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Vendor No": "V.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Vendor No": "vendorNo" };

    const payload = buildPurchaseInvoicePayload([rawRow], columnMapping);

    expect(Object.keys(payload)).toEqual(["vendorNo", "detailItem"]);
  });

  // § Fase 06 — test BARU, perilaku multi-item.
  const groupColumnMapping = {
    Tanggal: "transDate",
    "Bill No": "billNumber",
    "Vendor No": "vendorNo",
    "Item No": "itemNo",
    "Unit Price": "unitPrice",
    "Item Qty": "quantity",
  };

  test("2 baris jadi 1 payload dengan detailItem 2 elemen, header dari baris pertama", () => {
    const rawRows = [
      { Tanggal: "19/08/2026", "Vendor No": "V1", "Item No": "BRG-1", "Unit Price": 1000, "Item Qty": 2 },
      { Tanggal: "20/08/2026", "Vendor No": "V1-BEDA", "Item No": "BRG-2", "Unit Price": 2000, "Item Qty": 3 },
    ];
    const payload = buildPurchaseInvoicePayload(rawRows, groupColumnMapping);
    expect(payload.transDate).toBe("19/08/2026"); // dari baris pertama, baris kedua diabaikan
    expect(payload.vendorNo).toBe("V1"); // dari baris pertama
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem.length).toBe(2);
    expect(detailItem[0]!.itemNo).toBe("BRG-1");
    expect(detailItem[1]!.itemNo).toBe("BRG-2");
  });
});

// § Fase 06, ADR-0011 — grouping baris Excel jadi 1 Faktur Pembelian
// berdasarkan kolom "Bill No".
describe("groupPurchaseInvoiceRows", () => {
  const columnMapping = { "Bill No": "billNumber", "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("baris dengan Bill No sama digabung jadi 1 grup", () => {
    const rows = [
      row("1", { "Bill No": "INV-001", "Vendor No": "V1" }),
      row("2", { "Bill No": "INV-001", "Vendor No": "V1" }),
      row("3", { "Bill No": "INV-002", "Vendor No": "V1" }),
    ];
    const groups = groupPurchaseInvoiceRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[1]!.rows.length).toBe(1);
  });

  test("Bill No kosong tetap jadi grup sendiri per baris (behavior lama, non-breaking)", () => {
    const rows = [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })];
    const groups = groupPurchaseInvoiceRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom Bill No tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "Bill No": "INV-001" }), row("2", { "Bill No": "INV-001" })];
    const mappingTanpaBillNo = { "Vendor No": "vendorNo" };
    const groups = groupPurchaseInvoiceRows(rows, mappingTanpaBillNo);
    expect(groups.length).toBe(2);
  });

  test("Bill No sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "Bill No": " inv-001 " }), row("2", { "Bill No": "INV-001" })];
    const groups = groupPurchaseInvoiceRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("validateGroupVendorConsistency", () => {
  const columnMapping = { "Vendor No": "vendorNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("vendorNo beda dalam 1 grup -> return pesan error", () => {
    const group = {
      billNumber: "INV-001",
      rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V2" })],
    };
    const result = validateGroupVendorConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("INV-001");
  });

  test("vendorNo sama dalam 1 grup -> return null", () => {
    const group = {
      billNumber: "INV-001",
      rows: [row("1", { "Vendor No": "V1" }), row("2", { "Vendor No": "V1" })],
    };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { billNumber: null, rows: [row("1", { "Vendor No": "V1" })] };
    expect(validateGroupVendorConsistency(group, columnMapping)).toBeNull();
  });
});

// § phase-05-purchase-invoice-auto-create.md — TIDAK diubah Fase 06,
// extractVendorCreateFields tetap terima 1 baris (vendor dicari/dibuat
// SEKALI per grup dari baris pertama, lihat processPurchaseInvoiceGroup
// di workers/index.ts).
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
    expect(payload).not.toHaveProperty("vendorWhatsapp"); // bukan key literal, ditangani khusus
  });

  test("tidak ada kolom di-mapping -> object kosong (semua field ini opsional)", () => {
    expect(extractVendorCreateFields({}, {})).toEqual({});
  });
});

describe("extractItemCreateFields", () => {
  test("name+unit1Name diambil dari field itemName/itemUnitName yang sudah ada di mapping PI", () => {
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
