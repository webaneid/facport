import { describe, test, expect } from "bun:test";
import { converterHasData } from "./converter-type";
import { requisitionType } from "./types/requisition";

// § Fase 156 — regresi: `converterHasData` WAJIB benar untuk KEDUA bentuk `Ctx` (`order`-based, 15 tipe transaksi
// sejak Fase 151, dan `items`-based, `stdcost` satu-satunya sejak Fase 156). Test tipe `order`-based di sini
// (bentuk `items`-based dites langsung di `standard-cost.test.ts`).
describe("converterHasData — bentuk order-based (15 tipe transaksi dokumen)", () => {
  test("file kosong (0 baris) → order=[], hasData FALSE walau errors=[] — TOMBOL DOWNLOAD HARUS TETAP NONAKTIF", () => {
    const ctx = requisitionType.process([], { branch: "HO", defCurrency: "IDR" });
    expect(ctx.errors).toEqual([]);
    expect(ctx.order).toEqual([]);
    expect(converterHasData(ctx)).toBe(false);
  });

  test("file dengan 1 baris valid → order terisi → hasData TRUE", () => {
    const ctx = requisitionType.process(
      [{ No_Permintaan: "X", Tgl_Permintaan: "2026-01-01", Kode_Barang: "Y", Kuantitas: 1 }],
      { branch: "HO", defCurrency: "IDR" },
    );
    expect(converterHasData(ctx)).toBe(true);
  });

  test("SEMUA baris gagal validasi paling awal (No_Permintaan kosong) → order tetap [] → hasData FALSE", () => {
    const ctx = requisitionType.process([{ No_Permintaan: "", Tgl_Permintaan: "2026-01-01", Kode_Barang: "Y", Kuantitas: 1 }], { branch: "HO", defCurrency: "IDR" });
    expect(ctx.order).toEqual([]);
    expect(converterHasData(ctx)).toBe(false);
  });
});
