import { describe, test, expect } from "bun:test";
import { historyExportUrl, historyRangeError, historyExportErrorMessage } from "./history-export";

describe("history-export", () => {
  test("URL memuat rentang ter-encode", () => {
    expect(historyExportUrl("http://api", "2026-11-14", "2026-11-15")).toBe("http://api/autoproduksi/production-entries/export?from=2026-11-14&to=2026-11-15");
  });
  test("rentang: 1-2 hari valid; 3 hari, terbalik, kosong ditolak", () => {
    expect(historyRangeError("2026-11-14", "2026-11-14")).toBeNull();
    expect(historyRangeError("2026-10-31", "2026-11-01")).toBeNull();
    expect(historyRangeError("2026-11-14", "2026-11-16")).toMatch(/maksimal 2 hari/);
    expect(historyRangeError("2026-11-15", "2026-11-14")).toMatch(/sebelum/);
    expect(historyRangeError("", "")).toMatch(/Pilih tanggal/);
  });
  test("pesan galat server dipetakan", () => {
    expect(historyExportErrorMessage({ ok: false, status: 422, code: "RANGE_TOO_LONG" })).toMatch(/maksimal 2 hari/);
    expect(historyExportErrorMessage({ ok: false, status: 0, code: "NETWORK" })).toMatch(/koneksi/);
    expect(historyExportErrorMessage({ ok: false, status: 500, code: "UNKNOWN" })).toMatch(/Coba lagi/);
  });
});
