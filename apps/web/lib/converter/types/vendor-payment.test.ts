import { describe, test, expect } from "bun:test";
import { vendorPaymentType } from "./vendor-payment";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Pembayaran: "VP/2026/001", Tanggal: "2026-01-27", Tgl_Cek: "2026-01-27", ID_Pemasok: "V-0002", Akun_Kas_Bank: "1102-002", No_Faktur: "BELI/2026/01", Jumlah_Bayar: 5000000, Diskon: 0, PPh23: 0, No_Cek: "", Penerima: "PT Pemasok Material", Keterangan: "Pelunasan", Kurs: 1, Project: "PBT.005", Departemen: "1000" };

describe("vendorPaymentType.process — validasi (mirror tool.html baris 925-940)", () => {
  test("No_Faktur kosong → error (WAJIB nomor faktur AP existing)", () => {
    const ctx = vendorPaymentType.process([{ ...row, No_Faktur: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Faktur kosong"))).toBe(true);
  });
  test("Tgl_Cek kosong → fallback ke Tanggal (BUKAN error)", () => {
    const ctx = vendorPaymentType.process([{ ...row, Tgl_Cek: "" }], opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.groups["VP/2026/001"]!.head.cdate).toBe(ctx.groups["VP/2026/001"]!.head.date);
  });
  test("Kurs kosong/invalid → fallback 1 (BUKAN error)", () => {
    const ctx = vendorPaymentType.process([{ ...row, Kurs: "" }], opts);
    expect(ctx.errors).toEqual([]);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = vendorPaymentType.process([{ No_Pembayaran: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("vendorPaymentType.build — struktur XML PERSIS mirror tool.html baris 942-950", () => {
  test("1 pembayaran 1 faktur — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = vendorPaymentType.process([row], opts);
    const xml = vendorPaymentType.build(ctx);
    const expectedBody =
      '<VENDORPAYMENT operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><IMPORTEDTRANSACTIONID/><InvoiceLine operation="Add"><KeyID>1</KeyID><PAYMENTAMOUNT>5000000</PAYMENTAMOUNT><PPH23AMOUNT>0</PPH23AMOUNT><PPH23RATE>0</PPH23RATE><PPH23FISCALRATE>1</PPH23FISCALRATE><PPH23NUMBER/><DISCOUNT>0</DISCOUNT><APINVOICEID>BELI/2026/01</APINVOICEID><APINVOICESEQUENCE/></InvoiceLine><SEQUENCENO>VP/2026/001</SEQUENCENO><PAYMENTDATE>2026-01-27</PAYMENTDATE><CHEQUENO></CHEQUENO><BANKACCNT>1102-002</BANKACCNT><CHEQUEDATE>2026-01-27</CHEQUEDATE><RATE>1</RATE><DESCRIPTION>Pelunasan</DESCRIPTION><FISCALPMT>0</FISCALPMT><DEPTID>1000</DEPTID><PROJECTID>PBT.005</PROJECTID><VOID>0</VOID><VENDORID>V-0002</VENDORID><PAYEE>PT Pemasok Material</PAYEE></VENDORPAYMENT>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });
});

describe("vendorPaymentType.summary — mirror tool.html baris 952-956", () => {
  test("totals + reminder validasi manual No_Faktur", () => {
    const summary = vendorPaymentType.summary(vendorPaymentType.process([row], opts));
    expect(summary.totals).toBe("Total 5.000.000 (nilai mata uang transaksi) — pastikan tiap No_Faktur sudah ada di Accurate");
    expect(summary.rowCount).toBe(1);
  });
});
