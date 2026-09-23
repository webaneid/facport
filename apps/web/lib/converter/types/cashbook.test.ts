import { describe, test, expect } from "bun:test";
import { otherDepositType, otherPaymentType } from "./cashbook";

const opts = { branch: "HO", defCurrency: "IDR" };

describe("cashbookType metadata — deposit vs payment beda root/transtype/headers (mirror tool.html baris 603-628)", () => {
  test("otherDepositType: moduleKey, headers TANPA Penerima/No_Cek", () => {
    expect(otherDepositType.key).toBe("konverter_other_deposit");
    expect(otherDepositType.headers).toEqual(["No_Voucher", "Tanggal", "Akun_Kas_Bank", "Memo", "Akun_Lawan", "Jumlah", "Keterangan_Baris", "Project", "Departemen"]);
  });
  test("otherPaymentType: moduleKey, headers DENGAN Penerima/No_Cek tambahan", () => {
    expect(otherPaymentType.key).toBe("konverter_other_payment");
    expect(otherPaymentType.headers).toEqual(["No_Voucher", "Tanggal", "Akun_Kas_Bank", "Memo", "Akun_Lawan", "Jumlah", "Keterangan_Baris", "Project", "Departemen", "Penerima", "No_Cek"]);
  });
});

describe("cashbookType.process — validasi (mirror tool.html baris 633-646, SAMA untuk deposit & payment)", () => {
  test("Jumlah <= 0 → error", () => {
    const ctx = otherDepositType.process([{ No_Voucher: "X", Tanggal: "2026-01-01", Akun_Kas_Bank: "A", Akun_Lawan: "B", Jumlah: 0 }], opts);
    expect(ctx.errors.some((e) => e.includes("Jumlah tidak valid"))).toBe(true);
  });
  test("Akun_Lawan === Akun_Kas_Bank → warning (saling meniadakan), BUKAN error", () => {
    const ctx = otherDepositType.process([{ No_Voucher: "X", Tanggal: "2026-01-01", Akun_Kas_Bank: "A", Akun_Lawan: "A", Jumlah: 100 }], opts);
    expect(ctx.warnings.some((w) => w.includes("saling meniadakan"))).toBe(true);
    expect(ctx.errors).toEqual([]);
  });
  test("2 baris No_Voucher sama → digabung 1 dokumen (deposit contoh: penerimaan multi-akun)", () => {
    const rows = [
      { No_Voucher: "BKM-002", Tanggal: "2026-01-20", Akun_Kas_Bank: "1102-002", Akun_Lawan: "7100-003", Jumlah: 1000000 },
      { No_Voucher: "BKM-002", Tanggal: "2026-01-20", Akun_Kas_Bank: "1102-002", Akun_Lawan: "4200-001", Jumlah: 500000 },
    ];
    const ctx = otherDepositType.process(rows, opts);
    expect(ctx.order).toEqual(["BKM-002"]);
    expect(ctx.groups["BKM-002"]!.lines.length).toBe(2);
  });
});

describe("cashbookType.build — struktur XML PERSIS mirror tool.html baris 649-661", () => {
  test("otherDeposit 1 dokumen 1 baris — XML PERSIS sama karakter-per-karakter dengan legacy", () => {
    const rows = [{ No_Voucher: "BKM-001", Tanggal: "2026-01-12", Akun_Kas_Bank: "1102-002", Memo: "Bunga bank", Akun_Lawan: "7100-003", Jumlah: 3500000, Keterangan_Baris: "Jasa giro Januari", Project: "PRJ-01", Departemen: "DEPT-01" }];
    const ctx = otherDepositType.process(rows, opts);
    const xml = otherDepositType.build(ctx);
    const expectedBody =
      '<OTHERDEPOSIT operation="Add" REQUESTID="1"><TRANSACTIONID>1</TRANSACTIONID><ACCOUNTLINE operation="Add"><KeyID>1</KeyID><GLACCOUNT>7100-003</GLACCOUNT><GLAMOUNT>3500000</GLAMOUNT><DEPTID>DEPT-01</DEPTID><PROJECTID>PRJ-01</PROJECTID><DESCRIPTION>Jasa giro Januari</DESCRIPTION><RATE>1</RATE><PRIMEAMOUNT>3500000</PRIMEAMOUNT><TXDATE/><POSTED/><CURRENCYNAME/></ACCOUNTLINE><JVNUMBER>BKM-001</JVNUMBER><TRANSDATE>2026-01-12</TRANSDATE><SOURCE>GL</SOURCE><TRANSTYPE>other deposit</TRANSTYPE><TRANSDESCRIPTION>Bunga bank</TRANSDESCRIPTION><JVAMOUNT>3500000</JVAMOUNT><GLACCOUNT>1102-002</GLACCOUNT><RATE>1</RATE></OTHERDEPOSIT>';
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE">' + expectedBody + "</TRANSACTIONS></NMEXML>\r\n");
  });

  test("otherPayment root tag = OTHERPAYMENT + CHEQUENO/PAYEE muncul (BEDA dari deposit)", () => {
    const rows = [{ No_Voucher: "BKK-001", Tanggal: "2026-01-27", Akun_Kas_Bank: "1102-002", Memo: "Biaya ATK", Akun_Lawan: "6200-001", Jumlah: 500000, Keterangan_Baris: "Pembelian ATK", Penerima: "Toko Maju", No_Cek: "" }];
    const ctx = otherPaymentType.process(rows, opts);
    const xml = otherPaymentType.build(ctx);
    expect(xml).toContain("<OTHERPAYMENT ");
    expect(xml).toContain("<TRANSTYPE>other payment</TRANSTYPE>");
    expect(xml).toContain("<PAYEE>Toko Maju</PAYEE>");
    expect(xml).toContain("<VOIDCHEQUE>0</VOIDCHEQUE>");
    expect(xml).not.toContain("<OTHERDEPOSIT");
  });
});

describe("cashbookType.summary — mirror tool.html baris 663-668", () => {
  test("totals bilang 'Total penerimaan'/'Total pembayaran' sesuai kind", () => {
    const rows = [{ No_Voucher: "X", Tanggal: "2026-01-01", Akun_Kas_Bank: "A", Akun_Lawan: "B", Jumlah: 100000 }];
    expect(otherDepositType.summary(otherDepositType.process(rows, opts)).totals).toBe("Total penerimaan: 100.000 IDR");
    expect(otherPaymentType.summary(otherPaymentType.process(rows, opts)).totals).toBe("Total pembayaran: 100.000 IDR");
  });
});
