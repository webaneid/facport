import { describe, test, expect } from "bun:test";
import { customerReceiptType } from "./customer-receipt";

const opts = { branch: "HO", defCurrency: "IDR" };
const row = { No_Penerimaan: "CR/2026/001", Tanggal: "2026-01-27", ID_Pelanggan: "1001", Akun_Kas_Bank: "1102-002", No_Faktur: "INV/2026/001", Jumlah_Bayar: 4125000, Diskon: 0, PPh23: 0, No_Cek: "", Keterangan: "Pelunasan faktur", Mata_Uang: "IDR", Kurs: 1, Project: "PBT.005", Departemen: "1000" };

describe("customerReceiptType.process — validasi (mirror tool.html baris 872-887)", () => {
  test("No_Faktur kosong → error (WAJIB nomor faktur AR existing)", () => {
    const ctx = customerReceiptType.process([{ ...row, No_Faktur: "" }], opts);
    expect(ctx.errors.some((e) => e.includes("No_Faktur kosong"))).toBe(true);
  });
  test("Jumlah_Bayar tidak valid → error", () => {
    const ctx = customerReceiptType.process([{ ...row, Jumlah_Bayar: 0 }], opts);
    expect(ctx.errors.some((e) => e.includes("Jumlah_Bayar tidak valid"))).toBe(true);
  });
  test("2 baris No_Penerimaan sama, No_Faktur beda → 1 penerimaan melunasi 2 faktur", () => {
    const rows = [
      { ...row, No_Penerimaan: "CR/2026/003", No_Faktur: "INV/2026/008", Jumlah_Bayar: 5000000 },
      { ...row, No_Penerimaan: "CR/2026/003", No_Faktur: "INV/2026/009", Jumlah_Bayar: 3000000 },
    ];
    const ctx = customerReceiptType.process(rows, opts);
    expect(ctx.order).toEqual(["CR/2026/003"]);
    expect(ctx.groups["CR/2026/003"]!.lines.length).toBe(2);
  });
  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = customerReceiptType.process([{ No_Penerimaan: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("customerReceiptType.build — struktur XML PERSIS mirror tool.html baris 889-899", () => {
  test("1 penerimaan 1 faktur — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = customerReceiptType.process([row], opts);
    const xml = customerReceiptType.build(ctx);
    const expectedBody =
      '<CUSTOMERRECEIPT operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><IMPORTEDTRANSACTIONID/><InvoiceLine operation="Add"><KeyID>1</KeyID><PAYMENTAMOUNT>4125000</PAYMENTAMOUNT><PPH23AMOUNT>0</PPH23AMOUNT><PPH23RATE>0</PPH23RATE><PPH23FISCALRATE>1</PPH23FISCALRATE><PPH23NUMBER/><DISCTAKENAMOUNT>0</DISCTAKENAMOUNT><ARINVOICEID>INV/2026/001</ARINVOICEID></InvoiceLine><SEQUENCENO>CR/2026/001</SEQUENCENO><PAYMENTDATE>2026-01-27</PAYMENTDATE><CHEQUENO></CHEQUENO><BANKACCOUNT>1102-002</BANKACCOUNT><CHEQUEDATE>2026-01-27</CHEQUEDATE><CHEQUEAMOUNT>4125000</CHEQUEAMOUNT><RATE>1</RATE><DESCRIPTION>Pelunasan faktur</DESCRIPTION><FISCALPMT>0</FISCALPMT><DEPTID>1000</DEPTID><PROJECTID>PBT.005</PROJECTID><VOID>0</VOID><BILLTOID>1001</BILLTOID><OVERPAYUSED/><APPLYFROMCREDIT>0</APPLYFROMCREDIT><CURRENCYNAME>IDR</CURRENCYNAME><RETURNCREDIT>0</RETURNCREDIT></CUSTOMERRECEIPT>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });
});

describe("customerReceiptType.summary — mirror tool.html baris 901-905", () => {
  test("totals dikelompokkan per mata uang, pesan reminder validasi manual No_Faktur", () => {
    const summary = customerReceiptType.summary(customerReceiptType.process([row], opts));
    expect(summary.totals).toContain("4.125.000 IDR");
    expect(summary.totals).toContain("pastikan tiap No_Faktur sudah ada di Accurate");
    expect(summary.rowCount).toBe(1);
  });
});
