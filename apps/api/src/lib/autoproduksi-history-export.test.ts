import { describe, test, expect } from "bun:test";
import * as XLSX from "xlsx";
import { parseHistoryExportRange, buildHistoryExportRows, generateHistoryExportBuffer, formatInputTime, HISTORY_EXPORT_HEADERS, type HistoryExportInput } from "./autoproduksi-history-export";

describe("parseHistoryExportRange — maksimal 2 hari inklusif", () => {
  test("1 hari dan 2 hari diterima (termasuk lintas bulan/tahun/kabisat)", () => {
    expect(parseHistoryExportRange("2026-11-14", "2026-11-14").ok).toBe(true);
    expect(parseHistoryExportRange("2026-11-14", "2026-11-15").ok).toBe(true);
    expect(parseHistoryExportRange("2026-10-31", "2026-11-01").ok).toBe(true);
    expect(parseHistoryExportRange("2026-12-31", "2027-01-01").ok).toBe(true);
    expect(parseHistoryExportRange("2028-02-28", "2028-02-29").ok).toBe(true);
  });
  test("3 hari atau lebih → RANGE_TOO_LONG", () => {
    expect(parseHistoryExportRange("2026-11-14", "2026-11-16")).toEqual({ ok: false, code: "RANGE_TOO_LONG" });
    expect(parseHistoryExportRange("2026-01-01", "2026-12-31")).toEqual({ ok: false, code: "RANGE_TOO_LONG" });
  });
  test("sampai < dari → RANGE_INVALID", () => {
    expect(parseHistoryExportRange("2026-11-15", "2026-11-14")).toEqual({ ok: false, code: "RANGE_INVALID" });
  });
  test("bukan tanggal nyata / format salah → INVALID_DATE", () => {
    for (const [a, b] of [["2026-02-30", "2026-03-01"], ["14/11/2026", "2026-11-14"], ["2026-11-14", "abc"], ["", ""], ["2026-13-01", "2026-13-01"]] as const) {
      expect(parseHistoryExportRange(a, b)).toEqual({ ok: false, code: "INVALID_DATE" });
    }
  });
});

const entry: HistoryExportInput = {
  transDate: "2026-11-14",
  formulaNumber: 2,
  formulaName: "Bolu Kukus",
  finishedGoodItemNo: "100011",
  finishedGoodItemName: "Bolu Kukus SP (Spesial)",
  finishedGoodItemUnitName: "Loyang",
  producedQty: "7.0000",
  branchName: "Cabang 1",
  warehouseName: null,
  rawMaterialWarehouseName: null,
  projectNo: null,
  departmentName: null,
  status: "failed",
  accurateTransactionNumber: null,
  errorMessage: "=HYPERLINK(\"http://x\")",
  createdAt: new Date("2026-11-14T17:30:05Z"),
};

describe("buildHistoryExportRows / generateHistoryExportBuffer", () => {
  test("waktu input memakai zona waktu perusahaan (UTC 17:30 → 00:30 hari berikutnya di Asia/Jakarta)", () => {
    expect(formatInputTime(entry.createdAt, "Asia/Jakarta")).toBe("2026-11-15 00:30:05");
    expect(formatInputTime(entry.createdAt, "UTC")).toBe("2026-11-14 17:30:05");
  });

  test("baris: label status Indonesia, qty angka, kolom kosong jadi string kosong", () => {
    const [row] = buildHistoryExportRows([entry], "Asia/Jakarta");
    expect(row).toMatchObject({ "No. Formula": "F-002", Status: "Gagal", "Qty Produksi": 7, Cabang: "Cabang 1", "Gudang Barang Jadi": "", "Waktu Input": "2026-11-15 00:30:05" });
  });

  test("xlsx: header sesuai urutan, teks berawalan '=' tersimpan sebagai string (bukan rumus)", () => {
    const book = XLSX.read(generateHistoryExportBuffer([entry], "Asia/Jakarta"), { type: "buffer" });
    const sheet = book.Sheets["Riwayat Produksi"]!;
    expect(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]).toEqual([...HISTORY_EXPORT_HEADERS]);
    const galat = sheet["O2"]!;
    expect(galat.t).toBe("s");
    expect(galat.f).toBeUndefined();
    expect(galat.v).toBe("=HYPERLINK(\"http://x\")");
  });

  test("tanpa data → hanya baris header", () => {
    const book = XLSX.read(generateHistoryExportBuffer([], "UTC"), { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(book.Sheets["Riwayat Produksi"]!, { header: 1 })).toHaveLength(1);
  });
});
