import { describe, test, expect } from "bun:test";
import { journalVoucherType } from "./journal-voucher";

const opts = { branch: "HO", defCurrency: "IDR" };
const row1 = { No_Jurnal: "JV/2026/001", Tanggal: "2026-01-31", Akun: "6300-001", Debit: 500000, Kredit: 0, Keterangan: "Penyusutan kendaraan", Memo_Jurnal: "Penyusutan Januari", Mata_Uang: "IDR", Kurs: 1, Project: "PRJ-01", Departemen: "DEPT-01", Tipe_Subsidiary: "", ID_Subsidiary: "" };
const row2 = { ...row1, Akun: "1602-002", Debit: 0, Kredit: 500000, Keterangan: "Akumulasi penyusutan" };

describe("journalVoucherType.process — validasi balance debit=kredit (mirror tool.html baris 826-834, PALING KETAT dari 16 tipe)", () => {
  test("2 baris balance (debit 500000 = kredit 500000) → TIDAK ADA error", () => {
    const ctx = journalVoucherType.process([row1, row2], opts);
    expect(ctx.errors).toEqual([]);
    expect(ctx.groups["JV/2026/001"]!.debit).toBe(500000);
  });

  test("TIDAK balance (debit != kredit) → error 'TIDAK BALANCE' dengan selisih yang benar", () => {
    const rows = [row1, { ...row2, Kredit: 300000 }]; // debit 500000, kredit 300000, selisih 200000
    const ctx = journalVoucherType.process(rows, opts);
    expect(ctx.errors.some((e) => e.includes("TIDAK BALANCE") && e.includes("selisih Rp 200.000"))).toBe(true);
  });

  test("cuma debit TANPA kredit (atau sebaliknya) → error 'tidak ada pasangan debit-kredit'", () => {
    const ctx = journalVoucherType.process([row1], opts);
    expect(ctx.errors.some((e) => e.includes("tidak ada pasangan debit-kredit"))).toBe(true);
  });

  test("Debit DAN Kredit diisi keduanya di 1 baris → error", () => {
    const ctx = journalVoucherType.process([{ ...row1, Kredit: 100 }], opts);
    expect(ctx.errors.some((e) => e.includes("isi Debit ATAU Kredit, jangan keduanya"))).toBe(true);
  });

  test("Debit dan Kredit dua-duanya kosong/0 → error", () => {
    const ctx = journalVoucherType.process([{ ...row1, Debit: 0 }], opts);
    expect(ctx.errors.some((e) => e.includes("dua-duanya kosong/0"))).toBe(true);
  });

  test("Debit/Kredit negatif → error", () => {
    const ctx = journalVoucherType.process([{ ...row1, Debit: -100 }], opts);
    expect(ctx.errors.some((e) => e.includes("tidak boleh negatif"))).toBe(true);
  });

  test("Multi-currency: Kurs dipakai hitung nilai IDR (base = prime × rate) — balance dicek di IDR, bukan mata uang asing", () => {
    const usdRow1 = { ...row1, Mata_Uang: "USD", Kurs: 15000, Debit: 10, Kredit: 0 }; // base = 150000
    const usdRow2 = { ...row2, Mata_Uang: "USD", Kurs: 15000, Debit: 0, Kredit: 10 }; // base = -150000
    const ctx = journalVoucherType.process([usdRow1, usdRow2], opts);
    expect(ctx.errors).toEqual([]); // balance di IDR (150000 = 150000), walau nilai asli USD
  });

  test("ID_Subsidiary diisi TAPI Tipe_Subsidiary tidak dikenal → warning (bukan error)", () => {
    const ctx = journalVoucherType.process([{ ...row1, ID_Subsidiary: "CUST-001", Tipe_Subsidiary: "entah" }, row2], opts);
    expect(ctx.warnings.some((w) => w.includes("Tipe Subsidiary tak dikenal"))).toBe(true);
    expect(ctx.errors).toEqual([]);
  });

  test("Kolom wajib hilang → error checkHeaders", () => {
    const ctx = journalVoucherType.process([{ No_Jurnal: "X" }], opts);
    expect(ctx.errors[0]).toContain("Kolom wajib hilang");
  });
});

describe("journalVoucherType.build — struktur XML PERSIS mirror tool.html baris 836-849", () => {
  test("1 jurnal 2 baris balance — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const ctx = journalVoucherType.process([row1, row2], opts);
    const xml = journalVoucherType.build(ctx);
    const expectedBody =
      '<JV operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ACCOUNTLINE operation="Add"><KeyID>0</KeyID><GLACCOUNT>6300-001</GLACCOUNT><GLAMOUNT>500000</GLAMOUNT><DEPTID>DEPT-01</DEPTID><PROJECTID>PRJ-01</PROJECTID><DESCRIPTION>Penyusutan kendaraan</DESCRIPTION><RATE>1</RATE><PRIMEAMOUNT>500000</PRIMEAMOUNT><TXDATE/><POSTED/><CURRENCYNAME></CURRENCYNAME></ACCOUNTLINE><ACCOUNTLINE operation="Add"><KeyID>1</KeyID><GLACCOUNT>1602-002</GLACCOUNT><GLAMOUNT>-500000</GLAMOUNT><DEPTID>DEPT-01</DEPTID><PROJECTID>PRJ-01</PROJECTID><DESCRIPTION>Akumulasi penyusutan</DESCRIPTION><RATE>1</RATE><PRIMEAMOUNT>-500000</PRIMEAMOUNT><TXDATE/><POSTED/><CURRENCYNAME></CURRENCYNAME></ACCOUNTLINE><JVNUMBER>JV/2026/001</JVNUMBER><TRANSDATE>2026-01-31</TRANSDATE><SOURCE>GL</SOURCE><TRANSTYPE>journal voucher</TRANSTYPE><TRANSDESCRIPTION>Penyusutan Januari</TRANSDESCRIPTION><JVAMOUNT>500000</JVAMOUNT></JV>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("VENDORNO muncul kalau Tipe_Subsidiary cocok pola pemasok/vendor/supplier", () => {
    const ctx = journalVoucherType.process([{ ...row1, ID_Subsidiary: "V-001", Tipe_Subsidiary: "Pemasok" }, row2], opts);
    expect(journalVoucherType.build(ctx)).toContain("<VENDORNO>V-001</VENDORNO>");
  });

  test("CUSTOMERNO muncul kalau Tipe_Subsidiary cocok pola pelanggan/customer/pembeli", () => {
    const ctx = journalVoucherType.process([{ ...row1, ID_Subsidiary: "C-001", Tipe_Subsidiary: "Pelanggan" }, row2], opts);
    expect(journalVoucherType.build(ctx)).toContain("<CUSTOMERNO>C-001</CUSTOMERNO>");
  });

  test("Mata_Uang bukan IDR → CURRENCYNAME diisi (BEDA dari IDR yang selalu kosong)", () => {
    const ctx = journalVoucherType.process([{ ...row1, Mata_Uang: "USD" }, { ...row2, Mata_Uang: "USD" }], opts);
    expect(journalVoucherType.build(ctx)).toContain("<CURRENCYNAME>USD</CURRENCYNAME>");
  });
});

describe("journalVoucherType.summary — mirror tool.html baris 851-855", () => {
  test("errors.length===0 → totals bilang 'Semua jurnal balance'", () => {
    const ctx = journalVoucherType.process([row1, row2], opts);
    const summary = journalVoucherType.summary(ctx);
    expect(summary.totals).toBe("Semua jurnal balance · total nilai Rp 500.000");
    expect(summary.rowCount).toBe(2);
  });

  test("ada jurnal tidak balance → totals bilang 'Ada jurnal yang belum balance'", () => {
    const ctx = journalVoucherType.process([row1], opts); // cuma debit, tidak balance
    const summary = journalVoucherType.summary(ctx);
    expect(summary.totals).toBe("Ada jurnal yang belum balance.");
  });
});
