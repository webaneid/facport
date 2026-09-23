import { describe, test, expect } from "bun:test";
import { purchaseOrderType } from "./purchase-order";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_PO: "PO/2026/001", Tgl_PO: "2026-01-20", ID_Pemasok: "V-0002", Kode_Barang: "SG-40", Deskripsi: "Semen Gresik 40kg", Satuan: "zak", Kuantitas: 100, Harga_Beli: 38000, Kena_Pajak: 1, Kode_Pajak: "T", Tarif_Pajak: 11, Pajak_Inklusif: 0, Termin: "2/10 n/30", Tgl_Estimasi_Terima: "2026-02-01", Kurs: 1, Uang_Muka: 0, Akun_Uang_Muka: "1104-001", Project: "PBT.005", Departemen: "1000" };

describe("purchaseOrderType.process — validasi (mirror tool.html baris 979-999)", () => {
  test("Uang_Muka > 0 tapi Akun_Uang_Muka kosong → warning", () => {
    const ctx = purchaseOrderType.process([{ ...row, Uang_Muka: 500000, Akun_Uang_Muka: "" }], opts);
    expect(ctx.warnings.some((w) => w.includes("Akun_Uang_Muka kosong"))).toBe(true);
  });
  test("2 baris No_PO sama → digabung 1 pesanan", () => {
    const row2 = { ...row, Kode_Barang: "P-Btn", Kuantitas: 20, Harga_Beli: 185000 };
    const ctx = purchaseOrderType.process([row, row2], opts);
    expect(ctx.order).toEqual(["PO/2026/001"]);
    expect(ctx.groups["PO/2026/001"]!.lines.length).toBe(2);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = purchaseOrderType.process([{ No_PO: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("purchaseOrderType.build — struktur XML PERSIS mirror tool.html baris 1001-1017", () => {
  test("1 pesanan 1 baris — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = purchaseOrderType.process([row], opts);
    const xml = purchaseOrderType.build(ctx);
    const expectedBody =
      '<PO operation="Add" REQUESTID="1"><POID>1</POID><TRANSACTIONID>1</TRANSACTIONID><ITEMLINE operation="Add"><KeyID>0</KeyID><ITEMNO>SG-40</ITEMNO><QUANTITY>100</QUANTITY><ITEMUNIT>zak</ITEMUNIT><UNITRATIO>1</UNITRATIO><ITEMRESERVED1/><ITEMRESERVED2/><ITEMRESERVED3/><ITEMRESERVED4/><ITEMRESERVED5/><ITEMRESERVED6/><ITEMRESERVED7/><ITEMRESERVED8/><ITEMRESERVED9/><ITEMRESERVED10/><ITEMOVDESC>Semen Gresik 40kg</ITEMOVDESC><UNITPRICE>38000</UNITPRICE><ITEMDISCPC/><TAXCODES>T</TAXCODES><PROJECTID>PBT.005</PROJECTID><DEPTID>1000</DEPTID><GROUPSEQ/><REQUISITIONSEQ/></ITEMLINE><PONO>PO/2026/001</PONO><PODATE>2026-01-20</PODATE><GLYEAR/><GLPERIOD/><TAX1REF>T</TAX1REF><TAX1CODE>T</TAX1CODE><TAX2CODE/><TAX1RATE>11</TAX1RATE><TAX2RATE>0</TAX2RATE><TAX1AMOUNT>418000</TAX1AMOUNT><TAX2AMOUNT>0</TAX2AMOUNT><RATE>1</RATE><INCLUSIVETAX>0</INCLUSIVETAX><VENDORISTAXABLE>1</VENDORISTAXABLE><CASHDISCOUNT>0</CASHDISCOUNT><CASHDISCPC>0</CASHDISCPC><POAMOUNT>4218000</POAMOUNT><FREIGHT>0</FREIGHT><TERMREF>2/10 n/30</TERMREF><FOB/><EXPECTED>2026-02-01</EXPECTED><DESCRIPTION/><SHIPTO1/><SHIPTO2/><SHIPTO3/><SHIPTO4/><SHIPTO5/><PROCEED/><CLOSED>0</CLOSED><DP/><DPACCOUNTREF>1104-001</DPACCOUNTREF><DPUSED/><VENDORREF>V-0002</VENDORREF></PO>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("Uang_Muka > 0 → <DP> berisi nilai (bukan self-closing)", () => {
    const ctx = purchaseOrderType.process([{ ...row, Uang_Muka: 500000 }], opts);
    expect(purchaseOrderType.build(ctx)).toContain("<DP>500000</DP>");
  });
});

describe("purchaseOrderType.summary — reminder 'pesanan belum membebani stok/jurnal' (mirror tool.html baris 1019-1023)", () => {
  test("totals berisi nilai termasuk PPN + reminder", () => {
    const summary = purchaseOrderType.summary(purchaseOrderType.process([row], opts));
    expect(summary.totals).toBe("4.218.000 (nilai mata uang transaksi, termasuk PPN) — pesanan belum membebani stok/jurnal");
    expect(summary.rowCount).toBe(1);
  });
});
