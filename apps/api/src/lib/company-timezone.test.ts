import { describe, test, expect } from "bun:test";
import { zonedTimeToUtc, endOfTodayInTimezone, startOfTodayInTimezone, getLocalTimeParts } from "./company-timezone";

describe("zonedTimeToUtc", () => {
  test("Asia/Jakarta (UTC+7) — 09:00 jadi 02:00Z hari yang sama", () => {
    const result = zonedTimeToUtc(2026, 9, 7, 9, 0, 0, 0, "Asia/Jakarta");
    expect(result.toISOString()).toBe("2026-09-07T02:00:00.000Z");
  });

  test("round-trip akhir hari (23:59:59.999) — tidak meleset karena rounding milidetik Intl", () => {
    const result = zonedTimeToUtc(2026, 12, 31, 23, 59, 59, 999, "Asia/Jakarta");
    expect(result.toISOString()).toBe("2026-12-31T16:59:59.999Z");
  });
});

describe("endOfTodayInTimezone / startOfTodayInTimezone", () => {
  test("konsisten dengan zonedTimeToUtc untuk tanggal yang sama (Asia/Jakarta)", () => {
    const now = new Date("2026-09-07T03:00:00.000Z"); // 10:00 WIB, 7 September
    expect(endOfTodayInTimezone(now, "Asia/Jakarta").toISOString()).toBe(zonedTimeToUtc(2026, 9, 7, 23, 59, 59, 999, "Asia/Jakarta").toISOString());
    expect(startOfTodayInTimezone(now, "Asia/Jakarta").toISOString()).toBe(zonedTimeToUtc(2026, 9, 7, 0, 0, 0, 0, "Asia/Jakarta").toISOString());
  });

  test("dekat tengah malam — tanggal 'hari ini' HARUS ikut timezone perusahaan, bukan UTC", () => {
    // § 2026-09-07T02:00:00Z = 09:00 WIB 7 September, TAPI 22:00 UTC hari
    // SEBELUMNYA (6 September) kalau salah dianggap UTC.
    const now = new Date("2026-09-07T02:00:00.000Z");
    const endOfDay = endOfTodayInTimezone(now, "Asia/Jakarta");
    expect(endOfDay.toISOString()).toBe("2026-09-07T16:59:59.999Z"); // akhir hari 7 September WIB, BUKAN 6 September
  });
});

describe("getLocalTimeParts", () => {
  test("weekday + minutesOfDay benar untuk Asia/Jakarta", () => {
    // § 2026-09-07 adalah Senin (weekday=1), 10:00 WIB = 600 menit.
    const now = new Date("2026-09-07T03:00:00.000Z");
    const { minutesOfDay, weekday } = getLocalTimeParts(now, "Asia/Jakarta");
    expect(minutesOfDay).toBe(10 * 60);
    expect(weekday).toBe(1);
  });

  test("timezone BEDA di instant SAMA balikin weekday/minutesOfDay BEDA", () => {
    const now = new Date("2026-09-07T03:00:00.000Z"); // 10:00 WIB Senin, TAPI 23:00 Minggu di EDT
    const jakarta = getLocalTimeParts(now, "Asia/Jakarta");
    const newYork = getLocalTimeParts(now, "America/New_York");
    expect(jakarta.weekday).toBe(1); // Senin
    expect(newYork.weekday).toBe(0); // Minggu
  });
});
