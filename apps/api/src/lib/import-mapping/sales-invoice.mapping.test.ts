import { describe, test, expect } from "bun:test";
import {
  salesInvoiceMapping,
  buildSalesInvoicePayload,
  buildDetailItemFromRow,
  poNumberColumnOf,
  extractCustomerCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues,
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
  // Keuangan N" (dikira sinonim). § Fase 71 (2026-09-08) DIKOREKSI:
  // client tunjukkan file Excel mereka sendiri (highlight kuning) yang
  // membuktikan "ITEM:CUSTOM CHARACTER N" itu field API BERBEDA dari
  // Kategori Keuangan (dataClassificationNName) — field-nya sendiri
  // belum teridentifikasi. Sinonim SALAH itu DIHAPUS — "Kategori
  // Keuangan N" SEKARANG SATU-SATUNYA nama kolom untuk attribut1-10.
  test("defaultColumnMap Atribut Tambahan pakai 'Kategori Keuangan N' (istilah resmi Accurate) untuk attribut1-10", () => {
    for (let i = 1; i <= 10; i++) {
      expect(salesInvoiceMapping.defaultColumnMap[`Kategori Keuangan ${i}`]).toBe(`attribut${i}`);
    }
    // slot 11 SENGAJA TIDAK ada — tidak ada padanan API Accurate-nya.
    expect(salesInvoiceMapping.defaultColumnMap["Kategori Keuangan 11"]).toBeUndefined();
    expect(salesInvoiceMapping.defaultColumnMap["Karakter 1"]).toBeUndefined();
    // § Fase 71 — "ITEM:CUSTOM CHARACTER N" BUKAN LAGI sinonim attribut1-10
    // (field API BERBEDA, belum teridentifikasi) — pastikan tidak salah
    // auto-suggest ke Kategori Keuangan.
    expect(salesInvoiceMapping.defaultColumnMap["ITEM:CUSTOM CHARACTER 1"]).toBeUndefined();
    expect(salesInvoiceMapping.defaultColumnMap["ITEM: CUSTOM CHARACTER 1"]).toBeUndefined();
  });

  // § Fase 70 (2026-09-08) — client minta judul kolom "PO Number" ->
  // "Bill No" (konsisten dengan istilah Purchase Invoice). "PO Number"
  // TETAP dipertahankan sebagai sinonim lama.
  test("defaultColumnMap punya sinonim 'Bill No' untuk poNumber, 'PO Number' TETAP ada", () => {
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
