import { describe, test, expect } from "bun:test";
import { toDurationDays, inferDurationUnit, formatDuration, DURATION_UNIT_TO_DAYS } from "./duration";

// § 2026-10-06 — 1 Tahun = 365 hari (sebelumnya 360); data lama 360 tetap tampil "1 Tahun".
describe("durasi paket — 1 Tahun = 365 hari", () => {
  test("konversi: 1 tahun = 365 hari, 1 bulan = 30 hari, hari apa adanya", () => {
    expect(DURATION_UNIT_TO_DAYS.tahun).toBe(365);
    expect(toDurationDays(1, "tahun")).toBe(365);
    expect(toDurationDays(2, "tahun")).toBe(730);
    expect(toDurationDays(3, "bulan")).toBe(90);
    expect(toDurationDays(45, "hari")).toBe(45);
  });

  test("tampilan: 365/730 = Tahun; DATA LAMA 360/720 tetap 'Tahun' (bukan '12 Bulan'/'360 Hari'); 30/90 = Bulan; sisanya Hari", () => {
    expect(formatDuration(365)).toBe("1 Tahun");
    expect(formatDuration(730)).toBe("2 Tahun");
    expect(formatDuration(360)).toBe("1 Tahun");
    expect(formatDuration(720)).toBe("2 Tahun");
    expect(formatDuration(30)).toBe("1 Bulan");
    expect(formatDuration(90)).toBe("3 Bulan");
    expect(formatDuration(45)).toBe("45 Hari");
    expect(formatDuration(0)).toBe("0 Hari");
  });

  test("inferDurationUnit mengembalikan jumlah+unit untuk form edit; paket lama 360 terbuka sebagai 1 Tahun (jika disimpan → 365)", () => {
    expect(inferDurationUnit(365)).toEqual({ amount: 1, unit: "tahun" });
    expect(inferDurationUnit(360)).toEqual({ amount: 1, unit: "tahun" });
    expect(toDurationDays(inferDurationUnit(360).amount, inferDurationUnit(360).unit)).toBe(365);
    expect(inferDurationUnit(60)).toEqual({ amount: 2, unit: "bulan" });
    expect(inferDurationUnit(45)).toEqual({ amount: 45, unit: "hari" });
  });
});

// § Fase 173, ADR-0041
import { INTERVAL_LABELS, formatPeriod } from "./duration";
describe("periode paket (bulanan/tahunan)", () => {
  test("formatPeriod: periode eksplisit menang atas hitungan hari; tanpa periode jatuh ke tebakan hari", () => {
    expect(formatPeriod("monthly", 30)).toBe("1 Bulan");
    expect(formatPeriod("yearly", 365)).toBe("1 Tahun");
    expect(formatPeriod("yearly", 360)).toBe("1 Tahun");
    expect(formatPeriod(undefined, 365)).toBe("1 Tahun");
    expect(formatPeriod(undefined, 30)).toBe("1 Bulan");
  });
  test("label periode", () => {
    expect(INTERVAL_LABELS).toEqual({ monthly: "Bulanan", yearly: "Tahunan" });
  });
});
