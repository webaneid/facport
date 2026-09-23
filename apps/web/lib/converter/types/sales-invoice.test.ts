import { describe, test, expect } from "bun:test";
import { salesInvoiceType } from "./sales-invoice";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Faktur: "INV/2026/001", Tgl_Faktur: "2026-01-15", ID_Pelanggan: "1001", Kode_Barang: "BRG-001", Deskripsi: "HP Model A", Kuantitas: 2, Harga_Satuan: 3500000, Akun_Piutang: "1103-001", Gudang: "DEPAN", Mata_Uang: "IDR", Kurs: 1, Kena_Pajak: 1, Kode_Pajak: "T", Tarif_Pajak: 11, Pajak_Inklusif: 0, Termin: "NET 30", No_Faktur_Pajak: "", Kode_Faktur_Pajak: "", Saldo_Awal: 0, Project: "PRJ-01", Departemen: "DEPT-01" };
const obRow = { No_Faktur: "OB-2001", Tgl_Faktur: "2026-01-01", ID_Pelanggan: "2001", Kode_Barang: "0", Deskripsi: "Opening Balance", Kuantitas: 1, Harga_Satuan: 15000000, Akun_Piutang: "1103-001", Gudang: "DEPAN", Mata_Uang: "IDR", Kurs: 1, Kena_Pajak: 0, Kode_Pajak: "", Tarif_Pajak: 0, Pajak_Inklusif: 0, Termin: "C.O.D", No_Faktur_Pajak: "", Kode_Faktur_Pajak: "", Saldo_Awal: 1, Project: "", Departemen: "" };

describe("salesInvoiceType.process — kasus khusus Saldo Awal (mirror tool.html baris 517-524, PALING KOMPLEKS dari 16 tipe)", () => {
  test("Saldo_Awal=1 + Kena_Pajak=1 → pajak DIMATIKAN OTOMATIS + warning", () => {
    const ctx = salesInvoiceType.process([{ ...obRow, Kena_Pajak: 1, Kode_Pajak: "T", Tarif_Pajak: 11 }], opts);
    expect(ctx.warnings.some((w) => w.includes("Saldo Awal — pajak dimatikan otomatis"))).toBe(true);
    expect(ctx.groups["OB-2001"]!.head.taxable).toBe(0);
    expect(ctx.groups["OB-2001"]!.head.taxRate).toBe(0);
  });
  test("Saldo_Awal=1 + Kode_Barang/Deskripsi kosong → default '0'/'Opening Balance' (BUKAN error)", () => {
    const ctx = salesInvoiceType.process([{ ...obRow, Kode_Barang: "", Deskripsi: "" }], opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.groups["OB-2001"]!.lines[0]!.itemNo).toBe("0");
    expect(ctx.groups["OB-2001"]!.lines[0]!.desc).toBe("Opening Balance");
  });
  test("Saldo_Awal=0 + Kode_Barang kosong → TETAP error (beda dari OB)", () => {
    const ctx = salesInvoiceType.process([{ ...row, Kode_Barang: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("Kode_Barang kosong"))).toBe(true);
  });
  test("2 baris No_Faktur sama → digabung 1 faktur", () => {
    const row2 = { ...row, Kode_Barang: "BRG-002", Deskripsi: "Casing", Kuantitas: 3, Harga_Satuan: 50000 };
    const ctx = salesInvoiceType.process([row, row2], opts);
    expect(ctx.order).toEqual(["INV/2026/001"]);
    expect(ctx.groups["INV/2026/001"]!.lines.length).toBe(2);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = salesInvoiceType.process([{ No_Faktur: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("salesInvoiceType.build — INVOICEAMOUNT TERMASUK PPN (mirror tool.html baris 526-539)", () => {
  test("1 faktur 1 baris kena pajak eksklusif — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = salesInvoiceType.process([row], opts);
    const xml = salesInvoiceType.build(ctx);
    const expectedBody =
      '<SALESINVOICE operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>1</KeyID><ITEMNO>BRG-001</ITEMNO><QUANTITY>2</QUANTITY><ITEMUNIT/><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>HP Model A</ITEMOVDESC><UNITPRICE>3500000</UNITPRICE><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PRJ-01</PROJECTID><DEPTID>DEPT-01</DEPTID><GROUPSEQ/><SOSEQ/><BRUTOUNITPRICE>3500000</BRUTOUNITPRICE><WAREHOUSEID>DEPAN</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><DOSEQ/><DOID/></ITEMLINE><INVOICENO>INV/2026/001</INVOICENO><INVOICEDATE>2026-01-15</INVOICEDATE><TAX1ID>T</TAX1ID><TAX1CODE>T</TAX1CODE><TAX2CODE/><TAX1RATE>11</TAX1RATE><TAX2RATE>0</TAX2RATE><RATE>1</RATE><INCLUSIVETAX>0</INCLUSIVETAX><CUSTOMERISTAXABLE>1</CUSTOMERISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>7770000</INVOICEAMOUNT><FREIGHT>0</FREIGHT><TERMSID>NET 30</TERMSID><FOB/><PURCHASEORDERNO/><WAREHOUSEID>DEPAN</WAREHOUSEID><DESCRIPTION></DESCRIPTION><SHIPDATE>2026-01-15</SHIPDATE><DELIVERYORDER/><FISCALRATE>1</FISCALRATE><TAXDATE>2026-01-15</TAXDATE><CUSTOMERID>1001</CUSTOMERID><PRINTED>0</PRINTED><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><ARACCOUNT>1103-001</ARACCOUNT><TAXFORMNUMBER></TAXFORMNUMBER><TAXFORMCODE></TAXFORMCODE><CURRENCYNAME>IDR</CURRENCYNAME><AUTOMATICINSERTGROUPING/></SALESINVOICE>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("Pajak_Inklusif=1 → UNITPRICE dibagi mundur (harga sudah termasuk pajak), INVOICEAMOUNT = subtotal apa adanya", () => {
    const ctx = salesInvoiceType.process([{ ...row, Pajak_Inklusif: 1 }], opts);
    const xml = salesInvoiceType.build(ctx);
    // subtotal (harga bruto) tetap 7.000.000 (qty x Harga_Satuan APA ADANYA), tapi UNITPRICE per unit di-strip pajak
    expect(xml).toContain("<INVOICEAMOUNT>7000000</INVOICEAMOUNT>");
    expect(xml).toContain("<UNITPRICE>3153153.1532</UNITPRICE>"); // 3500000/1.11, dibulatkan 4 desimal
  });

  test("Opening Balance (Saldo_Awal=1) → DESCRIPTION berisi 'Customer Opening Balance {cust}'", () => {
    const ctx = salesInvoiceType.process([obRow], opts);
    const xml = salesInvoiceType.build(ctx);
    expect(xml).toContain("<DESCRIPTION>Customer Opening Balance 2001</DESCRIPTION>");
    expect(xml).toContain("<TAXCODES></TAXCODES>"); // pajak dimatikan otomatis
  });
});

describe("salesInvoiceType.summary — dikelompokkan per mata uang (mirror tool.html baris 541-546)", () => {
  test("totals per currency, label '(termasuk PPN)'", () => {
    const summary = salesInvoiceType.summary(salesInvoiceType.process([row], opts));
    expect(summary.totals).toBe("7.770.000 IDR (termasuk PPN)");
    expect(summary.rowCount).toBe(1);
  });
});
