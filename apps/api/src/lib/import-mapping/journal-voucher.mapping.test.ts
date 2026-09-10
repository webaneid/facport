import { describe, test, expect } from "bun:test";
import {
  buildJournalVoucherPayload,
  buildJournalVoucherPayloadTall,
  groupJournalVoucherRows,
  journalNumberColumnOf,
  formatOf,
  requiredFieldsFor,
  type ImportRowRecord,
} from "./journal-voucher.mapping";

const columnMapping = {
  Tanggal: "transDate",
  "Akun Debit": "debitAccountNo",
  "Nominal Debit": "debitAmount",
  "Akun Kredit": "creditAccountNo",
  "Nominal Kredit": "creditAmount",
  Keterangan: "description",
};

describe("buildJournalVoucherPayload", () => {
  test("jurnal seimbang → payload detailJournalVoucher 2 elemen (DEBIT lalu CREDIT)", () => {
    const payload = buildJournalVoucherPayload(
      {
        Tanggal: "05/09/2026",
        "Akun Debit": "6-20500",
        "Nominal Debit": 500000,
        "Akun Kredit": "1-10200",
        "Nominal Kredit": 500000,
        Keterangan: "Penyesuaian",
      },
      columnMapping,
    );

    expect(payload).toEqual({
      transDate: "05/09/2026",
      description: "Penyesuaian",
      detailJournalVoucher: [
        { accountNo: "6-20500", amount: 500000, amountType: "DEBIT" },
        { accountNo: "1-10200", amount: 500000, amountType: "CREDIT" },
      ],
    });
  });

  test("jurnal TIDAK seimbang → melempar Error, TIDAK panggil Accurate sama sekali", () => {
    expect(() =>
      buildJournalVoucherPayload(
        {
          Tanggal: "05/09/2026",
          "Akun Debit": "6-20500",
          "Nominal Debit": 500000,
          "Akun Kredit": "1-10200",
          "Nominal Kredit": 450000,
        },
        columnMapping,
      ),
    ).toThrow(/tidak seimbang/i);
  });

  test("description kosong (tidak di-mapping) → field tidak dikirim sama sekali", () => {
    const { Keterangan: _keterangan, ...mappingWithoutDescription } = columnMapping;
    const payload = buildJournalVoucherPayload(
      {
        Tanggal: "05/09/2026",
        "Akun Debit": "6-20500",
        "Nominal Debit": 100000,
        "Akun Kredit": "1-10200",
        "Nominal Kredit": 100000,
      },
      mappingWithoutDescription,
    );

    expect(payload.description).toBeUndefined();
  });
});

// § Fase 50 — Format Panjang (Opsi B, ala kompetitor). Audit data ASLI
// (`docs/referencehtml/FACPORT_BUKU_BESAR.xlsx`) menemukan mayoritas
// transaksi (1 sheet sampel, 84%) punya 3-6 baris/transaksi (N-akun) —
// format lebar (Opsi A, di atas) TIDAK BISA menampung ini sama sekali.
//
// § Fase 95 (2026-09-10) — kolom "JV Amount"/"JV Amount Type" GANTI
// TOTAL jadi "Debit"/"Credit" terpisah (§ komentar `debitCreditOf` di
// `journal-voucher.mapping.ts`), "Branch" jadi WAJIB. Field baru
// lainnya (Kurs, Memo, Department, Project, Subsidiary Type, Kategori
// Keuangan 1-10) diuji terpisah di bawah.
const tallColumnMapping = {
  "Trans Date": "transDate",
  "Transaction Number": "journalNumber",
  "Branch": "branchName",
  "JV No": "lineAccountNo",
  "Debit": "lineDebitAmount",
  "Credit": "lineCreditAmount",
  "Trans Description": "description",
};

function row(id: string, data: Record<string, unknown>): ImportRowRecord {
  return { id, rawData: data };
}

describe("formatOf", () => {
  test("kolom Format Lebar termapping -> 'wide'", () => {
    expect(formatOf({ "Akun Debit": "debitAccountNo", "Nominal Debit": "debitAmount" })).toBe("wide");
  });

  test("kolom Format Panjang termapping -> 'tall'", () => {
    expect(formatOf({ "JV No": "lineAccountNo", "Debit": "lineDebitAmount" })).toBe("tall");
  });

  test("tidak ada kolom format sama sekali -> null", () => {
    expect(formatOf({ Tanggal: "transDate" })).toBeNull();
  });

  test("kedua format termapping (campur) -> 'tall' menang (WAJIB lengkapi requiredFieldsTall)", () => {
    expect(formatOf({ "Akun Debit": "debitAccountNo", "JV No": "lineAccountNo" })).toBe("tall");
  });
});

describe("requiredFieldsFor", () => {
  test("'wide' -> requiredFields Opsi A (TIDAK BERUBAH)", () => {
    expect(requiredFieldsFor("wide")).toEqual(["transDate", "debitAccountNo", "debitAmount", "creditAccountNo", "creditAmount"]);
  });

  test("'tall' -> requiredFieldsTall Opsi B (§ Fase 95 — branchName + lineDebitAmount/lineCreditAmount BARU)", () => {
    expect(requiredFieldsFor("tall")).toEqual(["transDate", "journalNumber", "branchName", "lineAccountNo", "lineDebitAmount", "lineCreditAmount"]);
  });
});

describe("groupJournalVoucherRows", () => {
  test("baris dengan Transaction Number sama digabung jadi 1 grup (kasus nyata: jurnal 3 akun)", () => {
    const rows = [
      row("1", { "Transaction Number": "JV-001" }),
      row("2", { "Transaction Number": "JV-001" }),
      row("3", { "Transaction Number": "JV-001" }),
    ];
    const groups = groupJournalVoucherRows(rows, tallColumnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(3);
    expect(groups[0]!.journalNumber).toBe("JV-001");
  });

  test("Transaction Number beda -> grup terpisah", () => {
    const rows = [row("1", { "Transaction Number": "JV-001" }), row("2", { "Transaction Number": "JV-002" })];
    const groups = groupJournalVoucherRows(rows, tallColumnMapping);
    expect(groups.length).toBe(2);
  });
});

describe("journalNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke journalNumber", () => {
    expect(journalNumberColumnOf(tallColumnMapping)).toBe("Transaction Number");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke journalNumber", () => {
    expect(journalNumberColumnOf({ "JV No": "lineAccountNo" })).toBeNull();
  });
});

describe("buildJournalVoucherPayloadTall", () => {
  test("jurnal 2 akun seimbang -> detailJournalVoucher 2 elemen (tipe dari kolom Debit/Credit mana yang terisi)", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-001", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 500000 },
      { "Transaction Number": "JV-001", "JV No": "1-10200", "Credit": 500000 },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.transDate).toBe("05/09/2026");
    expect(payload.branchName).toBe("JAKARTA");
    expect(payload.detailJournalVoucher).toEqual([
      { accountNo: "6-20500", amount: 500000, amountType: "DEBIT" },
      { accountNo: "1-10200", amount: 500000, amountType: "CREDIT" },
    ]);
  });

  test("jurnal N akun (3 akun, split 1 debit ke 2 kredit) -> SUM debit = SUM kredit, tetap sukses", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-002", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 500000 },
      { "Transaction Number": "JV-002", "JV No": "1-10200", "Credit": 300000 },
      { "Transaction Number": "JV-002", "JV No": "1-10300", "Credit": 200000 },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.detailJournalVoucher).toHaveLength(3);
  });

  test("SUM debit != SUM kredit dalam 1 grup -> melempar Error, TIDAK panggil Accurate", () => {
    const rawRows = [
      { "Transaction Number": "JV-003", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 500000 },
      { "Transaction Number": "JV-003", "JV No": "1-10200", "Credit": 450000 },
    ];
    expect(() => buildJournalVoucherPayloadTall(rawRows, tallColumnMapping)).toThrow(/tidak seimbang/i);
  });

  // § Fase 95 — validasi BARU (ganti dari "tipe baris tidak dikenali",
  // sudah tidak relevan lagi karena tidak ada lagi kolom tipe manual).
  test("kolom Debit DAN Credit sama-sama terisi di 1 baris -> melempar Error jelas", () => {
    const rawRows = [{ "Transaction Number": "JV-004", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 100000, "Credit": 100000 }];
    expect(() => buildJournalVoucherPayloadTall(rawRows, tallColumnMapping)).toThrow(/sama-sama terisi/i);
  });

  test("kolom Debit DAN Credit sama-sama kosong di 1 baris -> melempar Error jelas", () => {
    const rawRows = [{ "Transaction Number": "JV-005", "Branch": "JAKARTA", "JV No": "6-20500" }];
    expect(() => buildJournalVoucherPayloadTall(rawRows, tallColumnMapping)).toThrow(/sama-sama kosong/i);
  });

  test("description dari baris pertama grup saja", () => {
    const rawRows = [
      { "Transaction Number": "JV-006", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 100000, "Trans Description": "Penyesuaian" },
      { "Transaction Number": "JV-006", "JV No": "1-10200", "Credit": 100000 },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.description).toBe("Penyesuaian");
  });

  test("branchName dari baris pertama grup saja (§ Fase 95, root/header sama pola transDate/description)", () => {
    const rawRows = [
      { "Transaction Number": "JV-006b", "Branch": "SURABAYA", "JV No": "6-20500", "Debit": 100000 },
      { "Transaction Number": "JV-006b", "Branch": "JAKARTA", "JV No": "1-10200", "Credit": 100000 },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.branchName).toBe("SURABAYA");
  });

  // § BUG DITEMUKAN & DIPERBAIKI (2026-09-10, audit) — `journalNumber`
  // sebelumnya TIDAK PERNAH ditulis ke `payload.number`, walau sudah
  // jadi kunci grouping sejak Fase 50 dan komentar mapping bilang harus
  // jadi Accurate `number`. Test ini persis yang tadinya kosong/tidak
  // ada, itu sebabnya bug lolos tanpa ketahuan.
  test("journalNumber (Transaction Number) dikirim sebagai payload.number", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-007", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 100000 },
      { "Transaction Number": "JV-007", "JV No": "1-10200", "Credit": 100000 },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.number).toBe("JV-007");
  });

  test("journalNumber kosong (baris tanpa Transaction Number, grup singleton) -> payload.number tidak dikirim sama sekali", () => {
    const rawRows = [{ "JV No": "6-20500", "Debit": 0 }];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.number).toBeUndefined();
  });

  // § Fase 95 — field opsional baru per baris (rate/primeAmount/
  // departmentName/projectNo/memo/subsidiaryType+customerNo/employeeNo/
  // vendorNo/dataClassification1-10Name via attribut1-10).
  describe("field opsional baru per baris", () => {
    const fullColumnMapping = {
      ...tallColumnMapping,
      "Kurs": "lineRate",
      "JV Prime Amount": "linePrimeAmount",
      "No Department": "lineDepartmentName",
      "No Project": "lineProjectNo",
      "Memo": "lineMemo",
      "JV Subsidiary Type": "lineSubsidiaryType",
      "JV Cust No": "lineCustomerNo",
      "Kategori Keuangan 1": "attribut1",
      "Classification 1": "attribut1", // § alias, kedua kolom map ke field yang sama
    };

    test("semua field opsional terisi -> ikut masuk ke elemen detailJournalVoucher", () => {
      const rawRows = [
        {
          "Trans Date": "05/09/2026",
          "Transaction Number": "JV-008",
          "Branch": "JAKARTA",
          "JV No": "111.102-03",
          "Debit": 100000,
          "Kurs": 15800,
          "JV Prime Amount": 6.33,
          "No Department": "DEPT001",
          "No Project": "PRJ001",
          "Memo": "Catatan baris ini",
          "JV Subsidiary Type": "CUSTOMER",
          "JV Cust No": "CUST001",
          "Kategori Keuangan 1": "CLS01",
        },
        { "Transaction Number": "JV-008", "JV No": "1-10200", "Credit": 100000 },
      ];
      const payload = buildJournalVoucherPayloadTall(rawRows, fullColumnMapping);
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
        { "Trans Date": "05/09/2026", "Transaction Number": "JV-009", "Branch": "JAKARTA", "JV No": "6-20500", "Debit": 100000 },
        { "Transaction Number": "JV-009", "JV No": "1-10200", "Credit": 100000 },
      ];
      const payload = buildJournalVoucherPayloadTall(rawRows, fullColumnMapping);
      expect(payload.detailJournalVoucher).toEqual([
        { accountNo: "6-20500", amount: 100000, amountType: "DEBIT" },
        { accountNo: "1-10200", amount: 100000, amountType: "CREDIT" },
      ]);
    });

    test("alias \"Classification 1\" dan \"Kategori Keuangan 1\" map ke field yang sama (attribut1)", () => {
      const rawRows = [{ "JV No": "6-20500", "Debit": 0, "Classification 1": "CLS-VIA-ALIAS" }];
      const mappingWithAliasOnly = { "JV No": "lineAccountNo", "Debit": "lineDebitAmount", "Classification 1": "attribut1" };
      const payload = buildJournalVoucherPayloadTall(rawRows, mappingWithAliasOnly);
      expect((payload.detailJournalVoucher as Record<string, unknown>[])[0]!.dataClassification1Name).toBe("CLS-VIA-ALIAS");
    });
  });
});
