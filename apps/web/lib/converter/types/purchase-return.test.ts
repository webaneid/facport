import { describe, test, expect } from "bun:test";
import { purchaseReturnType } from "./purchase-return";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Retur: "RB/2026/001", Tgl_Retur: "2026-01-17", ID_Pemasok: "V-0002", No_Faktur_Pembelian: "BELI/2026/01", Kode_Barang: "AC-Chang", Deskripsi: "AC Changhong CS-C09P3", Satuan: "set", Kuantitas: 1, Harga_Satuan: 1500000, Gudang: "ELEKTRONIK", Kode_Pajak: "T", Tarif_Pajak: 11, No_Faktur_Pajak: "", Project: "PBT.005", Departemen: "1000" };

describe("purchaseReturnType.process — validasi (mirror tool.html baris 1139-1155)", () => {
  test("No_Faktur_Pembelian kosong → error (wajib nomor faktur asal di Accurate)", () => {
    const ctx = purchaseReturnType.process([{ ...row, No_Faktur_Pembelian: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Faktur_Pembelian kosong"))).toBe(true);
  });
  test("Kode_Pajak diisi tapi Tarif_Pajak 0 → warning (PPN retur dihitung 0)", () => {
    const ctx = purchaseReturnType.process([{ ...row, Tarif_Pajak: 0 }], opts);
    expect(ctx.warnings.some((w) => w.includes("PPN retur dihitung 0"))).toBe(true);
  });
  test("2 baris No_Retur sama, No_Faktur_Pembelian BEDA → warning, header pakai baris pertama TAPI tiap baris tetap menunjuk fakturnya sendiri", () => {
    const rows = [row, { ...row, No_Faktur_Pembelian: "BELI/2026/02" }];
    const ctx = purchaseReturnType.process(rows, opts);
    expect(ctx.warnings.some((w) => w.includes("berbeda antar baris"))).toBe(true);
    expect(ctx.groups["RB/2026/001"]!.lines[0]!.inv).toBe("BELI/2026/01");
    expect(ctx.groups["RB/2026/001"]!.lines[1]!.inv).toBe("BELI/2026/02");
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = purchaseReturnType.process([{ No_Retur: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("purchaseReturnType.build — struktur XML PERSIS mirror tool.html baris 1157-1170", () => {
  test("1 retur 1 baris — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = purchaseReturnType.process([row], opts);
    const xml = purchaseReturnType.build(ctx);
    const expectedBody =
      '<PURCHASERETURN operation="Add" REQUESTID="1"><APRETURNID/><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>1</KeyID><ITEMNO>AC-Chang</ITEMNO><QUANTITY>1</QUANTITY><ITEMUNIT>set</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC/><UNITPRICE/><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PBT.005</PROJECTID><DEPTID>1000</DEPTID><GROUPSEQ/><POSEQ/><BRUTOUNITPRICE>1500000</BRUTOUNITPRICE><WAREHOUSEID>ELEKTRONIK</WAREHOUSEID><QTYCONTROL>0</QTYCONTROL><INVRI/><INVID>BELI/2026/01</INVID><RIID/><INVOICESEQ>1</INVOICESEQ><ITEMDESCRIPTION>AC Changhong CS-C09P3</ITEMDESCRIPTION></ITEMLINE><INVOICENO>RB/2026/001</INVOICENO><INVOICEDATE>2026-01-17</INVOICEDATE><GLYEAR>2026</GLYEAR><GLPERIOD>1</GLPERIOD><TAX1CODE/><TAX2CODE/><TAX1RATE/><TAX2RATE/><TAX1AMOUNT>165000</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE/><INCLUSIVETAX>0</INCLUSIVETAX><ISTAXABLE/><CASHDISCOUNT/><CASHDISCPC/><INVOICEAMOUNT>1500000</INVOICEAMOUNT><DESCRIPTION/><WAREHOUSEID>ELEKTRONIK</WAREHOUSEID><TAXNO></TAXNO><TAXDATE>2026-01-17</TAXDATE><VENDORID>V-0002</VENDORID><APINVOICEID>BELI/2026/01</APINVOICEID><RECEIVEITEMID/><SSPDATE>2026-01-17</SSPDATE></PURCHASERETURN>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("GLYEAR/GLPERIOD diambil dari tanggal retur (2026-01 → year=2026, period=1 TANPA zero-pad)", () => {
    const ctx = purchaseReturnType.process([row], opts);
    const xml = purchaseReturnType.build(ctx);
    expect(xml).toContain("<GLYEAR>2026</GLYEAR><GLPERIOD>1</GLPERIOD>");
  });
});

describe("purchaseReturnType.summary — mirror tool.html baris 1172-1176", () => {
  test("totals termasuk PPN + reminder validasi manual No_Faktur_Pembelian", () => {
    const summary = purchaseReturnType.summary(purchaseReturnType.process([row], opts));
    expect(summary.totals).toBe("1.665.000 termasuk PPN — tiap No_Faktur_Pembelian harus sudah ada di Accurate");
    expect(summary.rowCount).toBe(1);
  });
});
