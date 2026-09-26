import { describe, test, expect } from "bun:test";
import * as XLSX from "xlsx";
import { generateTemplateBuffer, generateFailedRowsBuffer, sanitizeFilenamePart, parseExcelBuffer, type TemplateFieldGuide } from "./excel";

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

// § Fase 147 — Excel client Work Order mengulang nama kolom antar-section.
describe("parseExcelBuffer — header duplikat", () => {
  test("kemunculan ke-2+ diberi akhiran _1, _2 dan `headers` cocok dengan key baris", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Project No", "Qty", "Project No", "Project No"],
      ["P-A", 1, "P-B", "P-C"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const parsed = parseExcelBuffer(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);
    expect(parsed.headers).toEqual(["Project No", "Qty", "Project No_1", "Project No_2"]);
    for (const header of parsed.headers) expect(parsed.rows[0]).toHaveProperty(header);
    expect(parsed.rows[0]).toMatchObject({ "Project No": "P-A", "Project No_1": "P-B", "Project No_2": "P-C" });
  });
});

// § Fase 148/149 — `generateTemplateBuffer` dengan baris contoh TAMBAHAN (Material Slip/Finished Good Slip: 1 dokumen
// bisa punya banyak barang/baris lanjutan serial, tidak cukup diperagakan 1 baris contoh saja).
describe("generateTemplateBuffer — baris contoh tambahan (extraExampleRows)", () => {
  const fields: TemplateFieldGuide[] = [
    { column: "Trans No", required: false, example: "T-1", description: "" },
    { column: "Item No", required: true, example: "A", description: "" },
    { column: "Qty", required: false, example: "1", description: "" },
    { column: "Serial No", required: false, example: "", description: "" },
    { column: "Qty", required: false, example: "", description: "" }, // § kolom BERULANG, sama seperti kasus nyata
  ];

  test("tanpa extraExampleRows → perilaku lama, cuma 1 baris contoh (backward compatible)", () => {
    const parsed = parseExcelBuffer(generateTemplateBuffer(fields));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ "Trans No": "T-1", "Item No": "A", Qty: "1" });
  });

  test("dengan extraExampleRows → baris tambahan ikut muncul, kolom yang tidak disebut dikosongkan", () => {
    const buffer = generateTemplateBuffer(fields, [
      [
        { column: "Trans No", value: "T-1" },
        { column: "Item No", value: "B" },
        { column: "Serial No", value: "S1" },
        { column: "Qty", value: 5 }, // § kemunculan PERTAMA "Qty" (Qty barang)
      ],
    ]);
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1]).toMatchObject({ "Trans No": "T-1", "Item No": "B", "Serial No": "S1", Qty: 5 });
    expect(parsed.rows[1]!["Qty_1"]).toBe(""); // § kemunculan KEDUA "Qty" tidak disebut → kosong, bukan ikut ke-isi salah
  });

  test("kolom BERULANG di overrides diisi berurutan (FIFO) ke kemunculan ke-1, ke-2, dst — TIDAK menimpa satu sama lain", () => {
    const buffer = generateTemplateBuffer(fields, [
      [
        { column: "Item No", value: "C" },
        { column: "Qty", value: 10 }, // kemunculan ke-1 "Qty"
        { column: "Qty", value: 99 }, // kemunculan ke-2 "Qty"
      ],
    ]);
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.rows[1]).toMatchObject({ "Item No": "C", Qty: 10, Qty_1: 99 });
  });
});

// § diminta user 2026-09-27 — download baris gagal sebagai Excel, generik
// lintas 23 modul import (dipanggil dari `{module}-import.route.ts`
// masing-masing).
describe("generateFailedRowsBuffer — export baris gagal ke Excel", () => {
  const columnMapping = { "Cust No": "customerNo", "Trans No": "number" };
  const canonicalFieldOrder = ["customerNo", "number"];

  test("kolom output PERSIS kolom Excel asli (dari rawData), ditambah 1 kolom 'Pesan Error' di akhir", () => {
    const buffer = generateFailedRowsBuffer(
      [
        { rawData: { "Cust No": "C-001", "Trans No": "SQ-001" }, errorMessage: "Item tidak ditemukan" },
        { rawData: { "Cust No": "C-002", "Trans No": "SQ-002" }, errorMessage: "Customer tidak ditemukan" },
      ],
      columnMapping,
      canonicalFieldOrder,
    );
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.headers).toEqual(["Cust No", "Trans No", "Pesan Error"]);
    expect(parsed.rows).toEqual([
      { "Cust No": "C-001", "Trans No": "SQ-001", "Pesan Error": "Item tidak ditemukan" },
      { "Cust No": "C-002", "Trans No": "SQ-002", "Pesan Error": "Customer tidak ditemukan" },
    ]);
  });

  // § BUG DITEMUKAN nulis test ini (2026-09-27) — Postgres `jsonb`
  // TIDAK menjamin urutan key sama dengan input (dikonfirmasi query
  // langsung: `{"Customer Number":..,"Item Number":..}` bisa balik
  // terbalik urutannya). Kolom MAPPED wajib diurutkan dari
  // `canonicalFieldOrder` (array biasa, bukan dari jsonb), BUKAN dari
  // `Object.keys(rawData)` — test ini simulasikan rawData yang urutannya
  // SUDAH DIACAK (seolah abis round-trip DB) untuk kunci perilakunya.
  test("urutan kolom MAPPED ikut canonicalFieldOrder, BUKAN urutan key rawData (simulasi jsonb yang bisa acak urutan)", () => {
    const buffer = generateFailedRowsBuffer(
      // § rawData sengaja "Trans No" duluan (urutan KEBALIK dari canonicalFieldOrder) — simulasi jsonb reorder.
      [{ rawData: { "Trans No": "SQ-001", "Cust No": "C-001" }, errorMessage: "err" }],
      columnMapping,
      canonicalFieldOrder,
    );
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.headers).toEqual(["Cust No", "Trans No", "Pesan Error"]);
  });

  test("kolom yang TIDAK di-mapping (ekstra di Excel asli) tetap ikut, ditaruh SETELAH kolom mapped, diurutkan alfabetis", () => {
    const buffer = generateFailedRowsBuffer(
      [{ rawData: { "Cust No": "C-001", "Trans No": "SQ-001", "Catatan Internal": "x", "Kolom Lain": "y" }, errorMessage: "err" }],
      columnMapping,
      canonicalFieldOrder,
    );
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.headers).toEqual(["Cust No", "Trans No", "Catatan Internal", "Kolom Lain", "Pesan Error"]);
  });

  test("errorMessage null -> sel 'Pesan Error' kosong, bukan literal 'null'", () => {
    const buffer = generateFailedRowsBuffer([{ rawData: { "Item No": "BRG-01" }, errorMessage: null }], {}, []);
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.rows[0]!["Pesan Error"]).toBe("");
  });

  test("tidak ada baris gagal -> tetap balikin buffer valid (sheet kosong), tidak throw", () => {
    const buffer = generateFailedRowsBuffer([], {}, []);
    expect(() => parseExcelBuffer(buffer)).not.toThrow();
  });
});

describe("sanitizeFilenamePart — cegah header injection dari nama file upload asli", () => {
  test("nama file normal tidak berubah", () => {
    expect(sanitizeFilenamePart("template-sales-quotation (10k Baris)")).toBe("template-sales-quotation (10k Baris)");
  });

  test('tanda kutip ganda dibuang (cegah "kabur" dari atribut quoted-string Content-Disposition)', () => {
    expect(sanitizeFilenamePart('nama"jahat.xlsx')).toBe("namajahat.xlsx");
  });

  test("CR/LF dibuang (cegah header injection)", () => {
    expect(sanitizeFilenamePart("nama\r\nX-Evil-Header: 1")).toBe("namaX-Evil-Header: 1");
  });

  test("backslash dibuang", () => {
    expect(sanitizeFilenamePart("nama\\file.xlsx")).toBe("namafile.xlsx");
  });

  test("string kosong setelah sanitasi -> fallback 'file'", () => {
    expect(sanitizeFilenamePart('"\r\n')).toBe("file");
  });
});
