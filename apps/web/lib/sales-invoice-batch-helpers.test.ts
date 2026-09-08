import { describe, test, expect } from "bun:test";
import { findNumberColumn, findPoNumberColumn, invoiceNumberOf, sortByInvoiceNumber, siblingRowNumbersOf, type BatchRow } from "./sales-invoice-batch-helpers";

// § Fase 63 — feedback client: "PO Number/Bill No boleh sama walau beda
// transaksi, tapi Trans No harus unik per transaksi" — kolom "Nomor
// Transaksi" di halaman batch detail (sebelumnya "Nomor Faktur")
// sekarang DIUTAMAKAN Trans No (field `number`), fallback PO Number,
// SINKRON dengan backend `groupSalesInvoiceRows` (Fase 49).
function makeRow(id: string, rowNumber: number, rawData: Record<string, unknown>): BatchRow {
  return { id, rowNumber, rawData };
}

describe("findNumberColumn / findPoNumberColumn", () => {
  test("cari kolom Excel yang termapping ke field number/poNumber", () => {
    const mapping = { "Trans No": "number", "PO Number": "poNumber", "Item No": "itemNo" };
    expect(findNumberColumn(mapping)).toBe("Trans No");
    expect(findPoNumberColumn(mapping)).toBe("PO Number");
  });

  test("null kalau columnMapping null atau field tidak termapping", () => {
    expect(findNumberColumn(null)).toBeNull();
    expect(findPoNumberColumn({ "Item No": "itemNo" })).toBeNull();
  });
});

describe("invoiceNumberOf", () => {
  test("Trans No DIUTAMAKAN dari PO Number kalau keduanya terisi", () => {
    const row = makeRow("r1", 1, { "Trans No": "TRX-001", "PO Number": "PO-999" });
    expect(invoiceNumberOf(row, "Trans No", "PO Number")).toBe("TRX-001");
  });

  test("fallback ke PO Number kalau Trans No kosong di baris itu", () => {
    const row = makeRow("r1", 1, { "Trans No": "", "PO Number": "PO-999" });
    expect(invoiceNumberOf(row, "Trans No", "PO Number")).toBe("PO-999");
  });

  test("fallback ke PO Number kalau kolom Trans No tidak termapping sama sekali", () => {
    const row = makeRow("r1", 1, { "PO Number": "PO-999" });
    expect(invoiceNumberOf(row, null, "PO Number")).toBe("PO-999");
  });

  test("string kosong kalau keduanya tidak termapping/tidak terisi", () => {
    const row = makeRow("r1", 1, {});
    expect(invoiceNumberOf(row, null, null)).toBe("");
  });
});

describe("siblingRowNumbersOf — deteksi baris satu faktur", () => {
  test("2 baris dengan Trans No sama = satu faktur, WALAU PO Number beda-beda (boleh sama/beda per Accurate)", () => {
    const rows = [
      makeRow("r1", 1, { "Trans No": "TRX-001", "PO Number": "PO-A" }),
      makeRow("r2", 2, { "Trans No": "TRX-001", "PO Number": "PO-B" }), // PO Number BEDA, tapi Trans No SAMA
      makeRow("r3", 3, { "Trans No": "TRX-002", "PO Number": "PO-A" }), // Trans No BEDA -> faktur lain, walau PO Number sama kayak r1
    ];
    expect(siblingRowNumbersOf(rows[0]!, rows, "Trans No", "PO Number")).toEqual([2]);
    expect(siblingRowNumbersOf(rows[2]!, rows, "Trans No", "PO Number")).toEqual([]);
  });
});

describe("sortByInvoiceNumber", () => {
  test("urut berdasarkan Trans No (bukan PO Number) kalau Trans No termapping", () => {
    const rows = [makeRow("r1", 1, { "Trans No": "TRX-002" }), makeRow("r2", 2, { "Trans No": "TRX-001" })];
    const sorted = sortByInvoiceNumber(rows, "Trans No", null);
    expect(sorted.map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});
