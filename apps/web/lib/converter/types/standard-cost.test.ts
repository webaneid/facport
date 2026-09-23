import { describe, test, expect } from "bun:test";
import { standardCostType } from "./standard-cost";
import { converterHasData } from "../converter-type";

const opts = { branch: "HO", defCurrency: "IDR" };
const rows = [
  { Kode_Barang: "CB", Harga_Pokok_Standar: 6500, Harga_Jual_1: 7500, Harga_Jual_2: 0, Harga_Jual_3: 0, Harga_Jual_4: 0, Harga_Jual_5: 0, Tgl_Berlaku: "2026-01-15" },
  { Kode_Barang: "RK", Harga_Pokok_Standar: 5000, Harga_Jual_1: 7500, Harga_Jual_2: 0, Harga_Jual_3: 0, Harga_Jual_4: 0, Harga_Jual_5: 0, Tgl_Berlaku: "" },
  { Kode_Barang: "DB", Harga_Pokok_Standar: 16000, Harga_Jual_1: 17500, Harga_Jual_2: 0, Harga_Jual_3: 0, Harga_Jual_4: 0, Harga_Jual_5: 0, Tgl_Berlaku: "" },
];

describe("standardCostType.process — SATU-SATUNYA tipe pakai `items` FLAT, bukan `order`/`groups` (mirror tool.html baris 571-587)", () => {
  test("3 baris → 3 items, TANPA grouping (setiap Kode_Barang berdiri sendiri)", () => {
    const ctx = standardCostType.process(rows, opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.items.length).toBe(3);
    expect(ctx.items.map((i) => i.itemNo)).toEqual(["CB", "RK", "DB"]);
  });
  test("Tgl_Berlaku dibaca dari BARIS PERTAMA yang terisi (bukan baris terakhir/gabungan)", () => {
    const ctx = standardCostType.process(rows, opts);
    expect(ctx.eff).toBe("2026-01-15");
  });
  test("Tgl_Berlaku semua kosong → eff null (pakai default Accurate)", () => {
    const ctx = standardCostType.process(rows.map((r) => ({ ...r, Tgl_Berlaku: "" })), opts);
    expect(ctx.eff).toBeNull();
  });
  test("Kode_Barang duplikat → warning 'muncul lebih dari sekali' (BUKAN error, baris terakhir menang di Accurate)", () => {
    const ctx = standardCostType.process([rows[0]!, { ...rows[0]!, Harga_Pokok_Standar: 7000 }], opts);
    expect(ctx.warnings.some((w) => w.includes("muncul lebih dari sekali"))).toBe(true);
    expect(ctx.items.length).toBe(2); // KEDUA baris tetap masuk items (dedupe terjadi di sisi Accurate, bukan kita)
  });
  test("Harga_Pokok_Standar negatif → error", () => {
    const ctx = standardCostType.process([{ ...rows[0]!, Harga_Pokok_Standar: -100 }], opts);
    expect(ctx.errors.some((e) => e.includes("Harga_Pokok_Standar tidak valid"))).toBe(true);
  });
  test("Harga_Jual_N negatif → error menyebutkan N yang tepat", () => {
    const ctx = standardCostType.process([{ ...rows[0]!, Harga_Jual_3: -50 }], opts);
    expect(ctx.errors.some((e) => e.includes("Harga_Jual_3 negatif"))).toBe(true);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = standardCostType.process([{ Kode_Barang: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("standardCostType.build — SEMUA baris masuk 1 transaksi TUNGGAL (mirror tool.html baris 589-593)", () => {
  test("3 items — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = standardCostType.process(rows, opts);
    const xml = standardCostType.build(ctx);
    const expectedInner =
      '<MATERIALSTANDARDCOST operation="Add" REQUESTID="1"><ID>1</ID><TRANSACTIONID>1</TRANSACTIONID><MATERIALSTDCOSTDET operation="Add"><ITEMNO>CB</ITEMNO><STANDARDCOST>6500</STANDARDCOST><PRICE1>7500</PRICE1><PRICE2>0</PRICE2><PRICE3>0</PRICE3><PRICE4>0</PRICE4><PRICE5>0</PRICE5></MATERIALSTDCOSTDET><MATERIALSTDCOSTDET operation="Add"><ITEMNO>RK</ITEMNO><STANDARDCOST>5000</STANDARDCOST><PRICE1>7500</PRICE1><PRICE2>0</PRICE2><PRICE3>0</PRICE3><PRICE4>0</PRICE4><PRICE5>0</PRICE5></MATERIALSTDCOSTDET><MATERIALSTDCOSTDET operation="Add"><ITEMNO>DB</ITEMNO><STANDARDCOST>16000</STANDARDCOST><PRICE1>17500</PRICE1><PRICE2>0</PRICE2><PRICE3>0</PRICE3><PRICE4>0</PRICE4><PRICE5>0</PRICE5></MATERIALSTDCOSTDET><STANDARDNO/><STANDARDDATE>2026-01-15</STANDARDDATE><EFFECTIVEDATE>2026-01-15</EFFECTIVEDATE><DESCRIPTION/></MATERIALSTANDARDCOST>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedInner + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("eff null → STANDARDDATE/EFFECTIVEDATE self-closing", () => {
    const ctx = standardCostType.process(rows.map((r) => ({ ...r, Tgl_Berlaku: "" })), opts);
    const xml = standardCostType.build(ctx);
    expect(xml).toContain("<STANDARDDATE/><EFFECTIVEDATE/>");
  });
});

describe("standardCostType.summary — mirror tool.html baris 595-598", () => {
  test("stats [Barang, Error, Peringatan] — TANPA baris dokumen (beda dari 15 tipe transaksi lain)", () => {
    const summary = standardCostType.summary(standardCostType.process(rows, opts));
    expect(summary.stats).toEqual([[3, "Barang"], [0, "Error"], [0, "Peringatan"]]);
    expect(summary.totals).toBe("3 barang akan diperbarui harga pokok & jualnya.");
    expect(summary.rowCount).toBe(3);
  });
});

// § Fase 156 — regresi ditemukan saat porting tipe ini: `converterHasData` (generik, dipakai `ConverterTypeView`
// SEMUA tipe) WAJIB kenali `items` (stdcost), TIDAK CUMA `order` (15 tipe lain).
describe("converterHasData — duck-typing lintas 2 bentuk Ctx (order vs items)", () => {
  test("ctx.items terisi → true (walau tidak ada ctx.order sama sekali)", () => {
    const ctx = standardCostType.process(rows, opts);
    expect(converterHasData(ctx)).toBe(true);
  });
  test("file kosong (0 baris) → items=[], hasData FALSE walau errors=[] (0 error di file kosong BUKAN valid)", () => {
    const ctx = standardCostType.process([], opts);
    expect(ctx.errors).toEqual([]);
    expect(converterHasData(ctx)).toBe(false);
  });
});
