import { describe, test, expect } from "bun:test";
import {
  salesInvoiceMapping,
  buildSalesInvoicePayload,
  buildDetailItemFromRow,
  buildDetailExpenseFromRow,
  poNumberColumnOf,
  extractCustomerCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
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

  // § Fase 49 — audit data ASLI kompetitor (`docs/referencehtml`) menemukan
  // PO Number SELALU KOSONG di praktik, padahal 52% faktur multi-item —
  // "Trans No" (`number`) yang justru selalu terisi & konsisten per faktur.
  describe("Fase 49 — prioritas Trans No", () => {
    const mappingDenganKeduanya = { "Trans No": "number", "PO Number": "poNumber", "Customer No": "customerNo" };

    test("Trans No terisi, PO Number kosong (persis kasus data kompetitor) -> tetap tergabung 1 faktur", () => {
      const rows = [
        row("1", { "Trans No": "SI.2026.01.00004", "Customer No": "C1" }),
        row("2", { "Trans No": "SI.2026.01.00004", "Customer No": "C1" }),
        row("3", { "Trans No": "SI.2026.01.00002", "Customer No": "C1" }),
      ];
      const groups = groupSalesInvoiceRows(rows, mappingDenganKeduanya);
      expect(groups.length).toBe(2);
      expect(groups[0]!.rows.length).toBe(2);
      expect(groups[0]!.groupKey).toBe("SI.2026.01.00004");
      expect(groups[0]!.groupColumn).toBe("Trans No");
    });

    test("Trans No DAN PO Number sama-sama terisi -> Trans No yang dipakai", () => {
      const rows = [
        row("1", { "Trans No": "SI-001", "PO Number": "PO-999" }),
        row("2", { "Trans No": "SI-001", "PO Number": "PO-999" }),
      ];
      const groups = groupSalesInvoiceRows(rows, mappingDenganKeduanya);
      expect(groups.length).toBe(1);
      expect(groups[0]!.groupColumn).toBe("Trans No");
    });

    test("Trans No kosong tapi PO Number terisi -> fallback ke PO Number (behavior lama)", () => {
      const rows = [row("1", { "PO Number": "PO-001" }), row("2", { "PO Number": "PO-001" })];
      const groups = groupSalesInvoiceRows(rows, mappingDenganKeduanya);
      expect(groups.length).toBe(1);
      expect(groups[0]!.groupColumn).toBe("PO Number");
    });

    test("keduanya kosong -> tetap 1 baris = 1 faktur sendiri", () => {
      const rows = [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C1" })];
      const groups = groupSalesInvoiceRows(rows, mappingDenganKeduanya);
      expect(groups.length).toBe(2);
    });
  });
});

describe("validateGroupCustomerConsistency", () => {
  const columnMapping = { "Customer No": "customerNo" };

  function row(id: string, data: Record<string, unknown>): ImportRowRecord {
    return { id, rawData: data };
  }

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { groupKey: "PO-001", groupColumn: "PO Number", rows: [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C2" })] };
    const result = validateGroupCustomerConsistency(group, columnMapping);
    expect(result).not.toBeNull();
    expect(result).toContain("PO-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { groupKey: "PO-001", groupColumn: "PO Number", rows: [row("1", { "Customer No": "C1" }), row("2", { "Customer No": "C1" })] };
    expect(validateGroupCustomerConsistency(group, columnMapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { groupKey: null, groupColumn: null, rows: [row("1", { "Customer No": "C1" })] };
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

  // § Fase 55 — "Atribut Tambahan" Accurate (Data Classification),
  // diminta client, § architecture-sales-invoice.md.
  test("Fase 55 — kolom Atribut Tambahan (Karakter 1-10) ter-map ke dataClassificationNName", () => {
    const rawRow = {
      "Kode Barang": "BRG-1",
      "Karakter 1": "SPK-2026-001",
      "Karakter 10": "Batch A",
    };
    const columnMapping = {
      "Kode Barang": "itemNo",
      "Karakter 1": "attribut1",
      "Karakter 10": "attribut10",
    };

    expect(buildDetailItemFromRow(rawRow, columnMapping)).toEqual({
      itemNo: "BRG-1",
      dataClassification1Name: "SPK-2026-001",
      dataClassification10Name: "Batch A",
    });
  });

  // § Fase 55/61 diperbarui 2026-09-08 setelah file Excel ASLI client
  // diterima — nama kolom "ITEM:CUSTOM CHARACTER 1..10" SEMPAT dipetakan
  // ke attribut1-10 di sini. § Fase 69 SEMPAT ganti jadi "Kategori
  // Keuangan N" (dikira sinonim). § Fase 71 DIKOREKSI: sinonim itu
  // dihapus, sempat dianggap field-nya tidak ada sama sekali. § Fase 73
  // (2026-09-09) FINAL: "ITEM: CUSTOM CHARACTER N" (dengan spasi, nama
  // ASLI client) sekarang terpetakan ke field yang BENAR
  // (`attributItemKarakter1-15`, § charField level ITEM) — BUKAN
  // attribut1-10/Kategori Keuangan (dataClassificationNName), 2 field
  // API yang benar-benar berbeda.
  test("defaultColumnMap Atribut Tambahan pakai 'Kategori Keuangan N' (istilah resmi Accurate) untuk attribut1-10", () => {
    for (let i = 1; i <= 10; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`Kategori Keuangan ${i}`]).toBe(`attribut${i}`);
    }
    // slot 11 SENGAJA TIDAK ada — tidak ada padanan API Accurate-nya
    // untuk Kategori Keuangan (dataClassificationNName MAX 10 slot).
    expect(salesInvoiceMapping.defaultColumnMap["Kategori Keuangan 11"]).toBeUndefined();
    expect(salesInvoiceMapping.defaultColumnMap["Karakter 1"]).toBeUndefined();
    // § Fase 73 — "ITEM: CUSTOM CHARACTER 1" (dengan spasi) sekarang
    // field YANG BENAR (attributItemKarakter1, charField level ITEM) —
    // BUKAN attribut1/Kategori Keuangan.
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: CUSTOM CHARACTER 1"]).toBe("attributItemKarakter1");
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: CUSTOM CHARACTER 1"]).not.toBe("attribut1");
    // sinonim TANPA spasi ("ITEM:CUSTOM CHARACTER 1") SENGAJA TIDAK ada
    // — nama kolom asli client SELALU pakai spasi setelah titik dua.
    expect(salesInvoiceMapping.defaultColumnMap["ITEM:CUSTOM CHARACTER 1"]).toBeUndefined();
  });

  // § Fase 70 (2026-09-08) — client minta judul kolom "PO Number" ->
  // "Bill No" (konsisten dengan istilah Purchase Invoice).
  // § Fase 77 (2026-09-09) — DIKEMBALIKAN ke "PO No" jadi sinonim utama
  // (client minta singkron nama field ASLI Accurate `poNumber`). "Bill
  // No" dan "PO Number" TETAP dipertahankan sebagai sinonim lama.
  test("defaultColumnMap punya 'PO No' sebagai sinonim utama untuk poNumber, 'Bill No' & 'PO Number' TETAP ada", () => {
    expect(salesInvoiceMapping.defaultColumnMap["PO No"]).toBe("poNumber");
    expect(salesInvoiceMapping.defaultColumnMap["Bill No"]).toBe("poNumber");
    expect(salesInvoiceMapping.defaultColumnMap["PO Number"]).toBe("poNumber");
  });

  // § Fase 64 — Atribut Tambahan LEVEL HEADER (charField/numericField/
  // dateField), ditemukan dari email resmi Accurate Support (tiket
  // #357901) — field ini TIDAK ADA di accurate-openapi.json (spec tidak
  // lengkap), BEDA dari attribut1-10 (Fase 55) yang level ITEM.
  test("Fase 64 — Atribut Tambahan level HEADER (charField/numericField/dateField) masuk ke ROOT payload, BUKAN detailItem", () => {
    const rawRows = [
      {
        "Customer No": "C-1",
        Tanggal: "19/08/2026",
        "CUSTOM CHARACTER 1": "Proyek A",
        "CUSTOM NUMBER 1": "100",
        "CUSTOM DATE 1": "20/08/2026",
        "Kode Barang": "BRG-1",
      },
    ];
    const columnMapping = {
      "Customer No": "customerNo",
      Tanggal: "transDate",
      "CUSTOM CHARACTER 1": "attributHeaderKarakter1",
      "CUSTOM NUMBER 1": "attributHeaderAngka1",
      "CUSTOM DATE 1": "attributHeaderTanggal1",
      "Kode Barang": "itemNo",
    };

    const payload = buildSalesInvoicePayload(rawRows, columnMapping);
    expect(payload.charField1).toBe("Proyek A");
    expect(payload.numericField1).toBe("100");
    expect(payload.dateField1).toBe("20/08/2026");
    // TIDAK ikut ke detailItem
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBeUndefined();
    expect(detail.dataClassification1Name).toBeUndefined();
  });

  test("Fase 64 — defaultColumnMap level HEADER (tanpa prefix ITEM:) BEDA dari level item (Kategori Keuangan)", () => {
    expect(salesInvoiceMapping.defaultColumnMap["CUSTOM CHARACTER 1"]).toBe("attributHeaderKarakter1");
    expect(salesInvoiceMapping.defaultColumnMap["Kategori Keuangan 1"]).toBe("attribut1");
    for (let i = 1; i <= 10; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`CUSTOM NUMBER ${i}`]).toBe(`attributHeaderAngka${i}`);
    }
    expect(salesInvoiceMapping.defaultColumnMap["CUSTOM DATE 1"]).toBe("attributHeaderTanggal1");
    expect(salesInvoiceMapping.defaultColumnMap["CUSTOM DATE 2"]).toBe("attributHeaderTanggal2");
  });

  // § Fase 73 (2026-09-09) — Atribut Tambahan LEVEL ITEM
  // (charField/numericField/dateField NESTED di detailItem), dikonfirmasi
  // RESMI Accurate Support khusus untuk "detail item di transaksi Sales
  // Invoice": 15 slot Karakter (BUKAN 10), 10 slot Angka, 2 slot
  // Tanggal. BEDA dari attributHeader* (Fase 64, level FAKTUR/root) DAN
  // dari attribut1-10/Kategori Keuangan (Fase 55, field dataClassificationNName
  // yang berbeda) — 3 mekanisme yang benar-benar berbeda, walau
  // sama-sama "nempel di baris barang" untuk 2 yang terakhir.
  test("Fase 73 — Atribut Tambahan level ITEM (charField/numericField/dateField) masuk ke detailItem, BUKAN root, BUKAN dataClassification", () => {
    const rawRows = [
      {
        "Customer No": "C-1",
        Tanggal: "19/08/2026",
        "Kode Barang": "BRG-1",
        "ITEM: CUSTOM CHARACTER 1": "HWGRIO-2",
        "ITEM: CUSTOM CHARACTER 15": "Slot Terakhir",
        "ITEM: CUSTOM NUMBER 1": "500",
        "ITEM: CUSTOM DATE 1": "21/08/2026",
      },
    ];
    const columnMapping = {
      "Customer No": "customerNo",
      Tanggal: "transDate",
      "Kode Barang": "itemNo",
      "ITEM: CUSTOM CHARACTER 1": "attributItemKarakter1",
      "ITEM: CUSTOM CHARACTER 15": "attributItemKarakter15",
      "ITEM: CUSTOM NUMBER 1": "attributItemAngka1",
      "ITEM: CUSTOM DATE 1": "attributItemTanggal1",
    };

    const payload = buildSalesInvoicePayload(rawRows, columnMapping);
    // TIDAK masuk root
    expect(payload.charField1).toBeUndefined();
    expect(payload.numericField1).toBeUndefined();
    expect(payload.dateField1).toBeUndefined();

    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.charField1).toBe("HWGRIO-2");
    expect(detail.charField15).toBe("Slot Terakhir");
    expect(detail.numericField1).toBe("500");
    expect(detail.dateField1).toBe("21/08/2026");
    // BUKAN dataClassificationNName (Kategori Keuangan) — field BEDA
    expect(detail.dataClassification1Name).toBeUndefined();
  });

  test("Fase 73 — defaultColumnMap 'ITEM: CUSTOM CHARACTER/NUMBER/DATE' terpetakan ke attributItemKarakter/Angka/Tanggal, BEDA dari Kategori Keuangan", () => {
    for (let i = 1; i <= 15; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`ITEM: CUSTOM CHARACTER ${i}`]).toBe(`attributItemKarakter${i}`);
    }
    for (let i = 1; i <= 10; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`ITEM: CUSTOM NUMBER ${i}`]).toBe(`attributItemAngka${i}`);
    }
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: CUSTOM DATE 1"]).toBe("attributItemTanggal1");
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: CUSTOM DATE 2"]).toBe("attributItemTanggal2");
    // beda field dari Kategori Keuangan (dataClassificationNName)
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: CUSTOM CHARACTER 1"]).not.toBe(salesInvoiceMapping.defaultColumnMap["Kategori Keuangan 1"]);
  });

  test("Fase 73 — attributItemTanggal1/2 dikonversi ke format tanggal Accurate (DD/MM/YYYY)", () => {
    const rawRow = { "Kode Barang": "BRG-1", "ITEM: CUSTOM DATE 1": "2026-08-21" };
    const columnMapping = { "Kode Barang": "itemNo", "ITEM: CUSTOM DATE 1": "attributItemTanggal1" };
    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.dateField1).toBe("21/08/2026");
  });
});

// § disamakan 2026-09-08 dengan sheet "Penjelasan Kolom" di Excel resmi
// client — "Trans No" WAJIB (dipakai juga sebagai kunci grouping
// multi-item, § Fase 49), "Item Unit Name" JUSTRU TIDAK WAJIB (beda
// dari asumsi awal implementasi).
describe("requiredFields", () => {
  test("cocok persis aturan WAJIB/TIDAK WAJIB di sheet Penjelasan Kolom Excel client", () => {
    const required: string[] = [...salesInvoiceMapping.requiredFields];
    expect(required.sort()).toEqual(["customerNo", "transDate", "number", "itemNo", "unitPrice", "quantity", "warehouseName"].sort());
    expect(required).not.toContain("itemUnitName");
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

// § Fase 68 — auto-create Kategori Keuangan (`/api/data-classification`):
// Accurate menolak `dataClassificationNName` yang belum ada sebagai master
// data ("Kategori Keuangan X tidak ditemukan atau sudah dihapus"). Worker
// butuh daftar (index,name) yang TERISI di baris ini untuk auto-create
// SEBELUM kirim payload faktur.
describe("extractDataClassificationValues", () => {
  test("ambil index+name dari kolom attribut1-10 yang terisi, skip yang kosong", () => {
    const rawRow = { "Custom 1": "TES 1", "Custom 3": "Proyek A", "Custom 2": "" };
    const columnMapping = { "Custom 1": "attribut1", "Custom 2": "attribut2", "Custom 3": "attribut3" };

    expect(extractDataClassificationValues(rawRow, columnMapping)).toEqual([
      { index: 1, name: "TES 1" },
      { index: 3, name: "Proyek A" },
    ]);
  });

  test("baris tanpa kolom attribut termapping -> array kosong", () => {
    expect(extractDataClassificationValues({ "Kode Barang": "9900012" }, { "Kode Barang": "itemNo" })).toEqual([]);
  });

  test("nilai di-trim sebelum dipakai sebagai name", () => {
    const rawRow = { "Custom 1": "  TES 1  " };
    expect(extractDataClassificationValues(rawRow, { "Custom 1": "attribut1" })).toEqual([{ index: 1, name: "TES 1" }]);
  });
});

// § Fase 65 — bug ditemukan (feedback client): mayoritas defaultColumnMap
// tidak cocok dengan header ASLI template standar Accurate (ALL CAPS,
// mis. "ITEM UNIT PRICE" bukan "Unit Price") — field TETAP bisa
// dipetakan manual tapi TIDAK auto-suggest, klien mengira tidak
// didukung. Sinonim standar Accurate ditambahkan, tebakan lama TETAP
// dipertahankan (harmless).
describe("defaultColumnMap — sinonim header standar Accurate (Fase 65)", () => {
  test("field yang sebelumnya TIDAK match header standar Accurate sekarang punya sinonim yang benar", () => {
    const expected: Record<string, string> = {
      "TRANS DATE": "transDate",
      "PURCHASE ORDER NO": "poNumber",
      DESCRIPTION: "description",
      "PAYMENT TERM NAME": "paymentTermName",
      "REVERSE INVOICE": "reverseInvoice",
      "CASH DISC": "cashDiscount",
      "CASH DISC %": "cashDiscPercent",
      "DOCUMENT TRANSACTION": "documentTransaction",
      "ITEM UNIT PRICE": "unitPrice",
      "ITEM: WAREHOUSE": "warehouseName",
      "ITEM NOTE": "itemNotes",
      "ITEM: CASH DISCOUNT": "itemCashDiscount",
      "ITEM: CASH DISC %": "itemDiscPercent",
      "ITEM: DEPT": "departmentName",
      "ITEM: PROJECT NO": "projectNo",
    };
    for (const [column, field] of Object.entries(expected)) {
      expect(salesInvoiceMapping.defaultColumnMap[column]).toBe(field);
    }
  });

  test("tebakan lama TETAP ada (tidak dihapus, harmless sebagai sinonim tambahan)", () => {
    expect(salesInvoiceMapping.defaultColumnMap["Unit Price"]).toBe("unitPrice");
    expect(salesInvoiceMapping.defaultColumnMap["Note"]).toBe("description");
    expect(salesInvoiceMapping.defaultColumnMap["Item Warehouse"]).toBe("warehouseName");
  });
});

// § Fase 66 — bug ditemukan (feedback client: isi kolom diskon & pajak
// -> gagal "Faktur Penjualan tidak tepat" (pesan generik Accurate),
// hapus kolom itu -> berhasil). Root cause: field boolean (Taxable,
// Inclusive Tax, PPN/PPnBM/PPH, Reverse Inv) WAJIB JSON `boolean` murni
// di Accurate, tapi template minta user ketik teks "TRUE"/"FALSE" —
// SheetJS baca sebagai STRING, terkirim salah tipe. `cashDiscPercent`/
// `itemDiscPercent` WAJIB `string` (bukan number, support diskon
// bertingkat "5 + 2") — kalau user isi angka polos, SheetJS baca
// sebagai number, juga salah tipe.
describe("konversi tipe data (Fase 66) — boolean & percent discount", () => {
  test("field boolean (Taxable dkk) — teks 'TRUE'/'Y'/'1' jadi JSON boolean true, bukan string", () => {
    const rawRow = { "Kode Barang": "BRG-1", Taxable: "TRUE", PPN: "Y", PPnBM: "1", PPH: "FALSE" };
    const columnMapping = { "Kode Barang": "itemNo", Taxable: "taxable", PPN: "useTax1", PPnBM: "useTax2", PPH: "useTax3" };

    const header = buildSalesInvoicePayload([rawRow], columnMapping);
    expect(header.taxable).toBe(true);

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.useTax1).toBe(true); // "Y"
    expect(detail.useTax2).toBe(true); // "1"
    expect(detail.useTax3).toBe(false); // "FALSE"
  });

  test("field boolean sudah berupa JS boolean asli (bukan string) — dibiarkan apa adanya", () => {
    const rawRow = { "Kode Barang": "BRG-1", Taxable: true };
    const columnMapping = { "Kode Barang": "itemNo", Taxable: "taxable" };
    expect(buildSalesInvoicePayload([rawRow], columnMapping).taxable).toBe(true);
  });

  test("cashDiscPercent/itemDiscPercent — angka polos dari Excel dikonversi ke STRING, bukan number", () => {
    const rawRow = { "Kode Barang": "BRG-1", "Cash Disc (%)": 5, "Item Disc (%)": 10 };
    const columnMapping = { "Kode Barang": "itemNo", "Cash Disc (%)": "cashDiscPercent", "Item Disc (%)": "itemDiscPercent" };

    const header = buildSalesInvoicePayload([rawRow], columnMapping);
    expect(header.cashDiscPercent).toBe("5");
    expect(typeof header.cashDiscPercent).toBe("string");

    const detail = buildDetailItemFromRow(rawRow, columnMapping);
    expect(detail.itemDiscPercent).toBe("10");
    expect(typeof detail.itemDiscPercent).toBe("string");
  });

  test("cashDiscount/itemCashDiscount (nilai fix, BUKAN persen) TETAP number, tidak ikut dikonversi ke string", () => {
    const rawRow = { "Kode Barang": "BRG-1", "Cash Discount": 2500 };
    const columnMapping = { "Kode Barang": "itemNo", "Cash Discount": "cashDiscount" };
    const header = buildSalesInvoicePayload([rawRow], columnMapping);
    expect(header.cashDiscount).toBe(2500);
    expect(typeof header.cashDiscount).toBe("number");
  });
});

// § Fase 74 (2026-09-09) — level EXPENSE (baris Beban, `detailExpense[]`
// di payload, ARRAY TERPISAH dari `detailItem[]`). Field API dikonfirmasi
// dari spec resmi (`detailExpense.items.properties`): accountNo,
// expenseName, expenseAmount, expenseNotes, departmentName,
// dataClassification1-10Name (SAMA field dengan Kategori Keuangan level
// Item, § Fase 68 — cuma nempel di array berbeda).
describe("buildDetailExpenseFromRow — Fase 74", () => {
  test("accountNo + expenseAmount terisi -> detailExpense terbentuk dengan field lain ikut", () => {
    const rawRow = {
      "Akun Beban": "6-10100",
      "Nama Beban": "Ongkos Kirim",
      "Jumlah Beban": 50000,
      "Catatan Beban": "Kirim ke Jakarta",
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
      expenseNotes: "Kirim ke Jakarta",
      departmentName: "Logistik",
    });
  });

  test("accountNo TANPA expenseAmount (atau sebaliknya) -> null, baris dianggap TIDAK punya data Beban", () => {
    expect(buildDetailExpenseFromRow({ "Akun Beban": "6-10100" }, { "Akun Beban": "expenseAccountNo" })).toBeNull();
    expect(buildDetailExpenseFromRow({ "Jumlah Beban": 50000 }, { "Jumlah Beban": "expenseAmount" })).toBeNull();
  });

  test("baris tanpa kolom Beban sama sekali -> null", () => {
    expect(buildDetailExpenseFromRow({ "Kode Barang": "BRG-1" }, { "Kode Barang": "itemNo" })).toBeNull();
  });

  test("Kategori Keuangan Beban (dataClassificationNName) ikut masuk ke detailExpense, field yang SAMA dengan level item tapi array beda", () => {
    const rawRow = { "Akun Beban": "6-10100", "Jumlah Beban": 50000, "Kategori Keuangan Beban 1": "KATKEG BEBAN 1" };
    const columnMapping = { "Akun Beban": "expenseAccountNo", "Jumlah Beban": "expenseAmount", "Kategori Keuangan Beban 1": "expenseKategoriKeuangan1" };
    const expense = buildDetailExpenseFromRow(rawRow, columnMapping);
    expect(expense?.dataClassification1Name).toBe("KATKEG BEBAN 1");
  });
});

describe("buildSalesInvoicePayload — detailExpense (Fase 74)", () => {
  test("baris dengan data Beban -> payload.detailExpense terisi, TIDAK masuk root ATAU detailItem", () => {
    const rawRows = [
      {
        "Customer No": "C-1",
        "Kode Barang": "BRG-1",
        "Akun Beban": "6-10100",
        "Jumlah Beban": 50000,
      },
    ];
    const columnMapping = {
      "Customer No": "customerNo",
      "Kode Barang": "itemNo",
      "Akun Beban": "expenseAccountNo",
      "Jumlah Beban": "expenseAmount",
    };

    const payload = buildSalesInvoicePayload(rawRows, columnMapping);
    expect(payload.accountNo).toBeUndefined();
    expect(payload.expenseAmount).toBeUndefined();
    expect(payload.detailExpense).toEqual([{ accountNo: "6-10100", expenseAmount: 50000 }]);
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.accountNo).toBeUndefined();
  });

  test("TIDAK ada baris yang punya data Beban -> payload.detailExpense TIDAK disertakan sama sekali", () => {
    const rawRows = [{ "Customer No": "C-1", "Kode Barang": "BRG-1" }];
    const columnMapping = { "Customer No": "customerNo", "Kode Barang": "itemNo" };
    const payload = buildSalesInvoicePayload(rawRows, columnMapping);
    expect(payload.detailExpense).toBeUndefined();
  });

  test("multi-baris: cuma baris yang punya data Beban lengkap yang masuk detailExpense", () => {
    const rawRows = [
      { "Customer No": "C-1", "Kode Barang": "BRG-1", "Akun Beban": "6-10100", "Jumlah Beban": 50000 },
      { "Customer No": "C-1", "Kode Barang": "BRG-2" }, // tanpa data Beban
      { "Customer No": "C-1", "Kode Barang": "BRG-3", "Akun Beban": "6-10200", "Jumlah Beban": 25000 },
    ];
    const columnMapping = {
      "Customer No": "customerNo",
      "Kode Barang": "itemNo",
      "Akun Beban": "expenseAccountNo",
      "Jumlah Beban": "expenseAmount",
    };
    const payload = buildSalesInvoicePayload(rawRows, columnMapping);
    expect(payload.detailExpense).toEqual([
      { accountNo: "6-10100", expenseAmount: 50000 },
      { accountNo: "6-10200", expenseAmount: 25000 },
    ]);
    // detailItem TETAP 3 baris (item tidak terpengaruh Beban)
    expect((payload.detailItem as unknown[]).length).toBe(3);
  });
});

describe("extractExpenseDataClassificationValues — Fase 74", () => {
  test("ambil index+name dari kolom expenseKategoriKeuanganN yang terisi, skip yang kosong", () => {
    const rawRow = { "KK Beban 1": "KATKEG 1", "KK Beban 3": "KATKEG 3", "KK Beban 2": "" };
    const columnMapping = { "KK Beban 1": "expenseKategoriKeuangan1", "KK Beban 2": "expenseKategoriKeuangan2", "KK Beban 3": "expenseKategoriKeuangan3" };

    expect(extractExpenseDataClassificationValues(rawRow, columnMapping)).toEqual([
      { index: 1, name: "KATKEG 1" },
      { index: 3, name: "KATKEG 3" },
    ]);
  });

  test("baris tanpa kolom Kategori Keuangan Beban -> array kosong", () => {
    expect(extractExpenseDataClassificationValues({ "Akun Beban": "6-10100" }, { "Akun Beban": "expenseAccountNo" })).toEqual([]);
  });
});

describe("defaultColumnMap — kolom Expense (Fase 74)", () => {
  test("kolom Beban (Indonesia, sinonim lama) terpetakan ke field expense*, terpisah dari field item", () => {
    expect(salesInvoiceMapping.defaultColumnMap["Akun Beban"]).toBe("expenseAccountNo");
    expect(salesInvoiceMapping.defaultColumnMap["Nama Beban"]).toBe("expenseName");
    expect(salesInvoiceMapping.defaultColumnMap["Jumlah Beban"]).toBe("expenseAmount");
    expect(salesInvoiceMapping.defaultColumnMap["Catatan Beban"]).toBe("expenseNotes");
    expect(salesInvoiceMapping.defaultColumnMap["Beban - Department"]).toBe("expenseDepartmentName");
    for (let i = 1; i <= 10; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`Kategori Keuangan Beban ${i}`]).toBe(`expenseKategoriKeuangan${i}`);
    }
  });

  // § Fase 77 (2026-09-09) — client minta "expense diubah semua jadi bhs
  // inggris" — nama Inggris jadi sinonim BARU, nama Indonesia lama
  // (test di atas) TETAP didukung, tidak regresi.
  test("kolom Beban (Inggris, Fase 77) terpetakan ke field expense* yang SAMA", () => {
    expect(salesInvoiceMapping.defaultColumnMap["Expense Acc No"]).toBe("expenseAccountNo");
    expect(salesInvoiceMapping.defaultColumnMap["Expense Name"]).toBe("expenseName");
    expect(salesInvoiceMapping.defaultColumnMap["Expense Amount"]).toBe("expenseAmount");
    expect(salesInvoiceMapping.defaultColumnMap["Expense Note"]).toBe("expenseNotes");
    expect(salesInvoiceMapping.defaultColumnMap["Expense Department"]).toBe("expenseDepartmentName");
    for (let i = 1; i <= 10; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`Expense Financial Category ${i}`]).toBe(`expenseKategoriKeuangan${i}`);
    }
  });
});

// § Fase 76 (2026-09-09) — link alur penjualan (Penawaran -> Pesanan ->
// Pengiriman -> Faktur), level ITEM. DIKONFIRMASI RESMI di spec
// Accurate (`deliveryOrderNumber`/`salesOrderNumber`/`salesQuotationNumber`
// di `detailItem`). "Purchase Order No" SENGAJA TIDAK ada padanan
// (sudah tercakup field header `poNumber`/"Bill No").
describe("link alur penjualan level ITEM — Fase 76", () => {
  test("Delivery Order No/Sales Order No/Sales Quotation No masuk ke detailItem, BUKAN root", () => {
    const rawRow = {
      "Kode Barang": "BRG-1",
      "ITEM: DELIVERY ORDER NO": "DO-001",
      "ITEM: SALES ORDER NO": "SO-001",
      "ITEM: SALES QUOT NO": "SQ-001",
    };
    const columnMapping = {
      "Kode Barang": "itemNo",
      "ITEM: DELIVERY ORDER NO": "itemDeliveryOrderNo",
      "ITEM: SALES ORDER NO": "itemSalesOrderNo",
      "ITEM: SALES QUOT NO": "itemSalesQuotationNo",
    };
    const payload = buildSalesInvoicePayload([rawRow], columnMapping);
    expect(payload.deliveryOrderNumber).toBeUndefined();
    const detail = (payload.detailItem as Record<string, unknown>[])[0]!;
    expect(detail.deliveryOrderNumber).toBe("DO-001");
    expect(detail.salesOrderNumber).toBe("SO-001");
    expect(detail.salesQuotationNumber).toBe("SQ-001");
  });

  test("defaultColumnMap — nama kolom sesuai, tidak ada padanan Purchase Order No", () => {
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: DELIVERY ORDER NO"]).toBe("itemDeliveryOrderNo");
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: SALES ORDER NO"]).toBe("itemSalesOrderNo");
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: SALES QUOT NO"]).toBe("itemSalesQuotationNo");
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: PURCHASE ORDER NO"]).toBeUndefined();
  });
});

// § Fase 77 (2026-09-09) — mirror Fase 76, tapi level EXPENSE
// (`detailExpense`, array TERPISAH dari `detailItem`). DIKONFIRMASI
// RESMI di spec Accurate (`salesOrderNumber`/`salesQuotationNumber` di
// `detailExpense.items.properties`). Array ini TIDAK punya
// `deliveryOrderNumber` sama sekali (beda dari `detailItem`).
describe("link alur penjualan level EXPENSE — Fase 77", () => {
  test("Expense Sales Order No/Expense Sales Quotation No masuk ke detailExpense, BUKAN root/detailItem", () => {
    const rawRow = {
      "Akun Beban": "6-10100",
      "Jumlah Beban": 50000,
      "Expense Sales Order No": "SO-EXP-001",
      "Expense Sales Quotation No": "SQ-EXP-001",
    };
    const columnMapping = {
      "Akun Beban": "expenseAccountNo",
      "Jumlah Beban": "expenseAmount",
      "Expense Sales Order No": "expenseSalesOrderNo",
      "Expense Sales Quotation No": "expenseSalesQuotationNo",
    };
    const payload = buildSalesInvoicePayload([rawRow], columnMapping);
    expect(payload.salesOrderNumber).toBeUndefined();
    const detail = (payload.detailExpense as Record<string, unknown>[])[0]!;
    expect(detail.salesOrderNumber).toBe("SO-EXP-001");
    expect(detail.salesQuotationNumber).toBe("SQ-EXP-001");
    expect(detail.deliveryOrderNumber).toBeUndefined();
  });

  test("defaultColumnMap — nama kolom sesuai, tidak ada padanan Expense Delivery Order No", () => {
    expect(salesInvoiceMapping.defaultColumnMap["Expense Sales Order No"]).toBe("expenseSalesOrderNo");
    expect(salesInvoiceMapping.defaultColumnMap["Expense Sales Quotation No"]).toBe("expenseSalesQuotationNo");
    expect(salesInvoiceMapping.defaultColumnMap["Expense Delivery Order No"]).toBeUndefined();
  });

  test("buildDetailExpenseFromRow tetap null kalau accountNo/amount kosong, walau link field terisi", () => {
    expect(
      buildDetailExpenseFromRow(
        { "Expense Sales Order No": "SO-EXP-001" },
        { "Expense Sales Order No": "expenseSalesOrderNo" },
      ),
    ).toBeNull();
  });
});
