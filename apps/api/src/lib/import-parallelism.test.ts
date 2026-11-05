import { describe, test, expect } from "bun:test";
import { decideGroupParallelism, numberColumnsOf, parseParallelModules, DEFAULT_PARALLEL_MODULES } from "./import-parallelism";

// § Fase 215 — penjaga sebelum pengiriman paralel: modul terbukti + nomor dokumen eksplisit di SEMUA baris (nomor otomatis Accurate mengikuti urutan TIBA).
const siMapping = { "Customer No": "customerNo", "Trans No": "number", "Item No": "itemNo" };
const rowsWith = (numbers: unknown[], col = "Trans No") => numbers.map((n) => ({ rawData: { "Customer No": "C1", [col]: n, "Item No": "I1" } as Record<string, unknown> }));
const decide = (over: Partial<Parameters<typeof decideGroupParallelism>[0]> = {}) =>
  decideGroupParallelism({ module: "sales_invoice", rows: rowsWith(["A1", "A2", "A3"]), columnMapping: siMapping, configured: 4, ...over });

describe("decideGroupParallelism", () => {
  test("paralel mati (konfigurasi 1) → 1, alasan 'off'", () => {
    expect(decide({ configured: 1 })).toEqual({ parallelism: 1, reason: "off" });
  });

  test("semua baris bernomor + modul terbukti → paralel sesuai konfigurasi", () => {
    expect(decide()).toEqual({ parallelism: 4, reason: "ok" });
    expect(decide({ configured: 2 })).toEqual({ parallelism: 2, reason: "ok" });
  });

  test("SATU baris bernomor kosong / hanya spasi / null / undefined → seluruh batch berurutan", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(decide({ rows: rowsWith(["A1", blank, "A3"]) })).toEqual({ parallelism: 1, reason: "blank_numbers" });
    }
  });

  test("nomor numerik (termasuk 0) dianggap terisi", () => {
    expect(decide({ rows: rowsWith([1, 2, 0]) }).reason).toBe("ok");
  });

  test("kolom nomor tidak dipetakan sama sekali → berurutan", () => {
    expect(decide({ columnMapping: { "Customer No": "customerNo", "Item No": "itemNo" } })).toEqual({ parallelism: 1, reason: "no_number_column" });
  });

  test("modul yang belum terbukti → berurutan walau paralel dinyalakan dan bernomor", () => {
    expect(decide({ module: "journal_voucher" })).toEqual({ parallelism: 1, reason: "module_not_enabled" });
    expect(decide({ module: "purchase_return" }).reason).toBe("module_not_enabled");
  });

  test("daftar default = 4 modul terbukti, masing-masing dengan field nomornya sendiri", () => {
    expect([...DEFAULT_PARALLEL_MODULES].sort()).toEqual(["purchase_invoice", "purchase_payment", "sales_invoice", "sales_receipt", "sales_return"]);
    expect(numberColumnsOf("sales_receipt", { "No. Sales Receipt": "receiptNumber", "Customer No": "customerNo" })).toEqual(["No. Sales Receipt"]);
    expect(numberColumnsOf("purchase_payment", { "Purchase Payment No": "paymentNumber" })).toEqual(["Purchase Payment No"]);
    expect(numberColumnsOf("purchase_invoice", { "Trans No": "number", "Bill No": "billNumber" })).toEqual(["Trans No"]); // Bill No BUKAN nomor dokumen
  });

  test("Purchase Invoice: hanya 'Bill No' terisi tapi 'Trans No' kosong → tetap berurutan (nomor Accurate otomatis)", () => {
    const rows = [{ rawData: { "Trans No": "", "Bill No": "B-1" } as Record<string, unknown> }];
    expect(decideGroupParallelism({ module: "purchase_invoice", rows, columnMapping: { "Trans No": "number", "Bill No": "billNumber" }, configured: 4 }).reason).toBe("blank_numbers");
  });

  test("allowedModules='all' membuka modul lain, tetapi modul tanpa field nomor yang dikenal tetap berurutan", () => {
    expect(decide({ module: "journal_voucher", allowedModules: "all" })).toEqual({ parallelism: 1, reason: "no_number_column" });
  });

  test("Sales Receipt satu-baris-satu-dokumen TANPA kolom nomor penerimaan (pola uji sr1) → berurutan", () => {
    const rows = [{ rawData: { "No Faktur": "F1" } as Record<string, unknown> }, { rawData: { "No Faktur": "F2" } as Record<string, unknown> }];
    expect(decideGroupParallelism({ module: "sales_receipt", rows, columnMapping: { "No Faktur": "invoiceNo" }, configured: 4 }).reason).toBe("no_number_column");
  });

  test("batch tanpa baris (tidak ada yang perlu diproses) tidak melempar", () => {
    expect(decide({ rows: [] })).toEqual({ parallelism: 4, reason: "ok" });
  });
});

describe("Retur Penjualan di penjaga", () => {
  const retMapping = { "Customer No": "customerNo", "Retur No": "number", "Item No": "itemNo" };
  const rows = (nums: unknown[]) => nums.map((n) => ({ rawData: { "Retur No": n } as Record<string, unknown> }));
  test("ada di daftar default: bernomor → paralel; ada nomor kosong → berurutan", () => {
    expect(decideGroupParallelism({ module: "sales_return", rows: rows(["R1", "R2"]), columnMapping: retMapping, configured: 4 })).toEqual({ parallelism: 4, reason: "ok" });
    expect(decideGroupParallelism({ module: "sales_return", rows: rows(["R1", ""]), columnMapping: retMapping, configured: 4 }).reason).toBe("blank_numbers");
  });
  test("Retur Pembelian (belum terbukti) tetap berurutan", () => {
    expect(decideGroupParallelism({ module: "purchase_return", rows: rows(["R1"]), columnMapping: retMapping, configured: 4 }).reason).toBe("module_not_enabled");
  });
});

describe("parseParallelModules", () => {
  test("kosong/tidak diisi → daftar default; '*' → all; daftar koma dinormalkan (huruf kecil, spasi)", () => {
    expect(parseParallelModules(undefined)).toEqual(new Set(DEFAULT_PARALLEL_MODULES));
    expect(parseParallelModules("  ")).toEqual(new Set(DEFAULT_PARALLEL_MODULES));
    expect(parseParallelModules("*")).toBe("all");
    expect(parseParallelModules("Sales_Invoice , purchase_order")).toEqual(new Set(["sales_invoice", "purchase_order"]));
  });
});
