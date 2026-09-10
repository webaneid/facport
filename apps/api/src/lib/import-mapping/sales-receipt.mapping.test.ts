import { describe, test, expect } from "bun:test";
import {
  buildSalesReceiptPayload,
  groupSalesReceiptRows,
  validateGroupCustomerConsistencyForReceipt,
  receiptNumberColumnOf,
  extractTaxIdsFromRows,
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

// § Fase 85 (2026-09-10) — 18 field baru, dikonfirmasi 4 sumber
// independen (spec resmi + template kompetitor + screenshot UI +
// dokumentasi resmi /api/tax). § architecture-sales-receipt.md §
// "Ekspansi Field Opsional — Fase 85".
describe("buildSalesReceiptPayload — Fase 85 (field root baru)", () => {
  const fullColumnMapping = {
    ...columnMapping,
    Description: "description",
    Branch: "branchName",
    "Currency Code": "currencyCode",
    kurs: "rate",
    "Cheque No": "chequeNo",
    "Cheque Date": "chequeDate",
    "Payment Method": "paymentMethod",
    "Pass Validate Inv Date": "passValidateInvoiceDate",
    "Use credit": "useCredit",
  };

  test("field root opsional baru masuk payload kalau di-mapping & terisi", () => {
    const rawRows = [
      {
        Tanggal: "05/09/2026",
        "No Pelanggan": "C.00001",
        "Akun Bank/Kas": "1-10200",
        "No Faktur": "SI-001",
        "Jumlah Bayar": 5000000,
        Description: "Pelunasan September",
        Branch: "Cabang Jakarta",
        "Currency Code": "IDR",
        kurs: 1,
        "Cheque No": "CQ-001",
        "Cheque Date": "05/09/2026",
        "Payment Method": "Cek/Giro",
        "Pass Validate Inv Date": "Y",
        "Use credit": "Y",
      },
    ];
    const payload = buildSalesReceiptPayload(rawRows, fullColumnMapping);
    expect(payload.description).toBe("Pelunasan September");
    expect(payload.branchName).toBe("Cabang Jakarta");
    expect(payload.currencyCode).toBe("IDR");
    expect(payload.rate).toBe(1);
    expect(payload.chequeNo).toBe("CQ-001");
    expect(payload.chequeDate).toBe("05/09/2026");
    expect(payload.paymentMethod).toBe("BANK_CHEQUE");
    expect(payload.passValidateInvoiceDate).toBe(true);
    expect(payload.useCredit).toBe(true);
  });

  test("field opsional baru TIDAK masuk payload kalau tidak di-mapping/kosong (non-breaking)", () => {
    const rawRows = [
      { Tanggal: "05/09/2026", "No Pelanggan": "C.00001", "Akun Bank/Kas": "1-10200", "No Faktur": "SI-001", "Jumlah Bayar": 5000000 },
    ];
    const payload = buildSalesReceiptPayload(rawRows, columnMapping);
    expect(payload.description).toBeUndefined();
    expect(payload.branchName).toBeUndefined();
    expect(payload.chequeNo).toBeUndefined();
    expect(payload.paymentMethod).toBeUndefined();
    expect(payload.useCredit).toBeUndefined();
  });

  describe("paymentMethod — terjemahan label Indonesia ke enum API", () => {
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
        const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000, "Payment Method": label }];
        const payload = buildSalesReceiptPayload(rawRows, fullColumnMapping);
        expect(payload.paymentMethod).toBe(enumValue);
      });
    }

    test("enum API langsung (mis. 'CASH_OTHER') diterima apa adanya", () => {
      const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000, "Payment Method": "CASH_OTHER" }];
      const payload = buildSalesReceiptPayload(rawRows, fullColumnMapping);
      expect(payload.paymentMethod).toBe("CASH_OTHER");
    });

    test("nilai tidak dikenal diteruskan apa adanya (biar Accurate yang reject)", () => {
      const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000, "Payment Method": "Bitcoin" }];
      const payload = buildSalesReceiptPayload(rawRows, fullColumnMapping);
      expect(payload.paymentMethod).toBe("Bitcoin");
    });
  });

  describe("boolean 'Y'/kosong — passValidateInvoiceDate/useCredit/paidPph", () => {
    test("'Y'/'y'/'ya' jadi true, kosong jadi undefined (bukan false)", () => {
      const rawRows = [
        { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000, "Use credit": "Y", "Pass Validate Inv Date": "ya" },
      ];
      const payload = buildSalesReceiptPayload(rawRows, fullColumnMapping);
      expect(payload.useCredit).toBe(true);
      expect(payload.passValidateInvoiceDate).toBe(true);
    });

    test("nilai selain Y (mis. 'N'/'Tidak') jadi false, bukan diabaikan", () => {
      const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000, "Use credit": "N" }];
      const payload = buildSalesReceiptPayload(rawRows, fullColumnMapping);
      expect(payload.useCredit).toBe(false);
    });
  });

  test("presisi desimal 6 digit TIDAK dibulatkan/dipotong (rate, Cheque Amount eksplisit, Discount)", () => {
    const mapping = { ...fullColumnMapping, "Cheque Amount": "receiptTotalAmount" };
    const rawRows = [
      { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000, kurs: 12600.000001, "Cheque Amount": 1000000.123456 },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    expect(payload.rate).toBe(12600.000001);
    expect(payload.chequeAmount).toBe(1000000.123456);
  });
});

describe("buildSalesReceiptPayload — Fase 85 (Cheque Amount eksplisit vs auto-SUM)", () => {
  const mapping = { ...columnMapping, "Cheque Amount": "receiptTotalAmount" };

  test("Cheque Amount diisi -> dipakai APA ADANYA, BUKAN auto-SUM", () => {
    const rawRows = [
      { "No. Sales Receipt": "R1", "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 5000000, "Cheque Amount": 4000000 },
      { "No. Sales Receipt": "R1", "No Faktur": "SI-2", "Jumlah Bayar": 1000000 },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    // SUM sebenarnya 6.000.000, tapi Cheque Amount eksplisit (4.000.000) yang menang
    expect(payload.chequeAmount).toBe(4000000);
  });

  test("Cheque Amount TIDAK diisi -> tetap fallback auto-SUM (zero regression Fase 49)", () => {
    const rawRows = [
      { "No. Sales Receipt": "R1", "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 5000000 },
      { "No. Sales Receipt": "R1", "No Faktur": "SI-2", "Jumlah Bayar": 1000000 },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    expect(payload.chequeAmount).toBe(6000000);
  });

  // § Fase 90 (2026-09-10, BUG DITEMUKAN via test call NYATA ke Accurate,
  // vendor/customer mata uang asing SGD) — auto-SUM HARUS dikalikan
  // `rate` supaya root `chequeAmount` benar dalam mata uang BANK,
  // BUKAN mata uang faktur. Dikonfirmasi Accurate menolak
  // "Total Debit dan Kredit tidak cocok" tanpa perkalian ini.
  const mappingWithRate = { ...columnMapping, kurs: "rate" };

  test("auto-SUM DIKALIKAN rate kalau mata uang asing (kurs != 1) — BUG FIX Fase 90", () => {
    const rawRows = [
      { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1, kurs: 12600.000001 },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mappingWithRate);
    // 1 (SGD, mata uang faktur) x 12600.000001 (kurs) = 12600.000001 (IDR, mata uang bank)
    expect(payload.chequeAmount).toBe(12600.000001);
  });

  test("rate TIDAK diisi -> auto-SUM kali 1 (zero regression transaksi mata uang dasar)", () => {
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 5000000 }];
    const payload = buildSalesReceiptPayload(rawRows, mappingWithRate);
    expect(payload.chequeAmount).toBe(5000000);
  });

  test("Cheque Amount eksplisit tetap menang, TIDAK ikut dikalikan rate (user kontrol penuh)", () => {
    const mapping2 = { ...mappingWithRate, "Cheque Amount": "receiptTotalAmount" };
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1, kurs: 12600, "Cheque Amount": 999 }];
    const payload = buildSalesReceiptPayload(rawRows, mapping2);
    expect(payload.chequeAmount).toBe(999);
  });
});

describe("buildSalesReceiptPayload — Fase 85 (detailInvoice[].departmentName/paidPph/pphNumber)", () => {
  const mapping = {
    ...columnMapping,
    Department: "invoiceDepartmentName",
    "Paid PPH": "paidPph",
    "PPh No": "pphNumber",
  };

  test("field per-baris masuk ke detailInvoice[i], BUKAN root", () => {
    const rawRows = [
      { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, Department: "Marketing", "Paid PPH": "Y", "PPh No": "PPH-001" },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    expect(payload.departmentName).toBeUndefined();
    expect(payload.paidPph).toBeUndefined();
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.departmentName).toBe("Marketing");
    expect(detail.paidPph).toBe(true);
    expect(detail.pphNumber).toBe("PPH-001");
  });

  test("baris tanpa data ini -> detailInvoice[i] TIDAK punya key tambahan (non-breaking)", () => {
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000 }];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail).toEqual({ invoiceNo: "SI-1", paymentAmount: 1000000 });
  });
});

describe("buildSalesReceiptPayload — Fase 85 (detailInvoice[].detailDiscount[])", () => {
  const mapping = {
    ...columnMapping,
    Discount: "discountAmount",
    "Discount Acc": "discountAccountNo",
    "Discount Note": "discountNotes",
    "Diskon - Dept": "discountDepartmentName",
    "Diskon - Project No": "discountProjectNo",
  };

  test("Discount + Discount Acc terisi -> detailDiscount masuk NESTED di dalam detailInvoice[i], BUKAN sibling", () => {
    const rawRows = [
      {
        "No Pelanggan": "C1",
        "No Faktur": "SI-1",
        "Jumlah Bayar": 1000000,
        Discount: 50000,
        "Discount Acc": "4-90000",
        "Discount Note": "Diskon pelunasan cepat",
        "Diskon - Dept": "Sales",
        "Diskon - Project No": "PRJ-001",
      },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    expect(payload.detailDiscount).toBeUndefined();
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.detailDiscount).toEqual([
      { amount: 50000, accountNo: "4-90000", discountNotes: "Diskon pelunasan cepat", departmentName: "Sales", projectNo: "PRJ-001" },
    ]);
  });

  test("cuma Discount terisi TANPA Discount Acc -> TIDAK dianggap punya data diskon (syarat minimal tidak terpenuhi)", () => {
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, Discount: 50000 }];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.detailDiscount).toBeUndefined();
  });

  test("cuma Discount Acc terisi TANPA Discount -> TIDAK dianggap punya data diskon", () => {
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, "Discount Acc": "4-90000" }];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.detailDiscount).toBeUndefined();
  });

  test("presisi desimal 6 digit di Discount amount TIDAK dibulatkan", () => {
    const rawRows = [
      { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, Discount: 95275.123456, "Discount Acc": "4-90000" },
    ];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    const discount = (detail.detailDiscount as Record<string, unknown>[])[0]!;
    expect(discount.amount).toBe(95275.123456);
  });
});

// § Fase 86 (2026-09-10) — "Tax ID" VALIDASI-ONLY: `sales-receipt/save.do`
// TIDAK punya field ini, jadi nilai kolom Excel "Tax ID" TIDAK PERNAH
// boleh muncul di payload manapun (root ATAU detailInvoice[]) — cuma
// dipakai worker (`validateTaxIdsForReceipt`) untuk lookup ke Master
// Data Pajak Accurate SEBELUM payload dibangun.
describe("extractTaxIdsFromRows — Fase 86", () => {
  const mapping = { ...columnMapping, "Tax ID": "taxId" };

  test("kumpulkan nilai Tax ID unik dari semua baris, dedupe", () => {
    const rawRows = [
      { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, "Tax ID": "Jasa Kebersihan" },
      { "No Pelanggan": "C1", "No Faktur": "SI-2", "Jumlah Bayar": 500000, "Tax ID": "Jasa Kebersihan" },
      { "No Pelanggan": "C1", "No Faktur": "SI-3", "Jumlah Bayar": 250000, "Tax ID": "PPN" },
    ];
    expect(extractTaxIdsFromRows(rawRows, mapping)).toEqual(["Jasa Kebersihan", "PPN"]);
  });

  test("baris tanpa Tax ID (kosong/tidak di-mapping) diabaikan", () => {
    const rawRows = [
      { "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, "Tax ID": "" },
      { "No Pelanggan": "C1", "No Faktur": "SI-2", "Jumlah Bayar": 500000 },
    ];
    expect(extractTaxIdsFromRows(rawRows, mapping)).toEqual([]);
  });

  test("kolom Tax ID tidak di-mapping sama sekali -> tetap array kosong, tidak error", () => {
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000 }];
    expect(extractTaxIdsFromRows(rawRows, columnMapping)).toEqual([]);
  });
});

describe("buildSalesReceiptPayload — Fase 86 (Tax ID TIDAK PERNAH masuk payload)", () => {
  const mapping = { ...columnMapping, "Tax ID": "taxId" };

  test("Tax ID terisi -> tidak muncul di root payload maupun detailInvoice[]", () => {
    const rawRows = [{ "No Pelanggan": "C1", "No Faktur": "SI-1", "Jumlah Bayar": 1000000, "Tax ID": "Jasa Kebersihan" }];
    const payload = buildSalesReceiptPayload(rawRows, mapping);
    expect(payload.taxId).toBeUndefined();
    const detail = (payload.detailInvoice as Record<string, unknown>[])[0]!;
    expect(detail.taxId).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("Jasa Kebersihan");
  });
});
