import { describe, test, expect } from "bun:test";
import { describeImportActionError } from "./import-error-message";

// § diminta user 2026-09-27 (audit menyeluruh, Batch 3) — dulu kode
// `ACCURATE_SCOPE_MISSING` (dan `INVALID_MAPPING_FIELD`) tidak PERNAH
// ditangani di 23 modul, selalu jatuh ke pesan generik. Helper ini SATU
// sumber kebenaran dipakai oleh semua 23 halaman upload (`onConfirmMapping`)
// + 23 halaman detail (`handleRetry`).
describe("describeImportActionError", () => {
  test("MISSING_REQUIRED_FIELDS — sebut nama field yang belum dipetakan", () => {
    const msg = describeImportActionError({ code: "MISSING_REQUIRED_FIELDS", fields: ["customerNo", "itemNo"] }, "fallback");
    expect(msg).toBe("Field wajib belum dipetakan: customerNo, itemNo");
  });

  test("TRIAL_ROW_LIMIT_EXCEEDED — sebut sisa kuota", () => {
    const msg = describeImportActionError({ code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: 50, max: 100 }, "fallback");
    expect(msg).toBe("Kuota trial tidak cukup — sisa 50 dari 100 baris. Kurangi jumlah baris atau upgrade ke paket berbayar.");
  });

  test("ACCURATE_SCOPE_MISSING — sebut scope yang kurang + arahkan ke Koneksi Accurate", () => {
    const msg = describeImportActionError({ code: "ACCURATE_SCOPE_MISSING", missing: ["sales_quotation_view", "sales_quotation_save"] }, "fallback");
    expect(msg).toContain("sales_quotation_view, sales_quotation_save");
    expect(msg).toContain("Koneksi Accurate");
  });

  test("ACCURATE_SCOPE_MISSING tanpa daftar missing (kosong/undefined) — tetap arahkan ke Koneksi Accurate, tanpa daftar kosong aneh", () => {
    const msg = describeImportActionError({ code: "ACCURATE_SCOPE_MISSING" }, "fallback");
    expect(msg).toContain("Koneksi Accurate");
    expect(msg).not.toContain("()");
  });

  test("INVALID_MAPPING_FIELD — pesan spesifik soal pemetaan kolom", () => {
    const msg = describeImportActionError({ code: "INVALID_MAPPING_FIELD" }, "fallback");
    expect(msg).toContain("pemetaan kolom");
  });

  test("kode tidak dikenal — balikin fallback apa adanya", () => {
    expect(describeImportActionError({ code: "SOME_OTHER_CODE" }, "Pesan default")).toBe("Pesan default");
  });

  test("value undefined — balikin fallback apa adanya", () => {
    expect(describeImportActionError(undefined, "Pesan default")).toBe("Pesan default");
  });
});
