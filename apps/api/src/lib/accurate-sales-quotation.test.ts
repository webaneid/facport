import { describe, test, expect } from "bun:test";
import { parseSalesQuotationLines, MAX_QUOTATION_LINES } from "./accurate-sales-quotation";

// § Fase 169 — parser KETAT: bentuk respons `sales-quotation/detail.do` belum diverifikasi dengan respons asli, jadi data yang tidak
// terbaca lengkap TIDAK BOLEH lolos jadi baris setengah (harga 0 diam-diam = data akuntansi salah).
describe("parseSalesQuotationLines", () => {
  const line = { item: { no: "A-1" }, detailName: "Barang A", detailNotes: "cat", unitPrice: 5000, quantity: 10, itemUnit: { name: "PCS" } };

  test("bentuk utama (item.no, itemUnit.name) terbaca lengkap; angka string dikonversi; nama/catatan kosong jadi null", () => {
    expect(parseSalesQuotationLines({ detailItem: [line, { ...line, item: { no: "B-2" }, detailName: " ", detailNotes: null, unitPrice: "7500.5", quantity: "3" }] }, "SQ-1")).toEqual([
      { itemNo: "A-1", itemName: "Barang A", unitPrice: 5000, quantity: 10, unitName: "PCS", notes: "cat" },
      { itemNo: "B-2", itemName: null, unitPrice: 7500.5, quantity: 3, unitName: "PCS", notes: null },
    ]);
  });

  test("bentuk cadangan (itemNo flat, unit.name / itemUnitName) juga terbaca", () => {
    const flat = { itemNo: "C-3", unitPrice: 1, quantity: 2, itemUnitName: "BOX" };
    expect(parseSalesQuotationLines({ detailItem: [flat, { ...flat, itemNo: "D-4", itemUnitName: undefined, unit: { name: "DUS" } }] }, "SQ-1").map((l) => l.unitName)).toEqual(["BOX", "DUS"]);
  });

  test("harga 0 yang SAH diterima (bonus/gratis), tapi harga hilang / qty ≤ 0 / tanpa satuan / tanpa kode barang → ditolak dengan nomor baris & field", () => {
    expect(parseSalesQuotationLines({ detailItem: [{ ...line, unitPrice: 0 }] }, "SQ-1")[0]!.unitPrice).toBe(0);
    expect(() => parseSalesQuotationLines({ detailItem: [{ ...line, unitPrice: undefined }] }, "SQ-1")).toThrow(/Baris ke-1.*SQ-1.*harga/);
    expect(() => parseSalesQuotationLines({ detailItem: [line, { ...line, quantity: 0 }] }, "SQ-1")).toThrow(/Baris ke-2.*qty/);
    expect(() => parseSalesQuotationLines({ detailItem: [{ ...line, itemUnit: null }] }, "SQ-1")).toThrow(/satuan/);
    expect(() => parseSalesQuotationLines({ detailItem: [{ ...line, item: null }] }, "SQ-1")).toThrow(/kode barang/);
  });

  test("penawaran tanpa baris item / respons kosong → error jelas", () => {
    expect(() => parseSalesQuotationLines({ detailItem: [] }, "SQ-9")).toThrow('Penawaran "SQ-9" tidak punya baris item');
    expect(() => parseSalesQuotationLines(undefined, "SQ-9")).toThrow("tidak punya baris item");
  });
});

describe("parseSalesQuotationLines — batas jumlah baris (security review Fase 169)", () => {
  const line = { item: { no: "A-1" }, unitPrice: 1, quantity: 1, itemUnit: { name: "PCS" } };
  test("tepat di batas lolos; satu baris di atas batas ditolak dengan pesan jelas", () => {
    expect(parseSalesQuotationLines({ detailItem: Array.from({ length: MAX_QUOTATION_LINES }, () => line) }, "SQ-1")).toHaveLength(MAX_QUOTATION_LINES);
    expect(() => parseSalesQuotationLines({ detailItem: Array.from({ length: MAX_QUOTATION_LINES + 1 }, () => line) }, "SQ-1")).toThrow(/melebihi batas 500/);
  });
});
