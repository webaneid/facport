import { describe, test, expect } from "bun:test";
import { findNumberColumn, findBillNumberColumn, invoiceNumberOf, sortByInvoiceNumber, siblingRowNumbersOf, type BatchRow } from "./purchase-invoice-batch-helpers";

// § Fase 81 — mirror `sales-invoice-batch-helpers.test.ts` (Fase 63).
// Feedback client: "Bill No boleh sama walau beda transaksi, tapi Trans
// No harus unik per transaksi" — kolom "Nomor Transaksi" di halaman
// batch detail (sebelumnya "Nomor Faktur") sekarang DIUTAMAKAN Trans No
// (field `number`), fallback Bill No, SINKRON dengan backend
// `groupPurchaseInvoiceRows` (Fase 81).
function makeRow(id: string, rowNumber: number, rawData: Record<string, unknown>): BatchRow {
  return { id, rowNumber, rawData };
}

describe("findNumberColumn / findBillNumberColumn", () => {
  test("cari kolom Excel yang termapping ke field number/billNumber", () => {
    const mapping = { "Trans No": "number", "Bill No": "billNumber", "Item No": "itemNo" };
    expect(findNumberColumn(mapping)).toBe("Trans No");
    expect(findBillNumberColumn(mapping)).toBe("Bill No");
  });

  test("null kalau columnMapping null atau field tidak termapping", () => {
    expect(findNumberColumn(null)).toBeNull();
    expect(findBillNumberColumn({ "Item No": "itemNo" })).toBeNull();
  });
});

describe("invoiceNumberOf", () => {
  test("Trans No DIUTAMAKAN dari Bill No kalau keduanya terisi", () => {
    const row = makeRow("r1", 1, { "Trans No": "TRX-001", "Bill No": "INV-999" });
    expect(invoiceNumberOf(row, "Trans No", "Bill No")).toBe("TRX-001");
  });

  test("fallback ke Bill No kalau Trans No kosong di baris itu", () => {
    const row = makeRow("r1", 1, { "Trans No": "", "Bill No": "INV-999" });
    expect(invoiceNumberOf(row, "Trans No", "Bill No")).toBe("INV-999");
  });

  test("fallback ke Bill No kalau kolom Trans No tidak termapping sama sekali", () => {
    const row = makeRow("r1", 1, { "Bill No": "INV-999" });
    expect(invoiceNumberOf(row, null, "Bill No")).toBe("INV-999");
  });

  test("string kosong kalau keduanya tidak termapping/tidak terisi", () => {
    const row = makeRow("r1", 1, {});
    expect(invoiceNumberOf(row, null, null)).toBe("");
  });
});

describe("siblingRowNumbersOf — deteksi baris satu faktur", () => {
  test("2 baris dengan Trans No sama = satu faktur, WALAU Bill No beda-beda (boleh sama/beda per Accurate)", () => {
    const rows = [
      makeRow("r1", 1, { "Trans No": "TRX-001", "Bill No": "INV-A" }),
      makeRow("r2", 2, { "Trans No": "TRX-001", "Bill No": "INV-B" }), // Bill No BEDA, tapi Trans No SAMA
      makeRow("r3", 3, { "Trans No": "TRX-002", "Bill No": "INV-A" }), // Trans No BEDA -> faktur lain, walau Bill No sama kayak r1
    ];
    expect(siblingRowNumbersOf(rows[0]!, rows, "Trans No", "Bill No")).toEqual([2]);
    expect(siblingRowNumbersOf(rows[2]!, rows, "Trans No", "Bill No")).toEqual([]);
  });
});

describe("sortByInvoiceNumber", () => {
  test("urut berdasarkan Trans No (bukan Bill No) kalau Trans No termapping", () => {
    const rows = [makeRow("r1", 1, { "Trans No": "TRX-002" }), makeRow("r2", 2, { "Trans No": "TRX-001" })];
    const sorted = sortByInvoiceNumber(rows, "Trans No", null);
    expect(sorted.map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});
