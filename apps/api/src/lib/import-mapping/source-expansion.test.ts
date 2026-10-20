import { describe, test, expect } from "bun:test";
import type { SalesQuotationDetail } from "../accurate-sales-quotation";
import { buildSalesInvoicePayload } from "./sales-invoice.mapping";
import {
  isSourceExpansionRow,
  missingRequiredFieldsForRow,
  expandSourceRowsInPayload,
  mapDetailIdsToRows,
  isRequiredFieldExemptForRow,
  annotateSourceExpansionFailure,
  sourceOfRow,
} from "./source-expansion";

// § Fase 198 — Sales Invoice menarik isi dokumen sumber (tahap A: Sales Quotation).
const mapping: Record<string, string> = {
  "CUST NO": "customerNo",
  "Trans Date": "transDate",
  "Trans No": "number",
  "Item No": "itemNo",
  "Item Price": "unitPrice",
  Qty: "quantity",
  "Item Unit Name": "itemUnitName",
  "Item Name": "itemName",
  "Item Notes": "itemNotes",
  "Item Warehouse": "warehouseName",
  "Item Dept": "departmentName",
  "Payment Term Name": "paymentTermName",
  "Currency Code": "currencyCode",
  Rate: "rate",
  "Inclusive Tax": "inclusiveTax",
  Taxable: "taxable",
  "Attribut 5": "attribut5",
  "Header Karakter 1": "attributHeaderKarakter1",
  "Item Karakter 2": "attributItemKarakter2",
  "Header Tanggal 1": "attributHeaderTanggal1",
  "Item Tanggal 1": "attributItemTanggal1",
  "Item PPnBM": "useTax2",
  "Shipment Name": "shipmentName",
  "Shipment Date": "shipDate",
  "Branch Name": "branchName",
  "ITEM: DELIVERY ORDER NO": "itemDeliveryOrderNo",
  "ITEM: SALES ORDER NO": "itemSalesOrderNo",
  "ITEM: SALES QUOT NO": "itemSalesQuotationNo",
};
const header = { "CUST NO": "C.1", "Trans Date": "2026-10-19", "Trans No": "SI-1", "Item Warehouse": "Gudang Utama" };

const quotation: SalesQuotationDetail = {
  header: { paymentTermName: "Net 30", toAddress: "Jl. Mawar 1", currencyCode: "IDR" },
  lines: [
    { itemNo: "A-1", itemName: "Barang A", unitPrice: 5000, quantity: 10, unitName: "PCS", notes: "catatan A" },
    { itemNo: "B-2", itemName: null, unitPrice: 7500, quantity: 3, unitName: "KG", notes: null },
    { itemNo: "C-3", itemName: null, unitPrice: 100, quantity: 1, unitName: "BOX", notes: null },
  ],
  expenses: [{ accountNo: "6101", expenseName: null, expenseAmount: 20000, expenseNotes: "ongkir" }],
};

describe("isSourceExpansionRow / sourceOfRow", () => {
  test("hanya Sales Quot No terisi, kolom item kosong → baris perluasan", () => {
    expect(isSourceExpansionRow({ ...header, "ITEM: SALES QUOT NO": "SQ-1" }, mapping)).toBe(true);
  });
  test("salah satu kolom item terisi (faktur parsial) → bukan perluasan", () => {
    for (const col of ["Item No", "Item Price", "Qty", "Item Unit Name", "Item Name", "Item Notes"]) {
      expect(isSourceExpansionRow({ ...header, "ITEM: SALES QUOT NO": "SQ-1", [col]: "x" }, mapping)).toBe(false);
    }
  });
  test("tanpa nomor sumber → bukan perluasan; spasi saja dianggap kosong", () => {
    expect(isSourceExpansionRow({ ...header }, mapping)).toBe(false);
    expect(isSourceExpansionRow({ ...header, "ITEM: SALES QUOT NO": "   " }, mapping)).toBe(false);
  });
  test("prioritas DO > SO > SQ; semua tiga sumber kini didukung", () => {
    const all = { ...header, "ITEM: SALES QUOT NO": "SQ-1", "ITEM: SALES ORDER NO": "SO-1", "ITEM: DELIVERY ORDER NO": "DO-1" };
    expect(sourceOfRow(all, mapping)?.kind).toBe("deliveryOrder");
    expect(isSourceExpansionRow(all, mapping)).toBe(true);
    const soSq = { ...header, "ITEM: SALES QUOT NO": "SQ-1", "ITEM: SALES ORDER NO": "SO-1" };
    expect(sourceOfRow(soSq, mapping)?.kind).toBe("salesOrder");
    expect(isSourceExpansionRow(soSq, mapping)).toBe(true);
    expect(isSourceExpansionRow({ ...header, "ITEM: DELIVERY ORDER NO": "DO-1", "Item No": "A-1" }, mapping)).toBe(false); // sebagian → dari Excel
  });
});

describe("missingRequiredFieldsForRow", () => {
  test("baris biasa: semua wajib (termasuk item, harga, qty, gudang)", () => {
    expect(missingRequiredFieldsForRow({ ...header }, mapping).sort()).toEqual(["itemNo", "quantity", "unitPrice"]);
  });
  test("baris perluasan: Item No/Harga/Qty dikecualikan", () => {
    expect(missingRequiredFieldsForRow({ ...header, "ITEM: SALES QUOT NO": "SQ-1" }, mapping)).toEqual([]);
  });
  test("gudang TETAP wajib untuk baris perluasan (baris penawaran tidak membawa gudang)", () => {
    expect(missingRequiredFieldsForRow({ ...header, "Item Warehouse": "", "ITEM: SALES QUOT NO": "SQ-1" }, mapping)).toEqual(["warehouseName"]);
  });
  test("gudang dikecualikan HANYA untuk sumber Delivery Order (DO membawa gudang); SO/SQ tetap wajib", () => {
    const noWh = { ...header, "Item Warehouse": "" };
    expect(missingRequiredFieldsForRow({ ...noWh, "ITEM: DELIVERY ORDER NO": "DO-1" }, mapping)).toEqual([]);
    expect(missingRequiredFieldsForRow({ ...noWh, "ITEM: SALES ORDER NO": "SO-1" }, mapping)).toEqual(["warehouseName"]);
    expect(isRequiredFieldExemptForRow({ ...noWh, "ITEM: DELIVERY ORDER NO": "DO-1" }, mapping, "warehouseName")).toBe(true);
    // DO tapi kolom item terisi (faktur parsial) → bukan perluasan → gudang wajib lagi
    expect(isRequiredFieldExemptForRow({ ...noWh, "ITEM: DELIVERY ORDER NO": "DO-1", "Item No": "A" }, mapping, "warehouseName")).toBe(false);
  });
  test("sebagian terisi → aturan biasa lagi (harga/qty kosong = salah)", () => {
    expect(missingRequiredFieldsForRow({ ...header, "ITEM: SALES QUOT NO": "SQ-1", "Item No": "A-1" }, mapping).sort()).toEqual(["quantity", "unitPrice"]);
  });
});

describe("expandSourceRowsInPayload", () => {
  const fetchers = (calls?: string[]) => ({
    salesQuotation: async (n: string) => {
      calls?.push(n);
      return quotation;
    },
  });

  test("1 baris → semua baris penawaran; kolom lain berlaku ke semua; tiap baris membawa Sales Quot No; offsets benar untuk baris campuran", async () => {
    const rawRows = [
      { ...header, "Item No": "X-9", "Item Price": 1, Qty: 1 },
      { ...header, "ITEM: SALES QUOT NO": "SQ-1", "Item Dept": "Penjualan" },
      { ...header, "Item No": "Y-8", "Item Price": 2, Qty: 2 },
    ];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    const offsets = await expandSourceRowsInPayload(payload, rawRows, mapping, fetchers());
    expect(offsets).toEqual([0, 1, 4]);
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({ itemNo: "X-9" });
    expect(items.slice(1, 4).map((i) => i.itemNo)).toEqual(["A-1", "B-2", "C-3"]);
    for (const it of items.slice(1, 4)) {
      expect(it).toMatchObject({ salesQuotationNumber: "SQ-1", departmentName: "Penjualan", warehouseName: "Gudang Utama" });
    }
    expect(items[1]).toMatchObject({ unitPrice: 5000, quantity: 10, itemUnitName: "PCS", detailName: "Barang A", detailNotes: "catatan A" });
    expect(items[4]).toMatchObject({ itemNo: "Y-8" });
  });

  test("header kosong diisi dari penawaran; isian Excel menang; Beban penawaran ikut membawa Sales Quot No", async () => {
    const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-1", "Payment Term Name": "Cash" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expandSourceRowsInPayload(payload, rawRows, mapping, fetchers());
    expect(payload.paymentTermName).toBe("Cash"); // Excel menang
    expect(payload.toAddress).toBe("Jl. Mawar 1");
    expect(payload.currencyCode).toBe("IDR");
    expect(payload.detailExpense).toEqual([{ accountNo: "6101", expenseAmount: 20000, salesQuotationNumber: "SQ-1", expenseNotes: "ongkir" }]);
  });

  test("Beban dari sumber TIDAK ditarik bila Excel sudah punya baris Beban (hindari ganda)", async () => {
    const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-1" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    payload.detailExpense = [{ accountNo: "9999", expenseAmount: 1 }];
    await expandSourceRowsInPayload(payload, rawRows, mapping, fetchers());
    expect(payload.detailExpense).toEqual([{ accountNo: "9999", expenseAmount: 1 }]);
  });

  test("dua baris dengan nomor penawaran sama → penawaran dibaca SEKALI (cache)", async () => {
    const rawRows = [
      { ...header, "ITEM: SALES QUOT NO": "SQ-1" },
      { ...header, "ITEM: SALES QUOT NO": "SQ-1" },
    ];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    const calls: string[] = [];
    const offsets = await expandSourceRowsInPayload(payload, rawRows, mapping, fetchers(calls));
    expect(calls).toEqual(["SQ-1"]);
    expect(offsets).toEqual([0, 3]);
  });

  test("baris dengan kolom item terisi: penawaran TIDAK dibaca, entri apa adanya", async () => {
    const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-1", "Item No": "A-1", "Item Price": 5000, Qty: 5 }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    const calls: string[] = [];
    const offsets = await expandSourceRowsInPayload(payload, rawRows, mapping, fetchers(calls));
    expect(calls).toEqual([]);
    expect(offsets).toEqual([0]);
    expect(payload.detailItem).toHaveLength(1);
  });

  test("penawaran tidak ketemu/tidak terbaca → galat dilempar (tidak pernah kirim baris setengah)", async () => {
    const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-404" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expect(
      expandSourceRowsInPayload(payload, rawRows, mapping, {
        salesQuotation: async () => {
          throw new Error('Penawaran "SQ-404" tidak ditemukan di Accurate');
        },
      }),
    ).rejects.toThrow(/tidak ditemukan/);
  });
});

describe("expandSourceRowsInPayload — sumber Sales Order (tahap B)", () => {
  const order: SalesQuotationDetail = {
    header: { paymentTermName: "Net 14" },
    lines: [
      { itemNo: "S-1", itemName: null, unitPrice: 900, quantity: 4, unitName: "PCS", notes: null },
      { itemNo: "S-2", itemName: null, unitPrice: 50, quantity: 2, unitName: "KG", notes: null },
    ],
    expenses: [{ accountNo: "6200", expenseName: null, expenseAmount: 1000, expenseNotes: null }],
  };

  test("Sales Order No terisi → diperluas dari PESANAN (fetcher SO), membawa Sales Order No; Beban membawa salesOrderNumber", async () => {
    const rawRows = [{ ...header, "ITEM: SALES ORDER NO": "SO-1" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    const calls: string[] = [];
    const offsets = await expandSourceRowsInPayload(payload, rawRows, mapping, {
      salesOrder: async (n) => {
        calls.push(`SO:${n}`);
        return order;
      },
      salesQuotation: async (n) => {
        calls.push(`SQ:${n}`);
        return quotation;
      },
    });
    expect(calls).toEqual(["SO:SO-1"]);
    expect(offsets).toEqual([0]);
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items.map((i) => i.itemNo)).toEqual(["S-1", "S-2"]);
    expect(items[0]).toMatchObject({ salesOrderNumber: "SO-1", unitPrice: 900, quantity: 4, warehouseName: "Gudang Utama" });
    expect(payload.paymentTermName).toBe("Net 14");
    expect(payload.detailExpense).toEqual([{ accountNo: "6200", expenseAmount: 1000, salesOrderNumber: "SO-1" }]);
  });

  test("SO dan SQ sama-sama terisi → hanya SO yang dibaca (prioritas Accurate)", async () => {
    const rawRows = [{ ...header, "ITEM: SALES ORDER NO": "SO-1", "ITEM: SALES QUOT NO": "SQ-1" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    const calls: string[] = [];
    await expandSourceRowsInPayload(payload, rawRows, mapping, {
      salesOrder: async (n) => (calls.push(`SO:${n}`), order),
      salesQuotation: async (n) => (calls.push(`SQ:${n}`), quotation),
    });
    expect(calls).toEqual(["SO:SO-1"]);
    expect((payload.detailItem as Record<string, unknown>[])[0]).toMatchObject({ salesOrderNumber: "SO-1", salesQuotationNumber: "SQ-1" });
  });
});

describe("expandSourceRowsInPayload — sumber Delivery Order (tahap C)", () => {
  const delivery = (wh?: (string | undefined)[]): SalesQuotationDetail => ({
    header: {},
    lines: [
      { itemNo: "D-1", itemName: null, unitPrice: 300, quantity: 2, unitName: "PCS", notes: null, ...(wh?.[0] ? { warehouseName: wh[0] } : {}) },
      { itemNo: "D-2", itemName: null, unitPrice: 40, quantity: 5, unitName: "KG", notes: null, ...(wh?.[1] ? { warehouseName: wh[1] } : {}) },
    ],
    // pengiriman bukan dokumen biaya — kalaupun parser mengembalikan Beban, TIDAK boleh ditarik (detailExpense SI tak punya deliveryOrderNumber)
    expenses: [{ accountNo: "6300", expenseName: null, expenseAmount: 5, expenseNotes: null }],
  });
  const noWh = { ...header, "Item Warehouse": "" };

  test("gudang kosong di Excel → diisi dari baris pengiriman; membawa Delivery Order No; Beban TIDAK ditarik", async () => {
    const rawRows = [{ ...noWh, "ITEM: DELIVERY ORDER NO": "DO-1" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expandSourceRowsInPayload(payload, rawRows, mapping, { deliveryOrder: async () => delivery(["Gudang A", "Gudang B"]) });
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items.map((i) => [i.itemNo, i.warehouseName, i.deliveryOrderNumber])).toEqual([
      ["D-1", "Gudang A", "DO-1"],
      ["D-2", "Gudang B", "DO-1"],
    ]);
    expect(payload.detailExpense).toBeUndefined();
  });

  test("gudang di Excel menang atas gudang pengiriman", async () => {
    const rawRows = [{ ...header, "ITEM: DELIVERY ORDER NO": "DO-1" }]; // header.Item Warehouse = "Gudang Utama"
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expandSourceRowsInPayload(payload, rawRows, mapping, { deliveryOrder: async () => delivery(["Gudang A", "Gudang B"]) });
    expect((payload.detailItem as Record<string, unknown>[]).map((i) => i.warehouseName)).toEqual(["Gudang Utama", "Gudang Utama"]);
  });

  test("gudang tidak ada di Excel DAN tidak terbaca dari pengiriman → gagal jelas, tidak kirim kosong", async () => {
    const rawRows = [{ ...noWh, "ITEM: DELIVERY ORDER NO": "DO-1" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expect(expandSourceRowsInPayload(payload, rawRows, mapping, { deliveryOrder: async () => delivery(["Gudang A", undefined]) })).rejects.toThrow(/Gudang untuk baris ke-2 pengiriman "DO-1"/);
  });

  test("DO dan SO sama-sama terisi → hanya DO yang dibaca (prioritas tertinggi)", async () => {
    const rawRows = [{ ...noWh, "ITEM: DELIVERY ORDER NO": "DO-1", "ITEM: SALES ORDER NO": "SO-1" }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    const calls: string[] = [];
    await expandSourceRowsInPayload(payload, rawRows, mapping, {
      deliveryOrder: async (n) => (calls.push(`DO:${n}`), delivery(["G", "G"])),
      salesOrder: async (n) => (calls.push(`SO:${n}`), quotation),
    });
    expect(calls).toEqual(["DO:DO-1"]);
  });
});

describe("expandSourceRowsInPayload — pajak & kurs sumber (memengaruhi angka faktur)", () => {
  const taxedUsd: SalesQuotationDetail = {
    header: { inclusiveTax: true, taxable: true, currencyCode: "USD", rate: 15500 },
    lines: [{ itemNo: "T-1", itemName: null, unitPrice: 100, quantity: 1, unitName: "PCS", notes: null }],
    expenses: [],
  };
  const run = async (extraRow: Record<string, unknown>, detail: SalesQuotationDetail = taxedUsd) => {
    const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-1", ...extraRow }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expandSourceRowsInPayload(payload, rawRows, mapping, { salesQuotation: async () => detail });
    return payload;
  };

  test("inclusiveTax, taxable, mata uang & kurs ditarik dari sumber bila kosong di Excel", async () => {
    const payload = await run({});
    expect(payload).toMatchObject({ inclusiveTax: true, taxable: true, currencyCode: "USD", rate: 15500 });
  });

  test("Excel menang: FALSE di Excel dianggap terisi (tidak ditimpa sumber); kurs Excel dipakai", async () => {
    const payload = await run({ "Inclusive Tax": "FALSE", Taxable: "FALSE", "Currency Code": "USD", Rate: 16000 });
    expect(payload).toMatchObject({ inclusiveTax: false, taxable: false, currencyCode: "USD", rate: 16000 });
  });

  test("kurs sumber TIDAK ikut bila mata uang Excel berbeda dari mata uang sumber", async () => {
    const payload = await run({ "Currency Code": "SGD" });
    expect(payload.currencyCode).toBe("SGD");
    expect(payload.rate).toBeUndefined();
  });

  test("sumber tanpa mata uang terbaca → kurs tidak ditarik; tanpa pajak terbaca → tidak ditarik (bukan galat)", async () => {
    const payload = await run({}, { header: { rate: 15500 }, lines: taxedUsd.lines, expenses: [] });
    expect(payload.rate).toBeUndefined();
    expect(payload.inclusiveTax).toBeUndefined();
    expect(payload.taxable).toBeUndefined();
  });
});

describe("expandSourceRowsInPayload — atribut tambahan sumber (Kategori Keuangan, custom, PPnBM, Beban dept)", () => {
  const rich: SalesQuotationDetail = {
    header: {},
    headerExtra: { charField1: "H-src", numericField2: 7, dateField1: "05/10/2026" },
    lines: [
      { itemNo: "R-1", itemName: null, unitPrice: 10, quantity: 1, unitName: "PCS", notes: null, extra: { dataClassification5Name: "Week 1", charField2: "c-src", numericField1: 3, dateField1: "02/10/2026", useTax2: true } },
      { itemNo: "R-2", itemName: null, unitPrice: 20, quantity: 1, unitName: "PCS", notes: null },
    ],
    expenses: [{ accountNo: "6101", expenseName: null, expenseAmount: 5, expenseNotes: null, departmentName: "Umum" }],
  };
  const run = async (extraRow: Record<string, unknown>) => {
    const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-1", ...extraRow }];
    const payload = buildSalesInvoicePayload(rawRows, mapping);
    await expandSourceRowsInPayload(payload, rawRows, mapping, { salesQuotation: async () => rich });
    return payload;
  };

  test("atribut baris & header kosong di Excel → diisi dari sumber (per baris sumber), Beban membawa departemen", async () => {
    const payload = await run({});
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ dataClassification5Name: "Week 1", charField2: "c-src", numericField1: 3, dateField1: "02/10/2026", useTax2: true });
    expect(items[1]!.dataClassification5Name).toBeUndefined(); // baris sumber ke-2 tak punya atribut → tidak ada isian
    expect(payload).toMatchObject({ charField1: "H-src", numericField2: 7, dateField1: "05/10/2026" });
    expect(payload.detailExpense).toEqual([{ accountNo: "6101", expenseAmount: 5, salesQuotationNumber: "SQ-1", departmentName: "Umum" }]);
  });

  test("Excel menang untuk atribut baris, header, dan PPnBM (FALSE = terisi)", async () => {
    const payload = await run({ "Attribut 5": "Week 9", "Header Karakter 1": "H-xls", "Item Karakter 2": "c-xls", "Item PPnBM": "FALSE", "Item Tanggal 1": "01/01/2027", "Header Tanggal 1": "09/09/2026" });
    const items = payload.detailItem as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ dataClassification5Name: "Week 9", charField2: "c-xls", useTax2: false, numericField1: 3 }); // angka kosong di Excel tetap dari sumber
    expect(payload.charField1).toBe("H-xls");
    expect(items[0]!.dateField1).toBe("01/01/2027"); // Excel menang untuk tanggal baris
    expect(payload.dateField1).toBe("09/09/2026"); // dan tanggal header
  });
});

describe("expandSourceRowsInPayload — pengiriman & cabang sumber (Sales Invoice)", () => {
  const withShip: SalesQuotationDetail = {
    header: { shipmentName: "JNE", shipDate: "20/10/2026", branchName: "JAKARTA" },
    lines: [{ itemNo: "S-1", itemName: null, unitPrice: 1, quantity: 1, unitName: "PCS", notes: null }],
    expenses: [],
  };
  test("kosong di Excel → ditarik; Excel menang", async () => {
    for (const [extra, expected] of [
      [{}, { shipmentName: "JNE", shipDate: "20/10/2026", branchName: "JAKARTA" }],
      [{ "Shipment Name": "SiCepat", "Branch Name": "BDG" }, { shipmentName: "SiCepat", shipDate: "20/10/2026", branchName: "BDG" }],
    ] as const) {
      const rawRows = [{ ...header, "ITEM: SALES QUOT NO": "SQ-1", ...extra }];
      const payload = buildSalesInvoicePayload(rawRows, mapping);
      await expandSourceRowsInPayload(payload, rawRows, mapping, { salesQuotation: async () => withShip });
      expect(payload).toMatchObject(expected);
    }
  });
});

describe("mapDetailIdsToRows (pemetaan id detail Accurate → baris Excel)", () => {
  test("tanpa perluasan: baris ke-i ↔ detail ke-i", () => {
    expect(mapDetailIdsToRows(["r0", "r1"], [0, 1], [{ id: 10 }, { id: 11 }], 2)).toEqual([
      { rowId: "r0", detailItemId: 10 },
      { rowId: "r1", detailItemId: 11 },
    ]);
  });
  test("dengan perluasan: baris sesudah baris perluasan TIDAK bergeser; baris perluasan memakai id detail PERTAMA", () => {
    const saved = [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }];
    expect(mapDetailIdsToRows(["r0", "r1", "r2"], [0, 1, 4], saved, 5)).toEqual([
      { rowId: "r0", detailItemId: 100 },
      { rowId: "r1", detailItemId: 101 },
      { rowId: "r2", detailItemId: 104 },
    ]);
  });
  test("jumlah detail dari Accurate ≠ yang dikirim → galat, bukan tebakan", () => {
    expect(() => mapDetailIdsToRows(["r0"], [0], [{ id: 1 }], 3)).toThrow(/tidak bisa dipetakan/);
  });
});

// § 2026-10-20 — kasus nyata client: DO 10 pcs, retur 3 pcs, faktur hanya isi tanggal + nomor DO → Accurate: "Kuantitas … di faktur melebihi yang dikirim."
describe("annotateSourceExpansionFailure", () => {
  const msg = 'Kuantitas "Anti Gores Iphone 5" di faktur melebihi yang dikirim.';
  const doRow = { "CUST NO": "CSBY-0005", "Trans Date": "01/01/2027", "Branch Name": "SURABAYA", "ITEM: DELIVERY ORDER NO": "DO001" };

  test("baris perluasan dari DO + galat kuantitas → pesan Accurate utuh + penjelasan (sumber DO001, kuantitas asli, isi Qty sendiri)", () => {
    const out = annotateSourceExpansionFailure(msg, [doRow], mapping);
    expect(out.startsWith(msg)).toBe(true);
    expect(out).toContain("Delivery Order DO001");
    expect(out).toContain("sisa yang tersedia"); // DO kini memakai sisa menurut Accurate (bukan kuantitas asli)
    expect(out).toContain("Item Qty");
  });
  test("SO/SQ tetap memakai kuantitas ASLI → pesan menyebut ASLI dan meminta isi manual", () => {
    const so = { ...doRow, "ITEM: DELIVERY ORDER NO": "", "ITEM: SALES ORDER NO": "SO-9" };
    expect(annotateSourceExpansionFailure(msg, [so], mapping)).toContain("ASLI");
  });

  test("baris BUKAN perluasan (kolom item terisi manual) atau galat lain → pesan tidak diubah", () => {
    expect(annotateSourceExpansionFailure(msg, [{ ...doRow, "Item No": "A-1", "Item Price": 1, Qty: 7 }], mapping)).toBe(msg);
    expect(annotateSourceExpansionFailure("Customer tidak ditemukan", [doRow], mapping)).toBe("Customer tidak ditemukan");
  });

  test("sumber SO/SQ disebut sesuai jenisnya", () => {
    const so = { ...doRow, "ITEM: DELIVERY ORDER NO": "", "ITEM: SALES ORDER NO": "SO-9" };
    expect(annotateSourceExpansionFailure(msg, [so], mapping)).toContain("Sales Order SO-9");
  });
});
