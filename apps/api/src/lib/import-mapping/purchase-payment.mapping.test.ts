import { describe, test, expect } from "bun:test";
import {
  buildPurchasePaymentPayload,
  groupPurchasePaymentRows,
  validateGroupVendorConsistencyForPayment,
  paymentNumberColumnOf,
  extractTaxIdsFromRows,
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

// § Fase 89 (2026-09-10) — ekspansi 16 field opsional sesuai wishlist
// client (`template-purchase-payment.xlsx`, copy dari template
// kompetitor `Sample_Format_Import_PP_v4.0.xlsx`), dikonfirmasi 5
// sumber independen (spec resmi, template kompetitor, 595 baris data
// TRANSAKSI ASLI, 5 screenshot UI Accurate asli). Detail lengkap →
// architecture-purchase-payment.md § "Ekspansi Field Opsional — Fase 89".
describe("buildPurchasePaymentPayload — Fase 89 (field root baru)", () => {
  const fullColumnMapping = {
    ...columnMapping,
    Description: "description",
    Branch: "branchName",
    "Currency Code": "currencyCode",
    Rate: "rate",
    "Cheque No": "chequeNo",
    "Cheque Date": "chequeDate",
    "Payment Method": "paymentMethod",
  };

  test("field root opsional baru masuk payload kalau di-mapping & terisi", () => {
    const rawRows = [
      {
        Date: "05/09/2026",
        "No. Supplier": "V.00070",
        "No. Bank Account": "100-101-004",
        "Invoice No": "INV-001",
        Payment: 5000000,
        Description: "Pelunasan September",
        Branch: "Cabang Jakarta",
        "Currency Code": "IDR",
        Rate: 1,
        "Cheque No": "CQ-001",
        "Cheque Date": "05/09/2026",
        "Payment Method": "Cek/Giro",
      },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, fullColumnMapping);
    expect(payload.description).toBe("Pelunasan September");
    expect(payload.branchName).toBe("Cabang Jakarta");
    expect(payload.currencyCode).toBe("IDR");
    expect(payload.rate).toBe(1);
    expect(payload.chequeNo).toBe("CQ-001");
    expect(payload.chequeDate).toBe("05/09/2026");
    expect(payload.paymentMethod).toBe("BANK_CHEQUE");
  });

  test("field opsional baru TIDAK masuk payload kalau tidak di-mapping/kosong (non-breaking)", () => {
    const rawRows = [
      { Date: "05/09/2026", "No. Supplier": "V.00070", "No. Bank Account": "100-101-004", "Invoice No": "INV-001", Payment: 5000000 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.description).toBeUndefined();
    expect(payload.branchName).toBeUndefined();
    expect(payload.chequeNo).toBeUndefined();
    expect(payload.paymentMethod).toBeUndefined();
  });

  describe("paymentMethod — terjemahan label Indonesia ke enum API (IDENTIK Sales Receipt)", () => {
    const cases: [string, string][] = [
      ["Tunai", "CASH_OTHER"],
      ["Cek/Giro", "BANK_CHEQUE"],
      ["Transfer Bank", "BANK_TRANSFER"],
      ["EDC", "EDC"],
      ["Kartu Debit", "DEBIT_CARD"],
      ["Kartu Kredit", "CREDIT_CARD"],
      ["QRIS", "QRIS"],
      ["Payment Link", "PAYMENT_LINK"],
      ["Virtual Account", "VIRTUAL_ACCOUNT"],
      ["Dompet Digital", "E_WALLET"],
      ["Non Tunai Lainnya", "OTHERS"],
    ];
    for (const [label, enumValue] of cases) {
      test(`"${label}" -> ${enumValue}`, () => {
        const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000, "Payment Method": label }];
        const payload = buildPurchasePaymentPayload(rawRows, fullColumnMapping);
        expect(payload.paymentMethod).toBe(enumValue);
      });
    }

    test("enum API langsung (mis. 'CASH_OTHER') diterima apa adanya", () => {
      const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000, "Payment Method": "CASH_OTHER" }];
      const payload = buildPurchasePaymentPayload(rawRows, fullColumnMapping);
      expect(payload.paymentMethod).toBe("CASH_OTHER");
    });

    test("nilai tidak dikenal diteruskan apa adanya (biar Accurate yang reject)", () => {
      const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000, "Payment Method": "Bitcoin" }];
      const payload = buildPurchasePaymentPayload(rawRows, fullColumnMapping);
      expect(payload.paymentMethod).toBe("Bitcoin");
    });
  });

  test("presisi desimal 6 digit TIDAK dibulatkan/dipotong (rate, Cheque Amount eksplisit)", () => {
    const mapping = { ...fullColumnMapping, "Cheque Amount": "paymentTotalAmount" };
    const rawRows = [
      { "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000, Rate: 12600.000001, "Cheque Amount": 1000000.123456 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    expect(payload.rate).toBe(12600.000001);
    expect(payload.chequeAmount).toBe(1000000.123456);
  });
});

describe("buildPurchasePaymentPayload — Fase 89 (Cheque Amount eksplisit vs auto-SUM)", () => {
  const mapping = { ...columnMapping, "Cheque Amount": "paymentTotalAmount" };

  test("Cheque Amount diisi -> dipakai APA ADANYA, BUKAN auto-SUM", () => {
    const rawRows = [
      { "Purchase Payment No": "PP1", "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 5000000, "Cheque Amount": 4000000 },
      { "Purchase Payment No": "PP1", "Invoice No": "INV-2", Payment: 1000000 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    // SUM sebenarnya 6.000.000, tapi Cheque Amount eksplisit (4.000.000) yang menang
    expect(payload.chequeAmount).toBe(4000000);
  });

  test("Cheque Amount TIDAK diisi -> tetap fallback auto-SUM (zero regression Fase 50)", () => {
    const rawRows = [
      { "Purchase Payment No": "PP1", "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 5000000 },
      { "Purchase Payment No": "PP1", "Invoice No": "INV-2", Payment: 1000000 },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    expect(payload.chequeAmount).toBe(6000000);
  });

  // § Fase 90 (2026-09-10, BUG DITEMUKAN via test call NYATA ke Accurate,
  // vendor "ASMUS" mata uang asing SGD, company "Retail Demo") —
  // auto-SUM HARUS dikalikan `rate` supaya root `chequeAmount` benar
  // dalam mata uang BANK, BUKAN mata uang faktur. Test call PERTAMA
  // tanpa perkalian ini ditolak Accurate: "Total Debit dan Kredit tidak
  // cocok sebesar 12,599.000001" — baru berhasil setelah dikalikan rate.
  const mappingWithRate = { ...columnMapping, Rate: "rate" };

  test("auto-SUM DIKALIKAN rate kalau mata uang asing (kurs != 1) — BUG FIX Fase 90, dikonfirmasi test call nyata", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1, Rate: 12600.000001 }];
    const payload = buildPurchasePaymentPayload(rawRows, mappingWithRate);
    // 1 (SGD, mata uang faktur) x 12600.000001 (kurs) = 12600.000001 (IDR, mata uang bank)
    expect(payload.chequeAmount).toBe(12600.000001);
  });

  test("rate TIDAK diisi -> auto-SUM kali 1 (zero regression transaksi mata uang dasar)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 5000000 }];
    const payload = buildPurchasePaymentPayload(rawRows, mappingWithRate);
    expect(payload.chequeAmount).toBe(5000000);
  });

  test("Cheque Amount eksplisit tetap menang, TIDAK ikut dikalikan rate (user kontrol penuh)", () => {
    const mapping2 = { ...mappingWithRate, "Cheque Amount": "paymentTotalAmount" };
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1, Rate: 12600, "Cheque Amount": 999 }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping2);
    expect(payload.chequeAmount).toBe(999);
  });
});

describe("buildPurchasePaymentPayload — Fase 89 (detailInvoice[].paidPph/pphNumber)", () => {
  const mapping = { ...columnMapping, "Paid PPH": "paidPph", "PPh No": "pphNumber" };

  test("field per-baris masuk ke detailInvoice[i], BUKAN root", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "Paid PPH": "Y", "PPh No": "PPH-001" }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    expect(payload.paidPph).toBeUndefined();
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.paidPph).toBe(true);
    expect(detail.pphNumber).toBe("PPH-001");
  });

  test("baris tanpa data ini -> detailInvoice[i] TIDAK punya key tambahan (non-breaking)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000 }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail).toEqual({ invoiceNo: "INV-1", paymentAmount: 1000000 });
  });

  test("'N'/nilai selain Y jadi false, bukan diabaikan", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "Paid PPH": "N" }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.paidPph).toBe(false);
  });
});

describe("buildPurchasePaymentPayload — Fase 89 (detailInvoice[].detailDiscount[])", () => {
  const mapping = {
    ...columnMapping,
    Discount: "discountAmount",
    "Discount Acc": "discountAccountNo",
    "Discount Note": "discountNotes",
    "Discount - Dept": "discountDepartmentName",
    "Discount - Project No": "discountProjectNo",
  };

  test("Discount + Discount Acc terisi -> detailDiscount masuk NESTED di dalam detailInvoice[i], BUKAN sibling", () => {
    const rawRows = [
      {
        "No. Supplier": "V1",
        "Invoice No": "INV-1",
        Payment: 1000000,
        Discount: 50000,
        "Discount Acc": "4-90000",
        "Discount Note": "Diskon pelunasan cepat",
        "Discount - Dept": "Purchasing",
        "Discount - Project No": "PRJ-001",
      },
    ];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    expect(payload.detailDiscount).toBeUndefined();
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.detailDiscount).toEqual([
      { amount: 50000, accountNo: "4-90000", discountNotes: "Diskon pelunasan cepat", departmentName: "Purchasing", projectNo: "PRJ-001" },
    ]);
  });

  test("cuma Discount terisi TANPA Discount Acc -> TIDAK dianggap punya data diskon (syarat minimal tidak terpenuhi)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, Discount: 50000 }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.detailDiscount).toBeUndefined();
  });

  test("cuma Discount Acc terisi TANPA Discount -> TIDAK dianggap punya data diskon", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "Discount Acc": "4-90000" }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.detailDiscount).toBeUndefined();
  });

  test("presisi desimal 6 digit di Discount amount TIDAK dibulatkan", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, Discount: 95275.123456, "Discount Acc": "4-90000" }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    const discount = (detail.detailDiscount as Record<string, unknown>[])[0]!;
    expect(discount.amount).toBe(95275.123456);
  });
});

// § Fase 89 — "PPh ID" VALIDASI-ONLY: `purchase-payment/save.do` TIDAK
// punya field ini, jadi nilai kolom Excel "PPh ID" TIDAK PERNAH boleh
// muncul di payload manapun (root ATAU detailInvoice[]) — cuma dipakai
// worker (`validateTaxIdsForPurchasePayment`) untuk lookup ke Master
// Data Pajak Accurate SEBELUM payload dibangun (reuse `accurate-tax.ts`).
describe("extractTaxIdsFromRows — Fase 89", () => {
  const mapping = { ...columnMapping, "PPh ID": "taxId" };

  test("kumpulkan nilai PPh ID unik dari semua baris, dedupe", () => {
    const rawRows = [
      { "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "PPh ID": "Jasa Kebersihan" },
      { "No. Supplier": "V1", "Invoice No": "INV-2", Payment: 500000, "PPh ID": "Jasa Kebersihan" },
      { "No. Supplier": "V1", "Invoice No": "INV-3", Payment: 250000, "PPh ID": "PPN" },
    ];
    expect(extractTaxIdsFromRows(rawRows, mapping)).toEqual(["Jasa Kebersihan", "PPN"]);
  });

  test("baris tanpa PPh ID (kosong/tidak di-mapping) diabaikan", () => {
    const rawRows = [
      { "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "PPh ID": "" },
      { "No. Supplier": "V1", "Invoice No": "INV-2", Payment: 500000 },
    ];
    expect(extractTaxIdsFromRows(rawRows, mapping)).toEqual([]);
  });

  test("kolom PPh ID tidak di-mapping sama sekali -> tetap array kosong, tidak error", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000 }];
    expect(extractTaxIdsFromRows(rawRows, columnMapping)).toEqual([]);
  });
});

// § Fase 100 (2026-09-10) — DIKOREKSI dari Fase 89, SPECULATIVE mirror
// Sales Receipt Fase 99 (BELUM dikonfirmasi resmi Accurate Support
// khusus endpoint ini — lihat komentar `taxId` di
// `purchase-payment.mapping.ts`). `buildPurchasePaymentPayload` TETAP
// sync/pure — resolve "PPh ID" jadi id numerik adalah tanggung jawab
// CALLER (`workers/index.ts` `resolveTaxIdsForPurchasePayment`),
// dilewatkan lewat parameter `resolvedTaxIds`.
describe("buildPurchasePaymentPayload — Fase 100 (detailTax di root, PPh ID/PPh Amount, speculative)", () => {
  const mapping = { ...columnMapping, "PPh ID": "taxId", "PPh Amount": "taxAmount" };

  test("PPh ID + PPh Amount terisi, resolvedTaxIds punya mapping-nya -> masuk detailTax[] di ROOT (bukan nested detailInvoice)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "PPh ID": "Jasa Kebersihan", "PPh Amount": 40000 }];
    const resolvedTaxIds = new Map([["Jasa Kebersihan", 350]]);
    const payload = buildPurchasePaymentPayload(rawRows, mapping, resolvedTaxIds);
    expect(payload.detailTax).toEqual([{ detailInvoiceNo: "INV-1", taxAmount: 40000, taxId: 350 }]);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.taxId).toBeUndefined();
    expect(detail.taxAmount).toBeUndefined();
  });

  test("resolvedTaxIds TIDAK punya mapping untuk PPh ID baris ini -> baris itu TIDAK masuk detailTax", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "PPh ID": "Jasa Kebersihan", "PPh Amount": 40000 }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping, new Map());
    expect(payload.detailTax).toBeUndefined();
  });

  test("PPh ID terisi tapi PPh Amount kosong -> TIDAK masuk detailTax (syarat minimal keduanya terisi)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000, "PPh ID": "Jasa Kebersihan" }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping, new Map([["Jasa Kebersihan", 350]]));
    expect(payload.detailTax).toBeUndefined();
  });

  test("tidak ada baris yang isi PPh ID/PPh Amount -> payload.detailTax tidak ada sama sekali (zero regression)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 1000000 }];
    const payload = buildPurchasePaymentPayload(rawRows, columnMapping);
    expect(payload.detailTax).toBeUndefined();
  });
});

// § 2026-10-06 (diminta user, mirror fix Sales Receipt) — root `chequeAmount` = Σ Payment − Σ PPh yang terkirim di `detailTax`.
describe("buildPurchasePaymentPayload — PPh mengurangi root chequeAmount (uang keluar dari bank)", () => {
  const mapping = { ...columnMapping, "PPh ID": "taxId", "PPh Amount": "taxAmount", "Cheque Amount": "paymentTotalAmount", kurs: "rate" };
  const taxIds = new Map([["PPh23", 350], ["PPh Lain", 10]]);

  test("bayar 100.000 + PPh 2.000 → bank 98.000; paymentAmount faktur TETAP penuh (mirror contoh resmi Sales Receipt)", () => {
    const rawRows = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 100000, "PPh ID": "PPh23", "PPh Amount": 2000 }];
    const payload = buildPurchasePaymentPayload(rawRows, mapping, taxIds);
    expect(payload.chequeAmount).toBe(98000);
    expect((payload.detailInvoice as { paymentAmount: number }[])[0]!.paymentAmount).toBe(100000);
  });

  test("beberapa faktur, hanya sebagian kena PPh → hanya PPh yang masuk detailTax yang dikurangkan", () => {
    const rawRows = [
      { "No. Supplier": "V1", "Purchase Payment No": "P1", "Invoice No": "INV-1", Payment: 100000, "PPh ID": "PPh23", "PPh Amount": 2000 },
      { "No. Supplier": "V1", "Purchase Payment No": "P1", "Invoice No": "INV-2", Payment: 50000 },
      { "No. Supplier": "V1", "Purchase Payment No": "P1", "Invoice No": "INV-3", Payment: 30000, "PPh ID": "PPh Lain", "PPh Amount": 600 },
    ];
    expect(buildPurchasePaymentPayload(rawRows, mapping, taxIds).chequeAmount).toBe(177400); // 180000 − 2000 − 600
  });

  test("PPh ID tidak ter-resolve / PPh Amount tanpa PPh ID / tanpa PPh → tidak ada pengurangan (perilaku lama)", () => {
    const unresolved = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 100000, "PPh ID": "TidakAda", "PPh Amount": 2000 }];
    const p = buildPurchasePaymentPayload(unresolved, mapping, taxIds);
    expect(p.detailTax).toBeUndefined();
    expect(p.chequeAmount).toBe(100000);
    const noId = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 100000, "PPh Amount": 2000 }];
    expect(buildPurchasePaymentPayload(noId, mapping, taxIds).chequeAmount).toBe(100000);
    const none = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 100000 }];
    expect(buildPurchasePaymentPayload(none, mapping, taxIds).chequeAmount).toBe(100000);
  });

  test("Cheque Amount EKSPLISIT dipakai apa adanya (tidak dikurangi PPh lagi); mata uang asing: (Σ payment − Σ PPh) × rate", () => {
    const explicit = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 100000, "PPh ID": "PPh23", "PPh Amount": 2000, "Cheque Amount": 98000 }];
    expect(buildPurchasePaymentPayload(explicit, mapping, taxIds).chequeAmount).toBe(98000);
    const foreign = [{ "No. Supplier": "V1", "Invoice No": "INV-1", Payment: 100, "PPh ID": "PPh23", "PPh Amount": 2, kurs: 15000 }];
    expect(buildPurchasePaymentPayload(foreign, mapping, taxIds).chequeAmount).toBe(98 * 15000);
  });
});
