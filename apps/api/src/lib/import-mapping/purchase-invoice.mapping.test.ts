import { describe, test, expect } from "bun:test";
import {
  buildPurchaseInvoicePayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  billNumberColumnOf,
  extractVendorCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  purchaseInvoiceMapping,
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

// § Fase 08, ADR-0012 — `buildDetailItemFromRow` diextract dari
// `buildPurchaseInvoicePayload` (dipakai ulang jalur update faktur
// existing di workers/index.ts) — test regresi memastikan hasilnya SAMA
// dengan sebelum diextract (bandingkan dengan `detailItem[0]` hasil
// `buildPurchaseInvoicePayload` pada test paling atas file ini).
describe("buildDetailItemFromRow", () => {
  test("hasil sama persis dengan detailItem[0] dari buildPurchaseInvoicePayload (regresi refactor)", () => {
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

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "9900012", unitPrice: 10000, quantity: 5 });
  });

  test("field header (bukan prefix detailItem.) TIDAK ikut masuk", () => {
    const rawRow = { "Vendor No": "V.00001", "Kode Barang": "BRG-1" };
    const columnMapping = { "Vendor No": "vendorNo", "Kode Barang": "itemNo" };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({ itemNo: "BRG-1" });
  });
});

// § Fase 08, ADR-0012 — diexport supaya worker bisa cari kolom Bill No
// lintas-batch (`findExistingAccurateInvoiceId`).
describe("billNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke billNumber", () => {
    expect(billNumberColumnOf({ "Bill No": "billNumber", "Vendor No": "vendorNo" })).toBe("Bill No");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke billNumber", () => {
    expect(billNumberColumnOf({ "Vendor No": "vendorNo" })).toBeNull();
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

// § Fase 66 — mirror fix `sales-invoice.mapping.ts` (bug sama persis,
// modul ini shared builder pattern). Feedback client (via Sales
// Invoice): isi kolom diskon & pajak -> gagal "Faktur Penjualan tidak
// tepat" (pesan generik Accurate), hapus -> berhasil. Root cause: field
// boolean (Taxable, PPN/PPnBM/PPh23, dst) WAJIB JSON `boolean` murni di
// Accurate, tapi template minta teks "TRUE"/"FALSE" — SheetJS baca
// sebagai STRING. `cashDiscPercent`/`itemDiscPercent` WAJIB `string`
// (bukan number).
describe("konversi tipe data (Fase 66) — boolean & percent discount", () => {
  test("field boolean (taxable, useTax1-3) — teks 'TRUE'/'Y'/'1' jadi JSON boolean true, bukan string", () => {
    const rawRow = { "Kode Barang": "BRG-1", Taxable: "TRUE", PPN: "Y", PPnBM: "1", PPH: "FALSE" };
    const columnMapping = { "Kode Barang": "itemNo", Taxable: "taxable", PPN: "useTax1", PPnBM: "useTax2", PPH: "useTax3" };

    const header = buildPurchaseInvoicePayload([rawRow], columnMapping);
    expect(header.taxable).toBe(true);

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.useTax1).toBe(true);
    expect(detail.useTax2).toBe(true);
    expect(detail.useTax3).toBe(false);
  });

  test("cashDiscPercent/itemDiscPercent — angka polos dari Excel dikonversi ke STRING, bukan number", () => {
    const rawRow = { "Kode Barang": "BRG-1", "Cash Disc (%)": 5, "Item Disc (%)": 10 };
    const columnMapping = { "Kode Barang": "itemNo", "Cash Disc (%)": "cashDiscPercent", "Item Disc (%)": "itemDiscPercent" };

    const header = buildPurchaseInvoicePayload([rawRow], columnMapping);
    expect(header.cashDiscPercent).toBe("5");
    expect(typeof header.cashDiscPercent).toBe("string");

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.itemDiscPercent).toBe("10");
    expect(typeof detail.itemDiscPercent).toBe("string");
  });
});

// § Fase 75 (2026-09-09) — mirror LENGKAP dari Sales Invoice (Fase
// 55/61/64/68/73/74): Kategori Keuangan level ITEM, Atribut Tambahan
// level FAKTUR & ITEM (charField/numericField/dateField), dan level
// EXPENSE (Kategori Keuangan + field dasar Beban).
describe("Atribut Tambahan & Kategori Keuangan — Fase 75", () => {
  test("Kategori Keuangan level ITEM (dataClassificationNName) masuk ke detailItem", () => {
    const rawRow = { "Kode Barang": "BRG-1", "Kategori Keuangan 1": "KATKEG 1" };
    const columnMapping = { "Kode Barang": "itemNo", "Kategori Keuangan 1": "attribut1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dataClassification1Name).toBe("KATKEG 1");
  });

  test("Atribut Tambahan level FAKTUR (charField/numericField/dateField) masuk ke ROOT payload, BUKAN detailItem", () => {
    const rawRows = [
      {
        "Vendor No": "V-1",
        "Kode Barang": "BRG-1",
        "CUSTOM CHARACTER 1": "Proyek A",
        "CUSTOM NUMBER 1": "100",
        "CUSTOM DATE 1": "20/08/2026",
      },
    ];
    const columnMapping = {
      "Vendor No": "vendorNo",
      "Kode Barang": "itemNo",
      "CUSTOM CHARACTER 1": "attributHeaderKarakter1",
      "CUSTOM NUMBER 1": "attributHeaderAngka1",
      "CUSTOM DATE 1": "attributHeaderTanggal1",
    };
    const payload = buildPurchaseInvoicePayload(rawRows, columnMapping);
    expect(payload.charField1).toBe("Proyek A");
    expect(payload.numericField1).toBe("100");
    expect(payload.dateField1).toBe("20/08/2026");
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBeUndefined();
  });

  test("Atribut Tambahan level ITEM (charField 15 slot/numericField/dateField) masuk ke detailItem, BUKAN root, BUKAN dataClassification", () => {
    const rawRow = {
      "Kode Barang": "BRG-1",
      "ITEM: CUSTOM CHARACTER 1": "Karakter Item 1",
      "ITEM: CUSTOM CHARACTER 15": "Slot Terakhir",
      "ITEM: CUSTOM NUMBER 1": "500",
      "ITEM: CUSTOM DATE 1": "21/08/2026",
    };
    const columnMapping = {
      "Kode Barang": "itemNo",
      "ITEM: CUSTOM CHARACTER 1": "attributItemKarakter1",
      "ITEM: CUSTOM CHARACTER 15": "attributItemKarakter15",
      "ITEM: CUSTOM NUMBER 1": "attributItemAngka1",
      "ITEM: CUSTOM DATE 1": "attributItemTanggal1",
    };
    const payload = buildPurchaseInvoicePayload([rawRow], columnMapping);
    expect(payload.charField1).toBeUndefined();
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBe("Karakter Item 1");
    expect(detail.charField15).toBe("Slot Terakhir");
    expect(detail.numericField1).toBe("500");
    expect(detail.dateField1).toBe("21/08/2026");
    expect(detail.dataClassification1Name).toBeUndefined();
  });

  test("defaultColumnMap — kolom Atribut Tambahan/Kategori Keuangan lengkap & posisi terpisah antar level", () => {
    for (let i = 1; i <= 10; i++) {
      expect(purchaseInvoiceMapping.defaultColumnMap[`CUSTOM CHARACTER ${i}`]).toBe(`attributHeaderKarakter${i}`);
      expect(purchaseInvoiceMapping.defaultColumnMap[`Kategori Keuangan ${i}`]).toBe(`attribut${i}`);
    }
    for (let i = 1; i <= 15; i++) {
      expect(purchaseInvoiceMapping.defaultColumnMap[`ITEM: CUSTOM CHARACTER ${i}`]).toBe(`attributItemKarakter${i}`);
    }
    expect(purchaseInvoiceMapping.defaultColumnMap["CUSTOM DATE 1"]).toBe("attributHeaderTanggal1");
    expect(purchaseInvoiceMapping.defaultColumnMap["ITEM: CUSTOM DATE 1"]).toBe("attributItemTanggal1");
  });
});

describe("buildDetailExpenseFromRow — Fase 75", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk dengan field lain ikut", () => {
    const rawRow = {
      "Akun Beban": "6-10100",
      "Nama Beban": "Ongkos Kirim",
      "Jumlah Beban": 50000,
      "Catatan Beban": "Kirim dari Surabaya",
      "Beban - Department": "Logistik",
    };
    const columnMapping = {
      "Akun Beban": "expenseAccountNo",
      "Nama Beban": "expenseName",
      "Jumlah Beban": "expenseAmount",
      "Catatan Beban": "expenseNotes",
      "Beban - Department": "expenseDepartmentName",
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
    expect(buildDetailExpenseFromRow({ "Akun Beban": "6-10100" }, { "Akun Beban": "expenseAccountNo" })).toBeNull();
    expect(buildDetailExpenseFromRow({ "Jumlah Beban": 50000 }, { "Jumlah Beban": "expenseAmount" })).toBeNull();
  });

  test("Kategori Keuangan Beban (dataClassificationNName) ikut masuk ke detailExpense", () => {
    const rawRow = { "Akun Beban": "6-10100", "Jumlah Beban": 50000, "Kategori Keuangan Beban 1": "KATKEG BEBAN 1" };
    const columnMapping = { "Akun Beban": "expenseAccountNo", "Jumlah Beban": "expenseAmount", "Kategori Keuangan Beban 1": "expenseKategoriKeuangan1" };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense?.dataClassification1Name).toBe("KATKEG BEBAN 1");
  });
});

describe("buildPurchaseInvoicePayload — detailExpense (Fase 75)", () => {
  test("baris dengan data Beban -> payload.detailExpense terisi, TIDAK masuk root ATAU detailItem", () => {
    const rawRows = [{ "Vendor No": "V-1", "Kode Barang": "BRG-1", "Akun Beban": "6-10100", "Jumlah Beban": 50000 }];
    const columnMapping = { "Vendor No": "vendorNo", "Kode Barang": "itemNo", "Akun Beban": "expenseAccountNo", "Jumlah Beban": "expenseAmount" };
    const payload = buildPurchaseInvoicePayload(rawRows, columnMapping);
    expect(payload.accountNo).toBeUndefined();
    expect(payload.detailExpense).toEqual([{ accountNo: "6-10100", expenseAmount: 50000 }]);
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.accountNo).toBeUndefined();
  });

  test("TIDAK ada baris yang punya data Beban -> payload.detailExpense TIDAK disertakan sama sekali", () => {
    const rawRows = [{ "Vendor No": "V-1", "Kode Barang": "BRG-1" }];
    const columnMapping = { "Vendor No": "vendorNo", "Kode Barang": "itemNo" };
    const payload = buildPurchaseInvoicePayload(rawRows, columnMapping);
    expect(payload.detailExpense).toBeUndefined();
  });
});

describe("extractDataClassificationValues & extractExpenseDataClassificationValues — Fase 75", () => {
  test("ambil index+name dari kolom attribut1-10/expenseKategoriKeuanganN yang terisi, skip yang kosong", () => {
    const rawRow = { "KK 1": "KATKEG 1", "KK Beban 1": "KATKEG BEBAN 1" };
    const columnMapping = { "KK 1": "attribut1", "KK Beban 1": "expenseKategoriKeuangan1" };
    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG 1" }]);
    expect(extractExpenseDataClassificationValues(rawRow, columnMapping)).toEqual([{ index: 1, name: "KATKEG BEBAN 1" }]);
  });
});
