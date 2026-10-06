import { describe, test, expect } from "bun:test";
import { computeSubscriptionPeriod, addCalendarMonths, addCalendarPeriod, intervalMonths, intervalCompatDays, inferIntervalFromDays, isSubscriptionInterval } from "./subscription-period";

const WIB = "Asia/Jakarta";
// Helper: tulis jam dinding WIB (UTC+7 tetap, tanpa DST) sebagai ISO UTC.
const wib = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi, s, ms));
const iso = (d: Date) => d.toISOString();

describe("addCalendarMonths — tanggal & jam dinding sama di bulan berikutnya (WIB)", () => {
  test("bulan biasa: tanggal dan jam identik", () => {
    expect(iso(addCalendarMonths(wib(2026, 10, 6, 14, 35, 12), 1, WIB))).toBe(iso(wib(2026, 11, 6, 14, 35, 12)));
    expect(iso(addCalendarMonths(wib(2026, 12, 15, 9, 0), 1, WIB))).toBe(iso(wib(2027, 1, 15, 9, 0)));
  });

  test("tanggal 31 dijepit ke hari terakhir bulan tujuan (bukan meluber ke bulan berikutnya)", () => {
    expect(iso(addCalendarMonths(wib(2026, 1, 31, 10), 1, WIB))).toBe(iso(wib(2026, 2, 28, 10)));
    expect(iso(addCalendarMonths(wib(2026, 3, 31, 10), 1, WIB))).toBe(iso(wib(2026, 4, 30, 10)));
    expect(iso(addCalendarMonths(wib(2026, 5, 31, 10), 1, WIB))).toBe(iso(wib(2026, 6, 30, 10)));
    expect(iso(addCalendarMonths(wib(2026, 8, 31, 10), 1, WIB))).toBe(iso(wib(2026, 9, 30, 10)));
    expect(iso(addCalendarMonths(wib(2026, 10, 31, 10), 1, WIB))).toBe(iso(wib(2026, 11, 30, 10)));
    expect(iso(addCalendarMonths(wib(2026, 1, 30, 10), 1, WIB))).toBe(iso(wib(2026, 2, 28, 10)));
  });

  test("Februari kabisat vs bukan: 29 Feb 2028 ada, 29 Feb 2027 tidak", () => {
    expect(iso(addCalendarMonths(wib(2028, 1, 31, 10), 1, WIB))).toBe(iso(wib(2028, 2, 29, 10)));
    expect(iso(addCalendarMonths(wib(2027, 1, 31, 10), 1, WIB))).toBe(iso(wib(2027, 2, 28, 10)));
    expect(iso(addCalendarMonths(wib(2028, 1, 29, 10), 1, WIB))).toBe(iso(wib(2028, 2, 29, 10)));
  });

  test("tahunan: 29 Feb kabisat + 1 tahun = 28 Feb; + 4 tahun = 29 Feb lagi", () => {
    expect(iso(addCalendarPeriod(wib(2024, 2, 29, 8), "yearly", 1, WIB))).toBe(iso(wib(2025, 2, 28, 8)));
    expect(iso(addCalendarPeriod(wib(2024, 2, 29, 8), "yearly", 4, WIB))).toBe(iso(wib(2028, 2, 29, 8)));
    expect(iso(addCalendarPeriod(wib(2026, 10, 6, 14, 35), "yearly", 1, WIB))).toBe(iso(wib(2027, 10, 6, 14, 35)));
  });

  test("lintas tahun, akhir tahun, dan batas hari 23:59:59.999", () => {
    expect(iso(addCalendarMonths(wib(2026, 12, 31, 23, 59, 59, 999), 1, WIB))).toBe(iso(wib(2027, 1, 31, 23, 59, 59, 999)));
    expect(iso(addCalendarPeriod(wib(2026, 12, 31, 23, 59, 59, 999), "yearly", 1, WIB))).toBe(iso(wib(2027, 12, 31, 23, 59, 59, 999)));
    expect(iso(addCalendarMonths(wib(2026, 11, 30, 0, 0, 0, 0), 3, WIB))).toBe(iso(wib(2027, 2, 28, 0, 0, 0, 0)));
  });

  test("hitungan memakai jam dinding WIB, BUKAN UTC: 1 Mar 03:00 WIB (= 28 Feb 20:00 UTC) + 1 bulan = 1 Apr 03:00 WIB", () => {
    const start = wib(2026, 3, 1, 3, 0);
    expect(start.toISOString()).toBe("2026-02-28T20:00:00.000Z");
    expect(iso(addCalendarMonths(start, 1, WIB))).toBe(iso(wib(2026, 4, 1, 3, 0)));
    // jam 00:30 WIB tanggal 31 Jan (= 30 Jan 17:30 UTC) → 28 Feb 00:30 WIB
    expect(iso(addCalendarMonths(wib(2026, 1, 31, 0, 30), 1, WIB))).toBe(iso(wib(2026, 2, 28, 0, 30)));
  });

  test("zona lain (Asia/Makassar UTC+8): semantik jam dinding yang sama", () => {
    const makassar = (y: number, mo: number, d: number, h: number) => new Date(Date.UTC(y, mo - 1, d, h - 8));
    expect(iso(addCalendarMonths(makassar(2026, 1, 31, 10), 1, "Asia/Makassar"))).toBe(iso(makassar(2026, 2, 28, 10)));
    expect(iso(addCalendarMonths(makassar(2026, 10, 6, 7), 1, "Asia/Makassar"))).toBe(iso(makassar(2026, 11, 6, 7)));
  });

  test("milidetik titik awal dipertahankan", () => {
    expect(addCalendarMonths(wib(2026, 10, 6, 14, 35, 12, 345), 1, WIB).getTime() % 1000).toBe(345);
  });

  test("jangkar anti-geser: 12× perpanjang bulanan dari 31 Jan berakhir 31 Jan tahun depan, tiap langkah dihitung dari jangkar", () => {
    const anchor = wib(2026, 1, 31, 10);
    const expected = ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"];
    expected.forEach((dateOnly, i) => {
      const [y, m, d] = dateOnly.split("-").map(Number) as [number, number, number];
      expect(iso(addCalendarMonths(anchor, i + 1, WIB))).toBe(iso(wib(y, m, d, 10)));
    });
    // berantai TANPA jangkar menggeser tanggal (bukti kenapa jangkar dipakai): 31 Jan → 28 Feb → 28 Mar
    const chained = addCalendarMonths(addCalendarMonths(anchor, 1, WIB), 1, WIB);
    expect(iso(chained)).toBe(iso(wib(2026, 3, 28, 10)));
  });

  test("0 bulan = titik yang sama; jumlah tidak valid / tanggal tidak valid ditolak", () => {
    const start = wib(2026, 10, 6, 14, 35);
    expect(iso(addCalendarMonths(start, 0, WIB))).toBe(iso(start));
    expect(() => addCalendarMonths(start, -1, WIB)).toThrow(RangeError);
    expect(() => addCalendarMonths(start, 1.5, WIB)).toThrow(RangeError);
    expect(() => addCalendarMonths(new Date("x"), 1, WIB)).toThrow(RangeError);
  });
});

describe("periode: konstanta & turunan", () => {
  test("intervalMonths / intervalCompatDays / isSubscriptionInterval", () => {
    expect(intervalMonths("monthly")).toBe(1);
    expect(intervalMonths("yearly")).toBe(12);
    expect(intervalCompatDays("monthly")).toBe(30);
    expect(intervalCompatDays("yearly")).toBe(365);
    expect(isSubscriptionInterval("monthly")).toBe(true);
    expect(isSubscriptionInterval("weekly")).toBe(false);
  });

  test("inferIntervalFromDays: data lama 30→bulanan, 360/365→tahunan", () => {
    expect(inferIntervalFromDays(30)).toBe("monthly");
    expect(inferIntervalFromDays(1)).toBe("monthly");
    expect(inferIntervalFromDays(360)).toBe("yearly");
    expect(inferIntervalFromDays(365)).toBe("yearly");
    expect(inferIntervalFromDays(720)).toBe("yearly");
  });
});

describe("computeSubscriptionPeriod — periode langganan baru", () => {
  test("bulanan: akhir = tanggal & jam sama bulan depan; jangkar = waktu mulai, 1 bulan", () => {
    const start = wib(2026, 10, 6, 14, 35, 12, 500);
    const p = computeSubscriptionPeriod(start, "monthly", WIB);
    expect(iso(p.endAt)).toBe(iso(wib(2026, 11, 6, 14, 35, 12, 500)));
    expect(iso(p.startAt)).toBe(iso(start));
    expect(iso(p.periodAnchorAt)).toBe(iso(start));
    expect(p.periodMonths).toBe(1);
  });
  test("tahunan: jangkar 12 bulan; disetujui 31 Jan 10:00 bulanan → 28 Feb 10:00 (dijepit)", () => {
    const y = computeSubscriptionPeriod(wib(2026, 10, 6, 14, 35), "yearly", WIB);
    expect(iso(y.endAt)).toBe(iso(wib(2027, 10, 6, 14, 35)));
    expect(y.periodMonths).toBe(12);
    expect(iso(computeSubscriptionPeriod(wib(2026, 1, 31, 10), "monthly", WIB).endAt)).toBe(iso(wib(2026, 2, 28, 10)));
  });
});
