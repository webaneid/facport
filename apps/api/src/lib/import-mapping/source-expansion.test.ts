import { describe, test, expect } from "bun:test";
import type { SalesQuotationDetail } from "../accurate-sales-quotation";
import { buildSalesInvoicePayload } from "./sales-invoice.mapping";
import {
  isSourceExpansionRow,
  missingRequiredFieldsForRow,
  expandSourceRowsInPayload,
  mapDetailIdsToRows,
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
  test("prioritas DO > SO > SQ; sumber berprioritas tinggi yang BELUM didukung (DO) tidak dilewati demi SO/SQ", () => {
    const row = { ...header, "ITEM: SALES QUOT NO": "SQ-1", "ITEM: SALES ORDER NO": "SO-1" };
    expect(sourceOfRow(row, mapping)?.kind).toBe("salesOrder");
    expect(isSourceExpansionRow(row, mapping)).toBe(true); // SO didukung (tahap B) → perluasan dari SO, bukan SQ
    expect(isSourceExpansionRow({ ...header, "ITEM: SALES ORDER NO": "SO-1" }, mapping)).toBe(true);
    expect(sourceOfRow({ ...row, "ITEM: DELIVERY ORDER NO": "DO-1" }, mapping)?.kind).toBe("deliveryOrder");
    expect(isSourceExpansionRow({ ...row, "ITEM: DELIVERY ORDER NO": "DO-1" }, mapping)).toBe(false); // DO belum didukung (tahap C) → item tetap wajib
    expect(isSourceExpansionRow({ ...header, "ITEM: DELIVERY ORDER NO": "DO-1" }, mapping)).toBe(false);
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
