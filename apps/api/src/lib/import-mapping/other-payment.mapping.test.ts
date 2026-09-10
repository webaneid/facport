import { describe, test, expect } from "bun:test";
import {
  buildOtherPaymentPayload,
  groupOtherPaymentRows,
  transNoColumnOf,
  extractDataClassificationValues,
  type ImportRowRecord,
} from "./other-payment.mapping";

// § architecture-other-payment.md — modul baru, grouping by "Trans No"
// sejak awal. TANPA validasi balance (beda dari Jurnal Umum).
const columnMapping = {
  "Trans Date": "transDate",
  "Trans No": "transNo",
  "Branch Name": "branchName",
  "Bank No": "bankNo",
  "Payee": "payee",
  "Acc No": "lineAccountNo",
  "Amount": "lineAmount",
  "Expense Name": "lineExpenseName",
};

function row(id: string, data: Record<string, unknown>): ImportRowRecord {
  return { id, rawData: data };
}

describe("groupOtherPaymentRows", () => {
  test("baris dengan Trans No sama digabung jadi 1 grup (jurnal 3 akun beban)", () => {
    const rows = [
      row("1", { "Trans No": "OP-001" }),
      row("2", { "Trans No": "OP-001" }),
      row("3", { "Trans No": "OP-001" }),
    ];
    const groups = groupOtherPaymentRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(3);
    expect(groups[0]!.transNo).toBe("OP-001");
  });

  test("Trans No beda -> grup terpisah", () => {
    const rows = [row("1", { "Trans No": "OP-001" }), row("2", { "Trans No": "OP-002" })];
    expect(groupOtherPaymentRows(rows, columnMapping).length).toBe(2);
  });

  test("baris TANPA Trans No -> grup singleton TETAP VALID (beda dari Jurnal Umum — 1 akun beban sah berdiri sendiri)", () => {
    const rows = [row("1", {})];
    const groups = groupOtherPaymentRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.transNo).toBeNull();
    expect(groups[0]!.rows.length).toBe(1);
  });
});

describe("transNoColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke transNo", () => {
    expect(transNoColumnOf(columnMapping)).toBe("Trans No");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke transNo", () => {
    expect(transNoColumnOf({ "Acc No": "lineAccountNo" })).toBeNull();
  });
});

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
    expect(extractDataClassificationValues({ "Acc No": "6-30100" }, columnMapping)).toEqual([]);
  });
});

describe("buildOtherPaymentPayload", () => {
  test("1 baris (1 akun beban) -> detailAccount 1 elemen, header terisi", () => {
    const rawRows = [
      {
        "Trans Date": "10/09/2026",
        "Trans No": "OP-001",
        "Branch Name": "JAKARTA",
        "Bank No": "1-10200",
        "Payee": "PLN",
        "Acc No": "6-30100",
        "Amount": 500000,
        "Expense Name": "Pembayaran listrik",
      },
    ];
    const payload = buildOtherPaymentPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("10/09/2026");
    expect(payload.branchName).toBe("JAKARTA");
    expect(payload.bankNo).toBe("1-10200");
    expect(payload.payee).toBe("PLN");
    expect(payload.number).toBe("OP-001");
    expect(payload.detailAccount).toEqual([{ accountNo: "6-30100", amount: 500000, expenseName: "Pembayaran listrik" }]);
  });

  // § BUG DITEMUKAN 2026-09-11 (client retest nyata, error Accurate
  // "Invalid field value for field dateField1/dateField2") — cell Excel
  // bertipe Tanggal ASLI (bukan teks) kebaca `parseExcelBuffer` sebagai
  // angka serial (epoch 1899-12-30), BUKAN string "DD/MM/YYYY".
  describe("konversi tanggal Excel serial -> DD/MM/YYYY (bug fix)", () => {
    const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
    const serialFor = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - EXCEL_EPOCH_UTC_MS) / 86400000;

    test("transDate berupa angka serial Excel -> dikonversi jadi DD/MM/YYYY, bukan dikirim mentah sebagai string angka", () => {
      const rawRows = [
        {
          "Trans Date": serialFor(2026, 9, 10),
          "Trans No": "OP-SERIAL-1",
          "Branch Name": "JAKARTA",
          "Bank No": "1-10200",
          "Payee": "PLN",
          "Acc No": "6-30100",
          "Amount": 500000,
          "Expense Name": "Listrik",
        },
      ];
      const payload = buildOtherPaymentPayload(rawRows, columnMapping);
      expect(payload.transDate).toBe("10/09/2026");
    });

    test("Atribut Tanggal 1/2 (dateField1/dateField2) berupa angka serial Excel -> dikonversi jadi DD/MM/YYYY", () => {
      const mapping = { ...columnMapping, "Atribut Tanggal 1": "attributTanggal1", "Atribut Tanggal 2": "attributTanggal2" };
      const rawRows = [
        {
          "Trans Date": "10/09/2026",
          "Trans No": "OP-SERIAL-2",
          "Branch Name": "JAKARTA",
          "Bank No": "1-10200",
          "Payee": "PLN",
          "Acc No": "6-30100",
          "Amount": 500000,
          "Expense Name": "Listrik",
          "Atribut Tanggal 1": serialFor(2026, 9, 10),
          "Atribut Tanggal 2": serialFor(2026, 12, 25),
        },
      ];
      const payload = buildOtherPaymentPayload(rawRows, mapping);
      expect(payload.dateField1).toBe("10/09/2026");
      expect(payload.dateField2).toBe("25/12/2026");
    });

    test("tanggal SUDAH string DD/MM/YYYY (bukan serial) -> tidak berubah (zero regression)", () => {
      const mapping = { ...columnMapping, "Atribut Tanggal 1": "attributTanggal1" };
      const rawRows = [
        { "Trans Date": "10/09/2026", "Trans No": "OP-SERIAL-3", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": 500000, "Expense Name": "Listrik", "Atribut Tanggal 1": "25/12/2026" },
      ];
      const payload = buildOtherPaymentPayload(rawRows, mapping);
      expect(payload.transDate).toBe("10/09/2026");
      expect(payload.dateField1).toBe("25/12/2026");
    });
  });

  test("jurnal N akun (3 baris, 1 Trans No) -> detailAccount 3 elemen", () => {
    const rawRows = [
      { "Trans Date": "10/09/2026", "Trans No": "OP-002", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": 300000, "Expense Name": "Listrik Kantor" },
      { "Trans No": "OP-002", "Acc No": "6-30200", "Amount": 200000, "Expense Name": "Listrik Gudang" },
      { "Trans No": "OP-002", "Acc No": "6-30300", "Amount": 100000, "Expense Name": "Air" },
    ];
    const payload = buildOtherPaymentPayload(rawRows, columnMapping);
    expect(payload.detailAccount).toHaveLength(3);
  });

  test("TIDAK ada validasi balance — total amount bebas berapa saja, tidak ada Error dilempar", () => {
    const rawRows = [
      { "Trans Date": "10/09/2026", "Trans No": "OP-003", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": 999999, "Expense Name": "Listrik" },
    ];
    expect(() => buildOtherPaymentPayload(rawRows, columnMapping)).not.toThrow();
  });

  test("transNo kosong (baris tanpa Trans No, grup singleton) -> payload.number tidak dikirim sama sekali", () => {
    const rawRows = [{ "Acc No": "6-30100", "Amount": 0, "Expense Name": "Test" }];
    const payload = buildOtherPaymentPayload(rawRows, columnMapping);
    expect(payload.number).toBeUndefined();
  });

  describe("field opsional", () => {
    const fullColumnMapping = {
      ...columnMapping,
      "Cheque No": "chequeNo",
      "Description": "description",
      "Rate": "rate",
      "Memo": "lineMemo",
      "Department": "lineDepartmentName",
      "Project No": "lineProjectNo",
      "Kategori Keuangan 1": "attribut1",
      "Atribut Tambahan 1": "attributTambahan1",
      "Atribut Number 1": "attributNumber1",
      "Atribut Tanggal 1": "attributTanggal1",
    };

    test("semua field opsional terisi -> root dari baris pertama, line dari masing-masing baris", () => {
      const rawRows = [
        {
          "Trans Date": "10/09/2026",
          "Trans No": "OP-004",
          "Branch Name": "JAKARTA",
          "Bank No": "1-10200",
          "Payee": "PLN",
          "Cheque No": "CQ-001",
          "Description": "Pembayaran bulanan",
          "Rate": 1,
          "Acc No": "6-30100",
          "Amount": 500000,
          "Expense Name": "Listrik",
          "Memo": "Catatan baris ini",
          "Department": "DEPT001",
          "Project No": "PRJ001",
          "Kategori Keuangan 1": "CLS01",
          "Atribut Tambahan 1": "ATT01",
          "Atribut Number 1": 42,
          "Atribut Tanggal 1": "10/09/2026",
        },
      ];
      const payload = buildOtherPaymentPayload(rawRows, fullColumnMapping);
      expect(payload.chequeNo).toBe("CQ-001");
      expect(payload.description).toBe("Pembayaran bulanan");
      expect(payload.rate).toBe(1);
      expect(payload.charField1).toBe("ATT01");
      expect(payload.numericField1).toBe(42);
      expect(payload.dateField1).toBe("10/09/2026");
      expect(payload.detailAccount).toEqual([
        {
          accountNo: "6-30100",
          amount: 500000,
          expenseName: "Listrik",
          memo: "Catatan baris ini",
          departmentName: "DEPT001",
          projectNo: "PRJ001",
          dataClassification1Name: "CLS01",
        },
      ]);
    });

    test("field opsional kosong -> tidak ikut masuk payload sama sekali", () => {
      const rawRows = [
        { "Trans Date": "10/09/2026", "Trans No": "OP-005", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": 500000, "Expense Name": "Listrik" },
      ];
      const payload = buildOtherPaymentPayload(rawRows, fullColumnMapping);
      expect(payload.chequeNo).toBeUndefined();
      expect(payload.rate).toBeUndefined();
      expect(payload.charField1).toBeUndefined();
      expect(payload.detailAccount).toEqual([{ accountNo: "6-30100", amount: 500000, expenseName: "Listrik" }]);
    });

    test("Atribut Tambahan/Number/Tanggal ROOT-level diambil dari baris PERTAMA grup saja, BUKAN per-baris", () => {
      const rawRows = [
        { "Trans No": "OP-006", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": 100000, "Expense Name": "A", "Atribut Tambahan 1": "DARI-BARIS-1" },
        { "Trans No": "OP-006", "Acc No": "6-30200", "Amount": 200000, "Expense Name": "B", "Atribut Tambahan 1": "DARI-BARIS-2-DIABAIKAN" },
      ];
      const payload = buildOtherPaymentPayload(rawRows, fullColumnMapping);
      expect(payload.charField1).toBe("DARI-BARIS-1");
    });
  });
});
