import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { assertGroupSizeWithinLimit, describeAccurateFailure, parseMaxRowsPerTransaction, GroupTooLargeError } from "./accurate-group-guard";

describe("parseMaxRowsPerTransaction (env MAX_ROWS_PER_TRANSACTION)", () => {
  test("default 1000 bila kosong/tidak valid", () => {
    for (const raw of [undefined, "", "abc", "0", "-5", "12.5"]) expect(parseMaxRowsPerTransaction(raw)).toBe(1000);
  });
  test("nilai valid dipakai, dijepit 50–10000", () => {
    expect(parseMaxRowsPerTransaction("300")).toBe(300);
    expect(parseMaxRowsPerTransaction("10")).toBe(50);
    expect(parseMaxRowsPerTransaction("999999")).toBe(10_000);
  });
});

describe("assertGroupSizeWithinLimit", () => {
  test("sampai batas → lolos", () => {
    expect(() => assertGroupSizeWithinLimit(1, 1000)).not.toThrow();
    expect(() => assertGroupSizeWithinLimit(1000, 1000)).not.toThrow();
  });
  test("melebihi batas → GroupTooLargeError dengan pesan bisa ditindaklanjuti (jumlah, batas, cara memperbaiki)", () => {
    try {
      assertGroupSizeWithinLimit(1248, 1000);
      throw new Error("harus melempar");
    } catch (err) {
      expect(err).toBeInstanceOf(GroupTooLargeError);
      const msg = (err as Error).message;
      expect(msg).toContain("1.248");
      expect(msg).toContain("1.000");
      expect(msg.toLowerCase()).toContain("pecah");
    }
  });
});

describe("describeAccurateFailure — pesan galat yang bermakna", () => {
  test("TimeoutError (AbortSignal/fetch) → pesan timeout yang menyarankan cek Accurate dulu", () => {
    const err = new DOMException("The operation timed out.", "TimeoutError");
    const msg = describeAccurateFailure(err);
    expect(msg).toContain("batas waktu");
    expect(msg.toLowerCase()).toContain("periksa");
    expect(msg.toLowerCase()).toContain("duplikat");
  });
  test("Error biasa dengan pesan 'The operation timed out.' juga dikenali", () => {
    expect(describeAccurateFailure(new Error("The operation timed out."))).toContain("batas waktu");
  });
  test("galat lain TIDAK diubah (pesan asli Accurate tetap tampil)", () => {
    expect(describeAccurateFailure(new Error('Pembayaran faktur "X" melebihi nilai piutang fakturnya'))).toBe('Pembayaran faktur "X" melebihi nilai piutang fakturnya');
    expect(describeAccurateFailure("teks biasa")).toBe("teks biasa");
  });
});

// Pagar: setiap loop grup di worker WAJIB memanggil guard ukuran di awal `try`, dan galatnya lewat describeAccurateFailure — modul baru tidak boleh lolos tanpa itu.
describe("pagar worker", () => {
  const src = readFileSync(`${import.meta.dir}/../workers/index.ts`, "utf8");
  test("setiap `for (const group of groups)` di handler import memanggil assertGroupSizeWithinLimit", () => {
    const loops = src.match(/for \(const group of groups\) \{\n\s*const rowIds = group\.rows\.map\(\(r\) => r\.id\);\n\s*try \{\n(?!\s*assertGroupSizeWithinLimit)/g) ?? [];
    const guarded = src.match(/for \(const group of groups\) \{\n\s*const rowIds = group\.rows\.map\(\(r\) => r\.id\);\n\s*try \{\n\s*assertGroupSizeWithinLimit\(group\.rows\.length\);/g) ?? [];
    expect(loops.length).toBe(0); // semua loop sudah ber-guard → tak ada loop "polos" tersisa
    expect(guarded.length).toBeGreaterThanOrEqual(22);
  });
  test("catch loop grup memakai describeAccurateFailure", () => {
    expect(src).not.toMatch(/status: "failed", errorMessage: err instanceof Error \? err\.message : String\(err\), processedAt: new Date\(\) \}\)\n\s*\.where\(inArray\(importBatchRows\.id, rowIds\)\)/);
  });
});
