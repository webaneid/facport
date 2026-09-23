import { describe, test, expect } from "bun:test";
import { deliveryOrderType } from "./delivery-order";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_DO: "DO/2026/001", Tgl_DO: "2026-01-25", ID_Pelanggan: "1001", Kode_Barang: "AC-Gen", Deskripsi: "AC General LCT 12", Satuan: "set", Kuantitas: 1, Harga_Satuan: 3850000, Gudang: "ELEKTRONIK", Kode_Pajak: "T", No_SO: "SO/2026/001", Tgl_Kirim: "2026-01-25", Mata_Uang: "IDR", Project: "PBT.005", Departemen: "1000" };

describe("deliveryOrderType.process — validasi, No_SO opsional (mirror tool.html baris 1039-1053)", () => {
  test("No_SO kosong → boleh (DO lepas, tanpa referensi SO)", () => {
    const ctx = deliveryOrderType.process([{ ...row, No_SO: "" }], opts);
    expect(ctx.errors).toEqual([]);
  });
  test("Harga_Satuan kosong/negatif → fallback 0 (BUKAN error, beda dari tipe lain)", () => {
    const ctx = deliveryOrderType.process([{ ...row, Harga_Satuan: -5 }], opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.groups["DO/2026/001"]!.lines[0]!.price).toBe(0);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = deliveryOrderType.process([{ No_DO: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("deliveryOrderType.build — struktur XML PERSIS mirror tool.html baris 1055-1064, INVOICEAMOUNT SELALU 0 (DO tidak menagih)", () => {
  test("1 DO 1 baris referensi SO — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = deliveryOrderType.process([row], opts);
    const xml = deliveryOrderType.build(ctx);
    const expectedBody =
      '<DELIVERYORDER operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>1</KeyID><ITEMNO>AC-Gen</ITEMNO><QUANTITY>1</QUANTITY><ITEMUNIT>set</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>AC General LCT 12</ITEMOVDESC><UNITPRICE>3850000</UNITPRICE><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PBT.005</PROJECTID><DEPTID>1000</DEPTID><GROUPSEQ/><SOSEQ>0</SOSEQ><BRUTOUNITPRICE>3850000</BRUTOUNITPRICE><WAREHOUSEID>ELEKTRONIK</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><DOSEQ/><SOID>SO/2026/001</SOID><DOID/></ITEMLINE><INVOICENO>DO/2026/001</INVOICENO><INVOICEDATE>2026-01-25</INVOICEDATE><INVOICEAMOUNT>0</INVOICEAMOUNT><PURCHASEORDERNO/><WAREHOUSEID>ELEKTRONIK</WAREHOUSEID><DESCRIPTION/><SHIPDATE>2026-01-25</SHIPDATE><DELIVERYORDER></DELIVERYORDER><CUSTOMERID>1001</CUSTOMERID><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><CURRENCYNAME>IDR</CURRENCYNAME><AUTOMATICINSERTGROUPING/></DELIVERYORDER>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("No_SO kosong → SOID dan SOSEQ self-closing (DO lepas)", () => {
    const ctx = deliveryOrderType.process([{ ...row, No_SO: "" }], opts);
    const xml = deliveryOrderType.build(ctx);
    expect(xml).toContain("<SOID/>");
    expect(xml).toContain("<SOSEQ/>");
  });
});

describe("deliveryOrderType.summary — mirror tool.html baris 1066-1070", () => {
  test("totals total kuantitas + reminder DO memotong stok", () => {
    const summary = deliveryOrderType.summary(deliveryOrderType.process([row], opts));
    expect(summary.totals).toBe("1 total kuantitas keluar — DO memotong stok gudang");
    expect(summary.rowCount).toBe(1);
  });
});
