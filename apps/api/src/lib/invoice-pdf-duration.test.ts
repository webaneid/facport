import { describe, test, expect } from "bun:test";
import { formatDurasiPdf } from "./invoice-pdf";

// § 2026-10-06 — salinan format durasi di PDF harus SAMA dengan `apps/web/lib/duration.ts` (1 Tahun = 365 hari; data lama 360 tetap "1 Tahun").
describe("formatDurasiPdf", () => {
  test("365/730 = Tahun; 360/720 (invoice lama) tetap Tahun; 30/90 = Bulan; sisanya Hari", () => {
    expect(formatDurasiPdf(365)).toBe("1 Tahun");
    expect(formatDurasiPdf(730)).toBe("2 Tahun");
    expect(formatDurasiPdf(360)).toBe("1 Tahun");
    expect(formatDurasiPdf(720)).toBe("2 Tahun");
    expect(formatDurasiPdf(30)).toBe("1 Bulan");
    expect(formatDurasiPdf(90)).toBe("3 Bulan");
    expect(formatDurasiPdf(45)).toBe("45 Hari");
  });
});
