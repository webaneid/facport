import { describe, test, expect } from "bun:test";
import { salesOrderType } from "./sales-order";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_SO: "SO/2026/001", Tgl_SO: "2026-01-27", ID_Pelanggan: "1001", Kode_Barang: "FG-0047", Deskripsi: "Office Inspire", Satuan: "unit", Kuantitas: 1, Harga_Satuan: 50000000, Kena_Pajak: 1, Kode_Pajak: "T", Tarif_Pajak: 11, Pajak_Inklusif: 0, Termin: "2/10 n/30", Uang_Muka: 30000000, Akun_Uang_Muka: "2102-001", Tgl_Estimasi_Kirim: "2026-02-10", No_PO_Pelanggan: "PO-123", Mata_Uang: "IDR", Kurs: 1, Project: "PBT.005", Departemen: "1000" };

describe("salesOrderType.process — validasi (mirror tool.html baris 744-761)", () => {
  test("Uang_Muka > 0 tapi Akun_Uang_Muka kosong → warning", () => {
    const ctx = salesOrderType.process([{ ...row, Akun_Uang_Muka: "" }], opts);
    expect(ctx.warnings.some((w) => w.includes("Akun_Uang_Muka kosong"))).toBe(true);
  });
  test("2 baris No_SO sama → digabung 1 pesanan", () => {
    const row2 = { ...row, Kode_Barang: "FG-0050", Deskripsi: "Meja Kantor", Kuantitas: 5, Harga_Satuan: 2000000 };
    const ctx = salesOrderType.process([row, row2], opts);
    expect(ctx.order).toEqual(["SO/2026/001"]);
    expect(ctx.groups["SO/2026/001"]!.lines.length).toBe(2);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = salesOrderType.process([{ No_SO: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("salesOrderType.build — struktur XML PERSIS mirror tool.html baris 763-778", () => {
  test("1 pesanan 1 baris dengan uang muka — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = salesOrderType.process([row], opts);
    const xml = salesOrderType.build(ctx);
    const expectedBody =
      '<SALESORDER operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>0</KeyID><ITEMNO>FG-0047</ITEMNO><QUANTITY>1</QUANTITY><ITEMUNIT>unit</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>Office Inspire</ITEMOVDESC><UNITPRICE>50000000</UNITPRICE><DISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PBT.005</PROJECTID><DEPTID>1000</DEPTID><GROUPSEQ/><QTYSHIPPED>0</QTYSHIPPED></ITEMLINE><SONO>SO/2026/001</SONO><SODATE>2026-01-27</SODATE><TAX1ID>T</TAX1ID><TAX1CODE>T</TAX1CODE><TAX2CODE/><TAX1RATE>11</TAX1RATE><TAX2RATE>0</TAX2RATE><TAX1AMOUNT>5500000</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE>1</RATE><TAXINCLUSIVE>0</TAXINCLUSIVE><CUSTOMERISTAXABLE>1</CUSTOMERISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><FREIGHT>0</FREIGHT><TERMSID>2/10 n/30</TERMSID><FOB/><ESTSHIPDATE>2026-02-10</ESTSHIPDATE><DESCRIPTION/><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><DP>30000000</DP><DPACCOUNTID>2102-001</DPACCOUNTID><DPUSED/><CUSTOMERID>1001</CUSTOMERID><PONO>PO-123</PONO><CURRENCYNAME>IDR</CURRENCYNAME></SALESORDER>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("Tgl_Estimasi_Kirim kosong → ESTSHIPDATE fallback ke Tgl_SO", () => {
    const ctx = salesOrderType.process([{ ...row, Tgl_Estimasi_Kirim: "" }], opts);
    expect(salesOrderType.build(ctx)).toContain("<ESTSHIPDATE>2026-01-27</ESTSHIPDATE>");
  });
});

describe("salesOrderType.summary — mirror tool.html baris 780-784", () => {
  test("totals per currency dengan label '(termasuk PPN)'", () => {
    const summary = salesOrderType.summary(salesOrderType.process([row], opts));
    expect(summary.totals).toBe("55.500.000 IDR (termasuk PPN)");
    expect(summary.rowCount).toBe(1);
  });
});
