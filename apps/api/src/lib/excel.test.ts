import { describe, test, expect } from "bun:test";
import * as XLSX from "xlsx";
import { parseExcelBuffer } from "./excel";

function bufferFromRows(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// § BUG DITEMUKAN 2026-09-11 (client retest Purchase Payment nyata,
// error Accurate "Nilai Pembayaran tidak mencukupi") — header Excel
// dengan spasi nyempil (" Payment ") bikin `rawRow[trimmedName]` di
// SEMUA builder payload gagal diam-diam (balik undefined -> default 0).
describe("parseExcelBuffer — header dengan spasi nyempil (bug fix)", () => {
  test("header punya spasi di depan/belakang -> headers DAN key rows sama-sama trimmed, value tetap ketemu", () => {
    const buffer = bufferFromRows([[" Payment ", "Invoice No"], [100000, "INV-1"]]);
    const { headers, rows } = parseExcelBuffer(buffer);
    expect(headers).toEqual(["Payment", "Invoice No"]);
    expect(rows).toEqual([{ Payment: 100000, "Invoice No": "INV-1" }]);
    // § inti bug: SEBELUM fix, rows[0] punya key " Payment " (mentah),
    // sehingga lookup pakai nama trimmed "Payment" (dari columnMapping)
    // balik undefined -> nilai 100000 hilang diam-diam.
    expect(rows[0]!["Payment"]).toBe(100000);
    expect(rows[0]![" Payment "]).toBeUndefined();
  });

  test("header TANPA spasi nyempil -> tetap jalan seperti biasa (zero regression)", () => {
    const buffer = bufferFromRows([["Payment", "Invoice No"], [500000, "INV-2"]]);
    const { headers, rows } = parseExcelBuffer(buffer);
    expect(headers).toEqual(["Payment", "Invoice No"]);
    expect(rows).toEqual([{ Payment: 500000, "Invoice No": "INV-2" }]);
  });

  test("beberapa baris, sebagian kolom kosong (defval) -> key tetap konsisten trimmed", () => {
    const buffer = bufferFromRows([[" Trans No ", " Amount "], ["OP-1", 1000], ["OP-2", ""]]);
    const { rows } = parseExcelBuffer(buffer);
    expect(rows).toEqual([
      { "Trans No": "OP-1", Amount: 1000 },
      { "Trans No": "OP-2", Amount: "" },
    ]);
  });
});
