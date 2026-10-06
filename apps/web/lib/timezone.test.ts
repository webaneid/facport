import { describe, test, expect } from "bun:test";
import { endOfDayInTimezone } from "./timezone";

// § BUG ditemukan 2026-09-06 — lihat komentar lengkap di timezone.ts.
// Test ini buktikan akhir hari "31 Desember" di Asia/Jakarta (UTC+7)
// jadi instant UTC "31 Desember 16:59:59.999Z" (23:59:59.999 WIB - 7
// jam), BUKAN "31 Desember 23:59:59.999Z" (kalau salah dianggap UTC)
// ATAU "31 Desember 00:00:00.000Z" (bug lama, treat sebagai UTC midnight
// tanpa konversi timezone sama sekali).
describe("endOfDayInTimezone", () => {
  test("Asia/Jakarta (UTC+7) — akhir hari 2026-12-31 = 2026-12-31T16:59:59.999Z", () => {
    const result = endOfDayInTimezone("2026-12-31", "Asia/Jakarta");
    expect(result.toISOString()).toBe("2026-12-31T16:59:59.999Z");
  });

  test("timezone BEDA (America/New_York, UTC-5 di bulan Desember) balikin instant UTC BEDA untuk tanggal kalender yang SAMA — bukti genuinely timezone-aware", () => {
    const result = endOfDayInTimezone("2026-12-31", "America/New_York");
    expect(result.toISOString()).toBe("2027-01-01T04:59:59.999Z");
  });

  test("UTC — akhir hari sama dengan interpretasi UTC-midnight-plus-hampir-24-jam", () => {
    const result = endOfDayInTimezone("2026-12-31", "UTC");
    expect(result.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  test("hasil endOfDay SELALU setelah bug lama (new Date(dateStr) = UTC midnight) — subscription tidak lagi kepotong lebih awal dari yang diintensikan admin", () => {
    const oldBuggyBehavior = new Date("2026-12-31");
    const fixed = endOfDayInTimezone("2026-12-31", "Asia/Jakarta");
    expect(fixed.getTime()).toBeGreaterThan(oldBuggyBehavior.getTime());
  });
});

// § Fase 174
import { zonedDateTimeToUtc, dateTimeFieldsInTimezone, timezoneAbbreviation } from "./timezone";
describe("tanggal+jam akhir langganan (WIB)", () => {
  test("zonedDateTimeToUtc: 6 Nov 14:35 WIB = 07:35 UTC; round-trip lewat dateTimeFieldsInTimezone", () => {
    const d = zonedDateTimeToUtc("2026-11-06", "14:35", "Asia/Jakarta");
    expect(d.toISOString()).toBe("2026-11-06T07:35:00.000Z");
    expect(dateTimeFieldsInTimezone(d, "Asia/Jakarta")).toEqual({ date: "2026-11-06", time: "14:35" });
  });
  test("tengah malam WIB: 00:30 WIB tanggal 1 = tanggal sebelumnya di UTC, tetap tampil tanggal 1", () => {
    const d = zonedDateTimeToUtc("2026-03-01", "00:30", "Asia/Jakarta");
    expect(d.toISOString()).toBe("2026-02-28T17:30:00.000Z");
    expect(dateTimeFieldsInTimezone(d, "Asia/Jakarta")).toEqual({ date: "2026-03-01", time: "00:30" });
  });
  test("singkatan zona", () => {
    expect(timezoneAbbreviation("Asia/Jakarta")).toBe("WIB");
    expect(timezoneAbbreviation("Asia/Makassar")).toBe("WITA");
    expect(timezoneAbbreviation("Asia/Jayapura")).toBe("WIT");
    expect(timezoneAbbreviation("UTC")).toBe("UTC");
  });
});
