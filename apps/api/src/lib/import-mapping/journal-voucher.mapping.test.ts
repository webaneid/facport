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
const tallColumnMapping = {
  "Trans Date": "transDate",
  "Transaction Number": "journalNumber",
  "JV No": "lineAccountNo",
  "JV Amount": "lineAmount",
  "JV Amount Type": "lineAmountType",
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
    expect(formatOf({ "JV No": "lineAccountNo", "JV Amount": "lineAmount" })).toBe("tall");
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

  test("'tall' -> requiredFieldsTall Opsi B", () => {
    expect(requiredFieldsFor("tall")).toEqual(["transDate", "journalNumber", "lineAccountNo", "lineAmount", "lineAmountType"]);
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
  test("jurnal 2 akun seimbang -> detailJournalVoucher 2 elemen", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-001", "JV No": "6-20500", "JV Amount": 500000, "JV Amount Type": "DEBIT" },
      { "Transaction Number": "JV-001", "JV No": "1-10200", "JV Amount": 500000, "JV Amount Type": "CREDIT" },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.transDate).toBe("05/09/2026");
    expect(payload.detailJournalVoucher).toEqual([
      { accountNo: "6-20500", amount: 500000, amountType: "DEBIT" },
      { accountNo: "1-10200", amount: 500000, amountType: "CREDIT" },
    ]);
  });

  test("jurnal N akun (3 akun, split 1 debit ke 2 kredit) -> SUM debit = SUM kredit, tetap sukses", () => {
    const rawRows = [
      { "Trans Date": "05/09/2026", "Transaction Number": "JV-002", "JV No": "6-20500", "JV Amount": 500000, "JV Amount Type": "DEBIT" },
      { "Transaction Number": "JV-002", "JV No": "1-10200", "JV Amount": 300000, "JV Amount Type": "CREDIT" },
      { "Transaction Number": "JV-002", "JV No": "1-10300", "JV Amount": 200000, "JV Amount Type": "CREDIT" },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.detailJournalVoucher).toHaveLength(3);
  });

  test("SUM debit != SUM kredit dalam 1 grup -> melempar Error, TIDAK panggil Accurate", () => {
    const rawRows = [
      { "Transaction Number": "JV-003", "JV No": "6-20500", "JV Amount": 500000, "JV Amount Type": "DEBIT" },
      { "Transaction Number": "JV-003", "JV No": "1-10200", "JV Amount": 450000, "JV Amount Type": "CREDIT" },
    ];
    expect(() => buildJournalVoucherPayloadTall(rawRows, tallColumnMapping)).toThrow(/tidak seimbang/i);
  });

  test("normalisasi tipe baris: 'D'/'K' (singkatan Indonesia) sama efeknya dengan 'DEBIT'/'CREDIT'", () => {
    const rawRows = [
      { "Transaction Number": "JV-004", "JV No": "6-20500", "JV Amount": 100000, "JV Amount Type": "D" },
      { "Transaction Number": "JV-004", "JV No": "1-10200", "JV Amount": 100000, "JV Amount Type": "K" },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.detailJournalVoucher).toEqual([
      { accountNo: "6-20500", amount: 100000, amountType: "DEBIT" },
      { accountNo: "1-10200", amount: 100000, amountType: "CREDIT" },
    ]);
  });

  test("tipe baris tidak dikenali -> melempar Error jelas", () => {
    const rawRows = [{ "Transaction Number": "JV-005", "JV No": "6-20500", "JV Amount": 100000, "JV Amount Type": "SALAH" }];
    expect(() => buildJournalVoucherPayloadTall(rawRows, tallColumnMapping)).toThrow(/tidak dikenali/i);
  });

  test("description dari baris pertama grup saja", () => {
    const rawRows = [
      { "Transaction Number": "JV-006", "JV No": "6-20500", "JV Amount": 100000, "JV Amount Type": "DEBIT", "Trans Description": "Penyesuaian" },
      { "Transaction Number": "JV-006", "JV No": "1-10200", "JV Amount": 100000, "JV Amount Type": "CREDIT" },
    ];
    const payload = buildJournalVoucherPayloadTall(rawRows, tallColumnMapping);
    expect(payload.description).toBe("Penyesuaian");
  });
});
