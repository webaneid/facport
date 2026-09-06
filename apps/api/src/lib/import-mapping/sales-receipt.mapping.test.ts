import { describe, test, expect } from "bun:test";
import {
  buildSalesReceiptPayload,
  groupSalesReceiptRows,
  validateGroupCustomerConsistencyForReceipt,
  receiptNumberColumnOf,
  type ImportRowRecord,
} from "./sales-receipt.mapping";

// § Fase 49 — audit data ASLI kompetitor (`docs/referencehtml/FACPORT_Sales
// Receipt_v5.xlsx`, 556 baris) menemukan SEMUA 137 struk penerimaan (100%)
// itu multi-faktur, bukan edge case. Test ini pakai kasus PERSIS contoh
// nyata dari file itu: 1 struk (No. Sales Receipt sama) bayar 2 faktur
// beda (Rp 18.800.000 + Rp 1.000.000).
const columnMapping = {
  Tanggal: "transDate",
  "No. Sales Receipt": "receiptNumber",
  "No Pelanggan": "customerNo",
  "Akun Bank/Kas": "bankNo",
  "No Faktur": "invoiceNo",
  "Jumlah Bayar": "chequeAmount",
};

function row(id: string, data: Record<string, unknown>): ImportRowRecord {
  return { id, rawData: data };
}

describe("groupSalesReceiptRows", () => {
  test("baris dengan No. Sales Receipt sama digabung jadi 1 grup (kasus nyata: 1 struk bayar 2 faktur)", () => {
    const rows = [
      row("1", { "No. Sales Receipt": "11010201.2026.06.00010", "No Faktur": "SI.2026.06.00015", "Jumlah Bayar": 18800000 }),
      row("2", { "No. Sales Receipt": "11010201.2026.06.00010", "No Faktur": "SI.2026.06.00017", "Jumlah Bayar": 1000000 }),
    ];
    const groups = groupSalesReceiptRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[0]!.receiptNumber).toBe("11010201.2026.06.00010");
  });

  test("No. Sales Receipt kosong tetap jadi grup sendiri per baris (behavior lama, non-breaking)", () => {
    const rows = [row("1", { "No Faktur": "SI-001" }), row("2", { "No Faktur": "SI-002" })];
    const groups = groupSalesReceiptRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom No. Sales Receipt tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "No. Sales Receipt": "R-001" }), row("2", { "No. Sales Receipt": "R-001" })];
    const mappingTanpaReceiptNumber = { "No Faktur": "invoiceNo" };
    const groups = groupSalesReceiptRows(rows, mappingTanpaReceiptNumber);
    expect(groups.length).toBe(2);
  });

  test("No. Sales Receipt sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "No. Sales Receipt": " r-001 " }), row("2", { "No. Sales Receipt": "R-001" })];
    const groups = groupSalesReceiptRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("validateGroupCustomerConsistencyForReceipt", () => {
  const mapping = { "No Pelanggan": "customerNo" };

  test("customerNo beda dalam 1 grup -> return pesan error", () => {
    const group = { receiptNumber: "R-001", rows: [row("1", { "No Pelanggan": "C1" }), row("2", { "No Pelanggan": "C2" })] };
    const result = validateGroupCustomerConsistencyForReceipt(group, mapping);
    expect(result).not.toBeNull();
    expect(result).toContain("R-001");
  });

  test("customerNo sama dalam 1 grup -> return null", () => {
    const group = { receiptNumber: "R-001", rows: [row("1", { "No Pelanggan": "C1" }), row("2", { "No Pelanggan": "C1" })] };
    expect(validateGroupCustomerConsistencyForReceipt(group, mapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { receiptNumber: null, rows: [row("1", { "No Pelanggan": "C1" })] };
    expect(validateGroupCustomerConsistencyForReceipt(group, mapping)).toBeNull();
  });
});

describe("receiptNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke receiptNumber", () => {
    expect(receiptNumberColumnOf(columnMapping)).toBe("No. Sales Receipt");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke receiptNumber", () => {
    expect(receiptNumberColumnOf({ "No Faktur": "invoiceNo" })).toBeNull();
  });
});

describe("buildSalesReceiptPayload", () => {
  test("1 baris (behavior lama) -> detailInvoice 1 elemen, chequeAmount = Jumlah Bayar baris itu", () => {
    const rawRows = [
      { Tanggal: "05/09/2026", "No Pelanggan": "C.00001", "Akun Bank/Kas": "1-10200", "No Faktur": "SI-001", "Jumlah Bayar": 5000000 },
    ];
    const payload = buildSalesReceiptPayload(rawRows, columnMapping);
    expect(payload.customerNo).toBe("C.00001");
    expect(payload.bankNo).toBe("1-10200");
    expect(payload.chequeAmount).toBe(5000000);
    expect(payload.detailInvoice).toEqual([{ invoiceNo: "SI-001", paymentAmount: 5000000 }]);
    expect(payload.number).toBeUndefined();
  });

  test("multi-baris 1 grup (kasus nyata kompetitor) -> detailInvoice N elemen, chequeAmount = SUM semua paymentAmount", () => {
    const rawRows = [
      {
        Tanggal: "05/09/2026",
        "No. Sales Receipt": "11010201.2026.06.00010",
        "No Pelanggan": "C.00017",
        "Akun Bank/Kas": "11010201",
        "No Faktur": "SI.2026.06.00015",
        "Jumlah Bayar": 18800000,
      },
      {
        "No. Sales Receipt": "11010201.2026.06.00010",
        "No Faktur": "SI.2026.06.00017",
        "Jumlah Bayar": 1000000,
      },
    ];
    const payload = buildSalesReceiptPayload(rawRows, columnMapping);
    // § header (customerNo/bankNo/transDate/receiptNumber) dari baris PERTAMA grup saja.
    expect(payload.customerNo).toBe("C.00017");
    expect(payload.bankNo).toBe("11010201");
    expect(payload.number).toBe("11010201.2026.06.00010");
    expect(payload.detailInvoice).toEqual([
      { invoiceNo: "SI.2026.06.00015", paymentAmount: 18800000 },
      { invoiceNo: "SI.2026.06.00017", paymentAmount: 1000000 },
    ]);
    expect(payload.chequeAmount).toBe(19800000);
  });
});
