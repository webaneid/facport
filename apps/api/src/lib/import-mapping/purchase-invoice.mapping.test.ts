import { describe, test, expect } from "bun:test";
import { buildPurchaseInvoicePayload, extractVendorCreateFields, extractItemCreateFields } from "./purchase-invoice.mapping";

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

    const payload = buildPurchaseInvoicePayload(rawRow, columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.transDate).toBe("19/08/2026"); // dinormalisasi dari ISO ke format Accurate DD/MM/YYYY
    expect(payload.detailItem).toEqual([{ itemNo: "9900012", unitPrice: 10000, quantity: 5 }]);
  });

  test("kolom Excel yang kosong ('') TIDAK ikut masuk payload", () => {
    const rawRow = { "Vendor No": "V.00001", Note: "" };
    const columnMapping = { "Vendor No": "vendorNo", Note: "description" };

    const payload = buildPurchaseInvoicePayload(rawRow, columnMapping);

    expect(payload.vendorNo).toBe("V.00001");
    expect(payload.description).toBeUndefined();
  });

  test("tanggal ISO (2026-08-19) dinormalisasi ke DD/MM/YYYY (format yang diterima Accurate)", () => {
    const payload = buildPurchaseInvoicePayload(
      { "Vendor No": "V.001", Tanggal: "2026-08-19" },
      { "Vendor No": "vendorNo", Tanggal: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal yang sudah DD/MM/YYYY dibiarkan apa adanya", () => {
    const payload = buildPurchaseInvoicePayload(
      { "Vendor No": "V.001", Tanggal: "19/08/2026" },
      { "Vendor No": "vendorNo", Tanggal: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("tanggal Excel serial number dinormalisasi ke DD/MM/YYYY", () => {
    // 46253 = 19 Agustus 2026 (basis epoch Excel 30 Des 1899)
    const payload = buildPurchaseInvoicePayload(
      { "Vendor No": "V.001", Tanggal: 46253 },
      { "Vendor No": "vendorNo", Tanggal: "transDate" },
    );
    expect(payload.transDate).toBe("19/08/2026");
  });

  test("kolom Excel yang tidak ada di columnMapping diabaikan", () => {
    const rawRow = { "Vendor No": "V.00001", "Kolom Tidak Dikenal": "xxx" };
    const columnMapping = { "Vendor No": "vendorNo" };

    const payload = buildPurchaseInvoicePayload(rawRow, columnMapping);

    expect(Object.keys(payload)).toEqual(["vendorNo", "detailItem"]);
  });
});

// § phase-05-purchase-invoice-auto-create.md
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
