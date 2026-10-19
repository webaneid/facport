import { describe, test, expect } from "bun:test";
import { describeAccurateFailure } from "./accurate-group-guard";

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
