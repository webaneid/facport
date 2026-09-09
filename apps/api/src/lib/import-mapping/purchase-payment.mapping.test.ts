import { describe, test, expect } from "bun:test";
import {
  buildPurchasePaymentPayload,
  groupPurchasePaymentRows,
  validateGroupVendorConsistencyForPayment,
  paymentNumberColumnOf,
  type ImportRowRecord,
} from "./purchase-payment.mapping";

// § Fase 50 — mirror `sales-receipt.mapping.test.ts` (Fase 49). Audit
// data ASLI kompetitor (`docs/referencehtml/FACPORT_purchase_payment.xlsx`,
// 646 baris) menemukan 258 transaksi, 110 (43%) di antaranya bayar >1
// faktur sekaligus (sampai 30 faktur dalam 1 pembayaran).
const columnMapping = {
  Date: "transDate",
  "Purchase Payment No": "paymentNumber",
  "No. Supplier": "vendorNo",
  "No. Bank Account": "bankNo",
  "Invoice No": "invoiceNo",
  Payment: "chequeAmount",
};

function row(id: string, data: Record<string, unknown>): ImportRowRecord {
  return { id, rawData: data };
}

describe("groupPurchasePaymentRows", () => {
  test("baris dengan Purchase Payment No sama digabung jadi 1 grup (kasus nyata: 1 pembayaran bayar 2 faktur)", () => {
    const rows = [
      row("1", { "Purchase Payment No": "SMN-BCA5528/IV/26/00007", "Invoice No": "00034/SMN-API/IV/26", Payment: 362500 }),
      row("2", { "Purchase Payment No": "SMN-BCA5528/IV/26/00007", "Invoice No": "00035/SMN-API/IV/26", Payment: 258000 }),
    ];
    const groups = groupPurchasePaymentRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
    expect(groups[0]!.paymentNumber).toBe("SMN-BCA5528/IV/26/00007");
  });

  test("Purchase Payment No kosong tetap jadi grup sendiri per baris (behavior lama, non-breaking)", () => {
    const rows = [row("1", { "Invoice No": "INV-001" }), row("2", { "Invoice No": "INV-002" })];
    const groups = groupPurchasePaymentRows(rows, columnMapping);
    expect(groups.length).toBe(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  test("kolom Purchase Payment No tidak di-mapping sama sekali -> semua baris jadi grup singleton", () => {
    const rows = [row("1", { "Purchase Payment No": "PP-001" }), row("2", { "Purchase Payment No": "PP-001" })];
    const mappingTanpaPaymentNumber = { "Invoice No": "invoiceNo" };
    const groups = groupPurchasePaymentRows(rows, mappingTanpaPaymentNumber);
    expect(groups.length).toBe(2);
  });

  test("Purchase Payment No sama tapi beda kapital/whitespace tetap 1 grup", () => {
    const rows = [row("1", { "Purchase Payment No": " pp-001 " }), row("2", { "Purchase Payment No": "PP-001" })];
    const groups = groupPurchasePaymentRows(rows, columnMapping);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rows.length).toBe(2);
  });
});

describe("validateGroupVendorConsistencyForPayment", () => {
  const mapping = { "No. Supplier": "vendorNo" };

  test("vendorNo beda dalam 1 grup -> return pesan error", () => {
    const group = { paymentNumber: "PP-001", rows: [row("1", { "No. Supplier": "V1" }), row("2", { "No. Supplier": "V2" })] };
    const result = validateGroupVendorConsistencyForPayment(group, mapping);
    expect(result).not.toBeNull();
    expect(result).toContain("PP-001");
  });

  test("vendorNo sama dalam 1 grup -> return null", () => {
    const group = { paymentNumber: "PP-001", rows: [row("1", { "No. Supplier": "V1" }), row("2", { "No. Supplier": "V1" })] };
    expect(validateGroupVendorConsistencyForPayment(group, mapping)).toBeNull();
  });

  test("grup singleton -> selalu return null", () => {
    const group = { paymentNumber: null, rows: [row("1", { "No. Supplier": "V1" })] };
    expect(validateGroupVendorConsistencyForPayment(group, mapping)).toBeNull();
  });
});

describe("paymentNumberColumnOf", () => {
  test("return nama kolom Excel yang di-mapping ke paymentNumber", () => {
    expect(paymentNumberColumnOf(columnMapping)).toBe("Purchase Payment No");
  });

  test("return null kalau tidak ada kolom yang di-mapping ke paymentNumber", () => {
    expect(paymentNumberColumnOf({ "Invoice No": "invoiceNo" })).toBeNull();
  });
});

describe("buildPurchasePaymentPayload", () => {
  test("1 baris (behavior lama) -> detailInvoice 1 elemen, chequeAmount = Payment baris itu", () => {
    const rawRows = [{ Date: "05/09/2026", "No. Supplier": "V.00070", "No. Bank Account": "100-101-004", "Invoice No": "INV-001", Payment: 5000000 }];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.vendorNo).toBe("V.00070");
    expect(payload.bankNo).toBe("100-101-004");
    expect(payload.chequeAmount).toBe(5000000);
    expect(payload.detailInvoice).toEqual([{ invoiceNo: "INV-001", paymentAmount: 5000000 }]);
    expect(payload.number).toBeUndefined();
  });

  test("multi-baris 1 grup (kasus nyata kompetitor) -> detailInvoice N elemen, chequeAmount = SUM semua paymentAmount", () => {
    const rawRows = [
      {
        Date: "09/04/2026",
        "Purchase Payment No": "SMN-BCA5528/IV/26/00007",
        "No. Supplier": "V.00070",
        "No. Bank Account": "100-101-004",
        "Invoice No": "00034/SMN-API/IV/26",
        Payment: 362500,
      },
      {
        "Purchase Payment No": "SMN-BCA5528/IV/26/00007",
        "Invoice No": "00035/SMN-API/IV/26",
        Payment: 258000,
      },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.vendorNo).toBe("V.00070");
    expect(payload.number).toBe("SMN-BCA5528/IV/26/00007");
    expect(payload.detailInvoice).toEqual([
      { invoiceNo: "00034/SMN-API/IV/26", paymentAmount: 362500 },
      { invoiceNo: "00035/SMN-API/IV/26", paymentAmount: 258000 },
    ]);
    expect(payload.chequeAmount).toBe(620500);
  });
});

// § Fase 50 (BUG DITEMUKAN & DIPERBAIKI 2026-09-10) — `transDate`
// sebelumnya TIDAK PERNAH dinormalisasi (beda dari Sales
// Receipt/Purchase Invoice), jadi kalau Excel client pakai kolom
// tanggal ASLI (bukan diketik manual sebagai teks), nilainya angka
// serial Excel mentah dan dikirim apa adanya ke Accurate — pasti
// ditolak. Test ini pastikan bug itu TIDAK regresi.
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
function excelSerialOf(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - EXCEL_EPOCH_UTC_MS) / 86400000;
}

describe("buildPurchasePaymentPayload — normalisasi tanggal (Fase 50, bug fix)", () => {
  test("Date berupa angka serial Excel mentah -> dikonversi ke DD/MM/YYYY", () => {
    const rawRows = [
      { Date: excelSerialOf(2026, 9, 5), "No. Supplier": "V.00070", "No. Bank Account": "100-101-004", "Invoice No": "INV-001", Payment: 5000000 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("05/09/2026");
  });

  test("Date berupa string ISO (2026-09-05...) -> dikonversi ke DD/MM/YYYY", () => {
    const rawRows = [
      { Date: "2026-09-05T00:00:00.000Z", "No. Supplier": "V.00070", "No. Bank Account": "100-101-004", "Invoice No": "INV-001", Payment: 5000000 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("05/09/2026");
  });

  test("Date sudah format DD/MM/YYYY -> dibiarkan apa adanya (tidak ada regresi utk input manual)", () => {
    const rawRows = [
      { Date: "05/09/2026", "No. Supplier": "V.00070", "No. Bank Account": "100-101-004", "Invoice No": "INV-001", Payment: 5000000 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.transDate).toBe("05/09/2026");
  });
});
