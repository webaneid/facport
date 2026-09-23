import { describe, test, expect } from "bun:test";
import { purchaseInvoiceType } from "./purchase-invoice";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Faktur_Supplier: "BELI/2026/01", No_Internal: "PI/2026/0001", Tgl_Faktur: "2026-01-15", ID_Pemasok: "V-0002", Kode_Barang: "SG-40", Deskripsi: "Semen Gresik 40kg", Satuan: "zak", Kuantitas: 100, Harga_Beli: 38000, Akun_Utang: "2101-001", Gudang: "MATERIAL", Mata_Uang: "IDR", Kurs: 1, Kena_Pajak: 1, Kode_Pajak: "T", Tarif_Pajak: 11, Pajak_Inklusif: 0, Termin: "NET 30", No_Faktur_Pajak: "", Project: "PRJ-01", Departemen: "DEPT-01" };

describe("purchaseInvoiceType.process — grouping & validasi (mirror tool.html baris 685-706)", () => {
  test("No_Internal kosong → error, baris DILEWATI dari grouping", () => {
    const ctx = purchaseInvoiceType.process([{ ...row, No_Internal: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Internal kosong"))).toBe(true);
    expect(ctx.order).toEqual([]);
  });
  test("No_Faktur_Supplier kosong → error, TAPI baris tetap masuk group (beda dari No_Internal)", () => {
    const ctx = purchaseInvoiceType.process([{ ...row, No_Faktur_Supplier: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Faktur_Supplier kosong"))).toBe(true);
    expect(ctx.order).toEqual(["PI/2026/0001"]);
  });
  test("2 baris No_Internal sama → digabung 1 faktur, 2 ITEMLINE", () => {
    const row2 = { ...row, Kode_Barang: "P-Btn", Deskripsi: "Pasir Beton", Satuan: "m3", Kuantitas: 20, Harga_Beli: 185000 };
    const ctx = purchaseInvoiceType.process([row, row2], opts);
    expect(ctx.order).toEqual(["PI/2026/0001"]);
    expect(ctx.groups["PI/2026/0001"]!.lines.length).toBe(2);
  });
  test("Kena_Pajak kosong → warning 'dianggap TIDAK kena pajak' (bukan error)", () => {
    const ctx = purchaseInvoiceType.process([{ ...row, Kena_Pajak: "" }], opts);
    expect(ctx.warnings.some((w) => w.includes("dianggap TIDAK kena pajak"))).toBe(true);
    expect(ctx.groups["PI/2026/0001"]!.head.taxable).toBe(0);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = purchaseInvoiceType.process([{ No_Internal: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("purchaseInvoiceType.build — INVOICEAMOUNT TERMASUK PPN (mirror tool.html baris 708-723)", () => {
  test("1 faktur 1 baris kena pajak — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = purchaseInvoiceType.process([row], opts);
    const xml = purchaseInvoiceType.build(ctx);
    const expectedBody =
      '<PURCHASEINVOICE operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>1</KeyID><ITEMNO>SG-40</ITEMNO><QUANTITY>100</QUANTITY><ITEMUNIT>zak</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>Semen Gresik 40kg</ITEMOVDESC><UNITPRICE/><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PRJ-01</PROJECTID><DEPTID>DEPT-01</DEPTID><GROUPSEQ/><POSEQ/><BRUTOUNITPRICE>38000</BRUTOUNITPRICE><WAREHOUSEID>MATERIAL</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><RISEQ/><RIID/></ITEMLINE><INVOICENO>BELI/2026/01</INVOICENO><INVOICEDATE>2026-01-15</INVOICEDATE><TAX1ID>T</TAX1ID><TAX1CODE>T</TAX1CODE><TAX2CODE/><TAX1RATE>11</TAX1RATE><TAX2RATE>0</TAX2RATE><RATE>1</RATE><INCLUSIVETAX>0</INCLUSIVETAX><INVOICEISTAXABLE>1</INVOICEISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>4218000</INVOICEAMOUNT><TERMSID>NET 30</TERMSID><FOB/><PURCHASEORDERNO/><WAREHOUSEID>MATERIAL</WAREHOUSEID><DESCRIPTION/><SHIPDATE>2026-01-15</SHIPDATE><POSTED>1</POSTED><FISCALRATE>1</FISCALRATE><INVFROMPR/><TAXDATE>2026-01-15</TAXDATE><VENDORID>V-0002</VENDORID><SEQUENCENO>PI/2026/0001</SEQUENCENO><APACCOUNT>2101-001</APACCOUNT><SHIPVENDID/><INVTAXNO2>BELI/2026/01</INVTAXNO2><INVTAXNO1></INVTAXNO1><SSPDATE>2026-01-15</SSPDATE><EXPENSESOFBILLID/><EXPENSESJOURNALDATETYPE>0</EXPENSESJOURNALDATETYPE><LOCKED_BY/><LOCKED_TIME/></PURCHASEINVOICE>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("subtotal 3.800.000, pajak 11% = 418.000, INVOICEAMOUNT = 4.218.000 (TERMASUK PPN)", () => {
    const ctx = purchaseInvoiceType.process([row], opts);
    const xml = purchaseInvoiceType.build(ctx);
    expect(xml).toContain("<INVOICEAMOUNT>4218000</INVOICEAMOUNT>");
  });

  test("Pajak_Inklusif=1 → INVOICEAMOUNT = subtotal APA ADANYA (pajak sudah termasuk, TIDAK ditambah lagi)", () => {
    const ctx = purchaseInvoiceType.process([{ ...row, Pajak_Inklusif: 1 }], opts);
    const xml = purchaseInvoiceType.build(ctx);
    expect(xml).toContain("<INVOICEAMOUNT>3800000</INVOICEAMOUNT>");
    expect(xml).toContain("<INCLUSIVETAX>1</INCLUSIVETAX>");
  });

  test("tidak kena pajak (Kena_Pajak=0) → TAX1RATE=0, INVOICEAMOUNT = subtotal murni", () => {
    const ctx = purchaseInvoiceType.process([{ ...row, Kena_Pajak: 0 }], opts);
    const xml = purchaseInvoiceType.build(ctx);
    expect(xml).toContain("<TAX1RATE>0</TAX1RATE>");
    expect(xml).toContain("<INVOICEAMOUNT>3800000</INVOICEAMOUNT>");
  });
});

describe("purchaseInvoiceType.summary — dikelompokkan per mata uang (mirror tool.html baris 725-729)", () => {
  test("totals per currency, ada label '(termasuk PPN)'", () => {
    const summary = purchaseInvoiceType.summary(purchaseInvoiceType.process([row], opts));
    expect(summary.totals).toBe("4.218.000 IDR (termasuk PPN)");
    expect(summary.rowCount).toBe(1);
  });
});
