import { describe, test, expect } from "bun:test";
import { accurateResultText } from "./accurate-result-text";

describe("accurateResultText", () => {
  test("prioritas: nomor transaksi > id internal berlabel > pesan error > '-'", () => {
    expect(accurateResultText({ accurateTransactionNumber: "ADJ.2026.10.00001", accurateTransactionId: "1250", errorMessage: null })).toBe("ADJ.2026.10.00001");
    expect(accurateResultText({ accurateTransactionNumber: null, accurateTransactionId: "1250", errorMessage: null })).toBe("ID internal 1250");
    expect(accurateResultText({ accurateTransactionId: null, errorMessage: "Barang tidak ditemukan" })).toBe("Barang tidak ditemukan");
    expect(accurateResultText({ accurateTransactionId: null, errorMessage: null })).toBe("-");
  });
});
