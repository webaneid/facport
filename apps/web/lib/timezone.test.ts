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
