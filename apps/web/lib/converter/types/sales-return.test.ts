import { describe, test, expect } from "bun:test";
import { salesReturnType } from "./sales-return";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Retur: "RJ/2026/001", Tgl_Retur: "2026-01-17", ID_Pelanggan: "1001", No_Faktur_Penjualan: "DP-BG-011", Kode_Barang: "AC-Chang", Deskripsi: "AC Changhong CS-C09P3", Satuan: "set", Kuantitas: 1, Harga_Satuan: 2300000, Gudang: "ELEKTRONIK", Kode_Pajak: "T", Tarif_Pajak: 11, No_Faktur_Pajak: "", Mata_Uang: "IDR", Project: "PBT.005", Departemen: "1000" };

describe("salesReturnType.process — validasi (mirror tool.html baris 1196-1212, PENUTUP seluruh 16 Varian)", () => {
  test("No_Faktur_Penjualan kosong → error (wajib nomor faktur asal di Accurate)", () => {
    const ctx = salesReturnType.process([{ ...row, No_Faktur_Penjualan: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Faktur_Penjualan kosong"))).toBe(true);
  });
  test("Kode_Pajak diisi tapi Tarif_Pajak 0 → warning", () => {
    const ctx = salesReturnType.process([{ ...row, Tarif_Pajak: 0 }], opts);
    expect(ctx.warnings.some((w) => w.includes("PPN retur dihitung 0"))).toBe(true);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = salesReturnType.process([{ No_Retur: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("salesReturnType.build — struktur XML PERSIS mirror tool.html baris 1214-1227", () => {
  test("1 retur 1 baris — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = salesReturnType.process([row], opts);
    const xml = salesReturnType.build(ctx);
    const expectedBody =
      '<SALESRETURN operation="Add" REQUESTID="1"><ARREFUNDID/><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>1</KeyID><ITEMNO>AC-Chang</ITEMNO><QUANTITY>1</QUANTITY><ITEMUNIT>set</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>AC Changhong CS-C09P3</ITEMOVDESC><UNITPRICE/><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PBT.005</PROJECTID><DEPTID>1000</DEPTID><GROUPSEQ/><SOSEQ/><BRUTTOUNITPRICE>2300000</BRUTTOUNITPRICE><WAREHOUSEID>ELEKTRONIK</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><INVDO/><INVID>DP-BG-011</INVID><DOID/><INVOICESEQ>1</INVOICESEQ></ITEMLINE><INVOICENO>RJ/2026/001</INVOICENO><INVOICEDATE>2026-01-17</INVOICEDATE><GLYEAR>2026</GLYEAR><GLPERIOD>1</GLPERIOD><TAX1ID>T</TAX1ID><TAX2ID/><TAX1CODE>T</TAX1CODE><TAX2CODE/><TAX1RATE>11</TAX1RATE><TAX2RATE>0</TAX2RATE><TAX1AMOUNT>253000</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE/><INCLUSIVETAX>0</INCLUSIVETAX><CUSTOMERISTAXABLE/><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>2553000</INVOICEAMOUNT><DESCRIPTION/><WAREHOUSEID>ELEKTRONIK</WAREHOUSEID><TAXNO></TAXNO><CUSTOMERID>1001</CUSTOMERID><ARINVOICEID/><SALESINVOICEID>DP-BG-011</SALESINVOICEID><DELIVERYORDERID/><CURRENCYNAME>IDR</CURRENCYNAME></SALESRETURN>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("GLYEAR/GLPERIOD diambil dari tanggal retur (2026-01 → year=2026, period=1 TANPA zero-pad)", () => {
    const ctx = salesReturnType.process([row], opts);
    expect(salesReturnType.build(ctx)).toContain("<GLYEAR>2026</GLYEAR><GLPERIOD>1</GLPERIOD>");
  });
});

describe("salesReturnType.summary — mirror tool.html baris 1229-1233", () => {
  test("totals termasuk PPN + reminder validasi manual No_Faktur_Penjualan", () => {
    const summary = salesReturnType.summary(salesReturnType.process([row], opts));
    expect(summary.totals).toBe("2.553.000 termasuk PPN — tiap No_Faktur_Penjualan harus sudah ada di Accurate");
    expect(summary.rowCount).toBe(1);
  });
});
