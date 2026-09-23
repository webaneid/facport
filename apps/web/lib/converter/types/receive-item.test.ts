import { describe, test, expect } from "bun:test";
import { receiveItemType } from "./receive-item";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Form_RI: "RI/2026/0001", No_Surat_Jalan: "SJ-8891", Tgl_Terima: "2026-01-21", ID_Pemasok: "V-0002", No_PO: "PO/2026/001", Kode_Barang: "SG-40", Deskripsi: "Semen Gresik 40kg", Satuan: "zak", Kuantitas: 100, Harga_Beli: 38000, Akun_Utang: "2101-001", Gudang: "MATERIAL", Kena_Pajak: 1, Kode_Pajak: "T", Tarif_Pajak: 11, Termin: "2/10 n/30", Kurs: 1, Project: "PBT.005", Departemen: "1000" };

describe("receiveItemType.process — validasi (mirror tool.html baris 1255-1272)", () => {
  test("No_Surat_Jalan kosong → error (wajib nomor dokumen pemasok)", () => {
    const ctx = receiveItemType.process([{ ...row, No_Surat_Jalan: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Surat_Jalan kosong"))).toBe(true);
  });
  test("No_PO kosong → boleh (RI lepas, tanpa referensi PO)", () => {
    const ctx = receiveItemType.process([{ ...row, No_PO: "" }], opts);
    expect(ctx.errors).toEqual([]);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = receiveItemType.process([{ No_Form_RI: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("receiveItemType.build — struktur XML PERSIS mirror tool.html baris 1274-1290 (ejaan RECIEVEITEM sesuai skema Accurate)", () => {
  test("1 penerimaan referensi PO — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = receiveItemType.process([row], opts);
    const xml = receiveItemType.build(ctx);
    const expectedBody =
      '<RECIEVEITEM operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>1</KeyID><ITEMNO>SG-40</ITEMNO><QUANTITY>100</QUANTITY><ITEMUNIT>zak</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>Semen Gresik 40kg</ITEMOVDESC><UNITPRICE/><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PBT.005</PROJECTID><DEPTID>1000</DEPTID><GROUPSEQ/><POSEQ>0</POSEQ><BRUTOUNITPRICE>38000</BRUTOUNITPRICE><WAREHOUSEID>MATERIAL</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><RISEQ/><POID>PO/2026/001</POID><RIID/></ITEMLINE><INVOICENO>SJ-8891</INVOICENO><INVOICEDATE>2026-01-21</INVOICEDATE><TAX1ID>T</TAX1ID><TAX1CODE>T</TAX1CODE><TAX2CODE/><TAX1RATE>11</TAX1RATE><TAX2RATE>0</TAX2RATE><RATE>1</RATE><INCLUSIVETAX>0</INCLUSIVETAX><INVOICEISTAXABLE>1</INVOICEISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC/><INVOICEAMOUNT>3800000</INVOICEAMOUNT><TERMSID>2/10 n/30</TERMSID><FOB/><PURCHASEORDERNO>PO/2026/001</PURCHASEORDERNO><WAREHOUSEID>MATERIAL</WAREHOUSEID><DESCRIPTION/><SHIPDATE>2026-01-21</SHIPDATE><POSTED>0</POSTED><FISCALRATE>1</FISCALRATE><INVFROMPR/><TAXDATE>2026-01-21</TAXDATE><VENDORID>V-0002</VENDORID><SEQUENCENO>RI/2026/0001</SEQUENCENO><APACCOUNT>2101-001</APACCOUNT><SHIPVENDID/><INVTAXNO2/><INVTAXNO1/><SSPDATE/><EXPENSESOFBILLID/><EXPENSESJOURNALDATETYPE/><LOCKED_BY/><LOCKED_TIME/></RECIEVEITEM>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("INVOICEAMOUNT = DPP murni (BUKAN termasuk PPN — beda dari Purchase Invoice)", () => {
    const ctx = receiveItemType.process([row], opts);
    expect(receiveItemType.build(ctx)).toContain("<INVOICEAMOUNT>3800000</INVOICEAMOUNT>");
  });

  test("No_PO kosong → POID dan PURCHASEORDERNO self-closing (RI lepas)", () => {
    const ctx = receiveItemType.process([{ ...row, No_PO: "" }], opts);
    const xml = receiveItemType.build(ctx);
    expect(xml).toContain("<POID/>");
    expect(xml).toContain("<PURCHASEORDERNO/>");
  });
});

describe("receiveItemType.summary — mirror tool.html baris 1292-1296", () => {
  test("totals bilang 'DPP, belum termasuk PPN' + reminder RI menambah stok", () => {
    const summary = receiveItemType.summary(receiveItemType.process([row], opts));
    expect(summary.totals).toBe("3.800.000 (DPP, belum termasuk PPN) — RI menambah stok gudang");
    expect(summary.rowCount).toBe(1);
  });
});
