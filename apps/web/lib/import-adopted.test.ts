import { describe, test, expect } from "bun:test";
import { isAdoptedRow } from "./import-adopted";

describe("isAdoptedRow", () => {
  test("sukses + keterangan 'Sudah ada di Accurate …' → ya", () => {
    expect(isAdoptedRow({ status: "success", errorMessage: "Sudah ada di Accurate — Faktur Penjualan \"X\" (ID 1) …" })).toBe(true);
  });
  test("sukses biasa, gagal, atau keterangan lain → tidak", () => {
    expect(isAdoptedRow({ status: "success", errorMessage: null })).toBe(false);
    expect(isAdoptedRow({ status: "failed", errorMessage: "Sudah ada di Accurate …" })).toBe(false);
    expect(isAdoptedRow({ status: "success", errorMessage: "catatan lain" })).toBe(false);
  });
});
