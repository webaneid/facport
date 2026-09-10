import { describe, test, expect } from "bun:test";
import {
  buildJournalVoucherPayload,
  groupJournalVoucherRows,
  journalNumberColumnOf,
  debitCreditRowError,
  extractDataClassificationValues,
  type ImportRowRecord,
} from "./journal-voucher.mapping";

// § Fase 96 (2026-09-10) — Opsi A (format lebar) DIPENSIUNKAN TOTAL,
// kolom disederhanakan PERSIS `CLIENT_template-jurnal-umum-v2.xlsx`
// (26 kolom, tanpa alias ganda). "Nominal Debit"/"Nominal Kredit"
// SEKARANG jadi nama kolom kanonik untuk `lineDebitAmount`/
// `lineCreditAmount` (dulu milik Opsi A, sekarang bebas dipakai ulang
// karena Opsi A sudah tidak ada).
const columnMapping = {
  "Trans Date": "transDate",
  "Akun": "lineAccountNo",
  "Nominal Debit": "lineDebitAmount",
  "Nominal Kredit": "lineCreditAmount",
  "Trans Description": "description",
  "Transaction Number": "journalNumber",
  "Branch": "branchName",
};

function row(id: string, data: Record<string, unknown>): ImportRowRecord {
  return { id, rawData: data };
}

describe("groupJournalVoucherRows", () => {
  test("baris dengan Transaction Number sama digabung jadi 1 grup (kasus nyata: jurnal 3 akun)", () => {
    const rows = [
      row("1", { "Transaction Number": "JV-001" }),
      row("2", { "Transaction Number": "JV-001" }),
      row("3", { "Transaction Number": "JV-001" }),
    ];
    const groups = groupJournalVoucherRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(3);
    expect(groups[0]!.journalNumber).toBe("JV-001");
  });

  test("Transaction Number beda -> grup terpisah", () => {
    const rows = [row("1", { "Transaction Number": "JV-001" }), row("2", { "Transaction Number": "JV-002" })];
    const groups = groupJournalVoucherRows(rows, columnMapping);
    expect(groups.length).toBe(2);
  });
});

describe("journalNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke journalNumber", () => {
    expect(journalNumberColumnOf(columnMapping)).toBe("Transaction Number");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke journalNumber", () => {
    expect(journalNumberColumnOf({ "Akun": "lineAccountNo" })).toBeNull();
  });
});

describe("debitCreditRowError", () => {
  test("tepat satu terisi (Debit) -> tidak ada error", () => {
    expect(debitCreditRowError({ "Nominal Debit": 500000 }, columnMapping)).toEqual([]);
  });

  test("tepat satu terisi (Kredit) -> tidak ada error", () => {
    expect(debitCreditRowError({ "Nominal Kredit": 500000 }, columnMapping)).toEqual([]);
  });

  test("dua-duanya terisi -> error", () => {
    expect(debitCreditRowError({ "Nominal Debit": 500000, "Nominal Kredit": 500000 }, columnMapping)).toEqual([
      "lineDebitAmount",
      "lineCreditAmount",
    ]);
  });

  test("dua-duanya kosong -> error", () => {
    expect(debitCreditRowError({}, columnMapping)).toEqual(["lineDebitAmount", "lineCreditAmount"]);
  });
});

// § Fase 98 (2026-09-10) — dipakai worker (`ensureJournalVoucherDataClassifications`)
// buat auto-create Kategori Keuangan SEBELUM kirim ke Accurate, mirror
// `extractDataClassificationValues` Sales Invoice (Fase 68).
describe("extractDataClassificationValues", () => {
  const fullColumnMapping = { ...columnMapping, "Kategori Keuangan 1": "attribut1", "Kategori Keuangan 2": "attribut2" };

  test("kolom Kategori Keuangan terisi -> return {index, name}", () => {
    const result = extractDataClassificationValues({ "Kategori Keuangan 1": "CLS01", "Kategori Keuangan 2": "CLS02" }, fullColumnMapping);
    expect(result).toEqual([
      { index: 1, name: "CLS01" },
      { index: 2, name: "CLS02" },
    ]);
  });

  test("kolom kosong -> tidak ikut masuk hasil", () => {
    const result = extractDataClassificationValues({ "Kategori Keuangan 1": "", "Kategori Keuangan 2": "CLS02" }, fullColumnMapping);
    expect(result).toEqual([{ index: 2, name: "CLS02" }]);
  });

  test("tidak ada kolom attribut yang di-mapping -> array kosong", () => {
    expect(extractDataClassificationValues({ "Akun": "6-20500" }, columnMapping)).toEqual([]);
  });
});

// § Fase 101 (2026-09-11) — bug yang SAMA dengan Other Payment, ditemukan
// lewat audit proaktif (bukan laporan client langsung untuk JV): cell
// Excel bertipe Tanggal asli kebaca `parseExcelBuffer` sebagai angka
// serial, bukan string "DD/MM/YYYY" — sebelumnya cuma di-`String()` polos.
describe("buildJournalVoucherPayload — konversi tanggal Excel serial (bug fix)", () => {
  const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
  const serialFor = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - EXCEL_EPOCH_UTC_MS) / 86400000;

  test("transDate berupa angka serial Excel -> dikonversi jadi DD/MM/YYYY, bukan dikirim mentah sebagai string angka", () => {
    const rawRows = [
      { "Trans Date": serialFor(2026, 9, 5), "Transaction Number": "JV-SERIAL-1", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 500000 },
      { "Transaction Number": "JV-SERIAL-1", "Akun": "1-10200", "Nominal Kredit": 500000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("05/09/2026");
  });

  test("transDate SUDAH string DD/MM/YYYY (bukan serial) -> tidak berubah (zero regression)", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-SERIAL-2", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 500000 },
      { "Transaction Number": "JV-SERIAL-2", "Akun": "1-10200", "Nominal Kredit": 500000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("05/09/2026");
  });
});

describe("buildJournalVoucherPayload", () => {
  test("jurnal 2 akun seimbang -> detailJournalVoucher 2 elemen, branchName terisi", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-001", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 500000 },
      { "Transaction Number": "JV-001", "Akun": "1-10200", "Nominal Kredit": 500000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("05/09/2026");
    expect(payload.branchName).toBe("JAKARTA");
    expect(payload.detailJournalVoucher).toEqual([
      { accountNo: "6-20500", amount: 500000, amountType: "DEBIT" },
      { accountNo: "1-10200", amount: 500000, amountType: "CREDIT" },
    ]);
  });

  test("jurnal N akun (3 akun, split 1 debit ke 2 kredit) -> SUM debit = SUM kredit, tetap sukses", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-002", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 500000 },
      { "Transaction Number": "JV-002", "Akun": "1-10200", "Nominal Kredit": 300000 },
      { "Transaction Number": "JV-002", "Akun": "1-10300", "Nominal Kredit": 200000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.detailJournalVoucher).toHaveLength(3);
  });

  test("SUM debit != SUM kredit dalam 1 grup -> melempar Error, TIDAK panggil Accurate", () => {
    const rawRows = [
      { "Transaction Number": "JV-003", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 500000 },
      { "Transaction Number": "JV-003", "Akun": "1-10200", "Nominal Kredit": 450000 },
    ];
    expect(() => buildJournalVoucherPayload(rawRows, columnMapping)).toThrow(/tidak seimbang/i);
  });

  test("kolom Nominal Debit DAN Nominal Kredit sama-sama terisi di 1 baris -> melempar Error jelas", () => {
    const rawRows = [{ "Transaction Number": "JV-004", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 100000, "Nominal Kredit": 100000 }];
    expect(() => buildJournalVoucherPayload(rawRows, columnMapping)).toThrow(/sama-sama terisi/i);
  });

  test("kolom Nominal Debit dan Nominal Kredit sama-sama kosong di 1 baris -> melempar Error jelas", () => {
    const rawRows = [{ "Transaction Number": "JV-005", "Branch": "JAKARTA", "Akun": "6-20500" }];
    expect(() => buildJournalVoucherPayload(rawRows, columnMapping)).toThrow(/sama-sama kosong/i);
  });

  test("description dari baris pertama grup saja", () => {
    const rawRows = [
      { "Transaction Number": "JV-006", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 100000, "Trans Description": "Penyesuaian" },
      { "Transaction Number": "JV-006", "Akun": "1-10200", "Nominal Kredit": 100000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.description).toBe("Penyesuaian");
  });

  test("branchName dari baris pertama grup saja", () => {
    const rawRows = [
      { "Transaction Number": "JV-006b", "Branch": "SURABAYA", "Akun": "6-20500", "Nominal Debit": 100000 },
      { "Transaction Number": "JV-006b", "Branch": "JAKARTA", "Akun": "1-10200", "Nominal Kredit": 100000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.branchName).toBe("SURABAYA");
  });

  test("journalNumber (Transaction Number) dikirim sebagai payload.number", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-007", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 100000 },
      { "Transaction Number": "JV-007", "Akun": "1-10200", "Nominal Kredit": 100000 },
    ];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.number).toBe("JV-007");
  });

  test("journalNumber kosong (baris tanpa Transaction Number, grup singleton) -> payload.number tidak dikirim sama sekali", () => {
    const rawRows = [{ "Akun": "6-20500", "Nominal Debit": 0 }];
    const payload = buildJournalVoucherPayload(rawRows, columnMapping);
    expect(payload.number).toBeUndefined();
  });

  // § field opsional (rate/primeAmount/departmentName/projectNo/memo/
  // subsidiaryType+customerNo/employeeNo/vendorNo/dataClassification1-10Name).
  describe("field opsional", () => {
    const fullColumnMapping = {
      ...columnMapping,
      "Kurs": "lineRate",
      "JV Prime Amount": "linePrimeAmount",
      "No Department": "lineDepartmentName",
      "No Project": "lineProjectNo",
      "Memo": "lineMemo",
      "JV Subsidiary Type": "lineSubsidiaryType",
      "JV Cust No": "lineCustomerNo",
      "Kategori Keuangan 1": "attribut1",
    };

    test("semua field opsional terisi -> ikut masuk ke elemen detailJournalVoucher", () => {
      const rawRows = [
        {
          "Trans Date": "05/09/2026",
          "Transaction Number": "JV-008",
          "Branch": "JAKARTA",
          "Akun": "111.102-03",
          "Nominal Debit": 100000,
          "Kurs": 15800,
          "JV Prime Amount": 6.33,
          "No Department": "DEPT001",
          "No Project": "PRJ001",
          "Memo": "Catatan baris ini",
          "JV Subsidiary Type": "CUSTOMER",
          "JV Cust No": "CUST001",
          "Kategori Keuangan 1": "CLS01",
        },
        { "Transaction Number": "JV-008", "Akun": "1-10200", "Nominal Kredit": 100000 },
      ];
      const payload = buildJournalVoucherPayload(rawRows, fullColumnMapping);
      expect(payload.detailJournalVoucher).toEqual([
        {
          accountNo: "111.102-03",
          amount: 100000,
          amountType: "DEBIT",
          rate: 15800,
          primeAmount: 6.33,
          departmentName: "DEPT001",
          projectNo: "PRJ001",
          memo: "Catatan baris ini",
          subsidiaryType: "CUSTOMER",
          customerNo: "CUST001",
          dataClassification1Name: "CLS01",
        },
        { accountNo: "1-10200", amount: 100000, amountType: "CREDIT" },
      ]);
    });

    test("field opsional kosong -> tidak ikut masuk payload sama sekali (bukan string/angka kosong)", () => {
      const rawRows = [
        { "Trans Date": "05/09/2026", "Transaction Number": "JV-009", "Branch": "JAKARTA", "Akun": "6-20500", "Nominal Debit": 100000 },
        { "Transaction Number": "JV-009", "Akun": "1-10200", "Nominal Kredit": 100000 },
      ];
      const payload = buildJournalVoucherPayload(rawRows, fullColumnMapping);
      expect(payload.detailJournalVoucher).toEqual([
        { accountNo: "6-20500", amount: 100000, amountType: "DEBIT" },
        { accountNo: "1-10200", amount: 100000, amountType: "CREDIT" },
      ]);
    });
  });
});
