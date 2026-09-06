import { describe, test, expect } from "bun:test";
import { isWithinWorkHours, isAgentOnline, pickNextAgent, DEFAULT_WORK_DAYS } from "./customer-care";

const SCHEDULE = { workStartMinutes: 9 * 60, workEndMinutes: 17 * 60, workDays: DEFAULT_WORK_DAYS };
const TZ = "Asia/Jakarta";

describe("isWithinWorkHours", () => {
  test("true di tengah jam kerja (Senin siang WIB)", () => {
    // § 2026-09-07 adalah Senin. 10:00 WIB = 03:00 UTC.
    const now = new Date("2026-09-07T03:00:00.000Z");
    expect(isWithinWorkHours(now, TZ, SCHEDULE)).toBe(true);
  });

  test("false SEBELUM jam mulai (08:00 WIB, Senin)", () => {
    const now = new Date("2026-09-07T01:00:00.000Z"); // 08:00 WIB
    expect(isWithinWorkHours(now, TZ, SCHEDULE)).toBe(false);
  });

  test("false SETELAH jam selesai (18:00 WIB, Senin)", () => {
    const now = new Date("2026-09-07T11:00:00.000Z"); // 18:00 WIB
    expect(isWithinWorkHours(now, TZ, SCHEDULE)).toBe(false);
  });

  test("false di hari LIBUR (Minggu, tidak ada di workDays default)", () => {
    // § 2026-09-06 adalah Minggu. 10:00 WIB = 03:00 UTC.
    const now = new Date("2026-09-06T03:00:00.000Z");
    expect(isWithinWorkHours(now, TZ, SCHEDULE)).toBe(false);
  });

  test("timezone BEDA di instant SAMA balikin hasil BEDA — bukti genuinely timezone-aware", () => {
    // § Senin 2026-09-07T03:00:00Z = 10:00 WIB (dalam jam kerja) TAPI
    // cuma 23:00 Minggu di America/New_York (UTC-4 EDT bulan September) — LIBUR.
    const now = new Date("2026-09-07T03:00:00.000Z");
    expect(isWithinWorkHours(now, "Asia/Jakarta", SCHEDULE)).toBe(true);
    expect(isWithinWorkHours(now, "America/New_York", SCHEDULE)).toBe(false);
  });
});

describe("isAgentOnline", () => {
  const onlineTime = new Date("2026-09-07T03:00:00.000Z"); // Senin 10:00 WIB

  test("false kalau isActive=false, walau dalam jam kerja", () => {
    expect(isAgentOnline({ isActive: false, manuallyOfflineUntil: null }, onlineTime, TZ, SCHEDULE)).toBe(false);
  });

  test("false kalau manuallyOfflineUntil BELUM lewat", () => {
    const offlineUntil = new Date(onlineTime.getTime() + 60 * 60 * 1000); // 1 jam lagi
    expect(isAgentOnline({ isActive: true, manuallyOfflineUntil: offlineUntil }, onlineTime, TZ, SCHEDULE)).toBe(false);
  });

  test("true kalau manuallyOfflineUntil SUDAH lewat (auto-reset)", () => {
    const offlineUntilKemarin = new Date(onlineTime.getTime() - 60 * 60 * 1000); // 1 jam lalu
    expect(isAgentOnline({ isActive: true, manuallyOfflineUntil: offlineUntilKemarin }, onlineTime, TZ, SCHEDULE)).toBe(true);
  });

  test("true kalau isActive + tidak ada manual-off + dalam jam kerja", () => {
    expect(isAgentOnline({ isActive: true, manuallyOfflineUntil: null }, onlineTime, TZ, SCHEDULE)).toBe(true);
  });
});

describe("pickNextAgent", () => {
  test("null kalau tidak ada agent online", () => {
    expect(pickNextAgent([], new Map())).toBeNull();
  });

  test("pilih agent dengan klik PALING SEDIKIT hari ini", () => {
    const agents = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const counts = new Map([
      ["a", 5],
      ["b", 2],
      ["c", 8],
    ]);
    expect(pickNextAgent(agents, counts)!.id).toBe("b");
  });

  test("agent yang belum pernah diklik hari ini (tidak ada di Map) dianggap 0 — prioritas utama", () => {
    const agents = [{ id: "a" }, { id: "b" }];
    const counts = new Map([["a", 3]]); // "b" belum pernah, default 0
    expect(pickNextAgent(agents, counts)!.id).toBe("b");
  });

  test("tie-break stabil by id kalau count sama persis", () => {
    const agents = [{ id: "zzz" }, { id: "aaa" }];
    const counts = new Map([
      ["zzz", 1],
      ["aaa", 1],
    ]);
    expect(pickNextAgent(agents, counts)!.id).toBe("aaa");
  });
});
