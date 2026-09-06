import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "../db/schema";
import { todayAccurateDate } from "./accurate-vendor";
import { COMPANY_TIMEZONE_SETTING_KEY } from "./company-timezone";

// § BUG ditemukan 2026-09-06 (audit timezone menyeluruh, diminta user) —
// versi lama `todayAccurateDate()` pakai `now.getDate()`/dst (local server
// time), BUKAN timezone perusahaan. Test ini buktikan 2 hal SEKALIGUS:
// 1. Fungsi ini BENAR-BENAR baca `company.timezone` dari settings (bukan
//    hardcode "Asia/Jakarta") — dibuktikan pakai 2 timezone BEDA pada
//    instant UTC yang SAMA, hasilnya HARUS beda tanggal kalender.
// 2. Kasus SPESIFIK yang jadi akar bug: instant yang tanggal UTC-nya
//    SUDAH beda dari tanggal Asia/Jakarta (jendela 17:00-23:59 UTC =
//    00:00-06:59 WIB keesokan harinya) — hasil WAJIB ikut kalender
//    Asia/Jakarta, BUKAN kalender UTC.
describe("todayAccurateDate", () => {
  test("instant 2026-09-05T20:00:00Z (=06/09 03:00 WIB) — Asia/Jakarta HARUS balikin 06/09/2026, BUKAN 05/09 (tanggal UTC)", async () => {
    await db
      .insert(settings)
      .values({ key: COMPANY_TIMEZONE_SETTING_KEY, value: "Asia/Jakarta", group: "general" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "Asia/Jakarta" } });

    const result = await todayAccurateDate(new Date("2026-09-05T20:00:00.000Z"));
    expect(result).toBe("06/09/2026");
  });

  test("timezone BEDA pada instant SAMA balikin tanggal kalender BEDA (bukti fungsi genuinely baca setting, bukan hardcode)", async () => {
    const instant = new Date("2026-09-06T02:00:00.000Z"); // 06/09 09:00 WIB, TAPI 05/09 22:00 EDT (America/New_York, UTC-4)

    await db
      .insert(settings)
      .values({ key: COMPANY_TIMEZONE_SETTING_KEY, value: "Asia/Jakarta", group: "general" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "Asia/Jakarta" } });
    const jakartaResult = await todayAccurateDate(instant);
    expect(jakartaResult).toBe("06/09/2026");

    await db
      .insert(settings)
      .values({ key: COMPANY_TIMEZONE_SETTING_KEY, value: "America/New_York", group: "general" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "America/New_York" } });
    const nyResult = await todayAccurateDate(instant);
    expect(nyResult).toBe("05/09/2026");

    // § kembalikan ke default Asia/Jakarta supaya tidak bocor ke test lain
    // yang jalan setelah ini di proses `bun test` yang sama (settings
    // adalah row GLOBAL, § lessons-learned.md pola cleanup existing).
    await db
      .insert(settings)
      .values({ key: COMPANY_TIMEZONE_SETTING_KEY, value: "Asia/Jakarta", group: "general" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "Asia/Jakarta" } });
  });

  test("kalau setting company.timezone belum ada sama sekali di DB, fallback ke Asia/Jakarta (default)", async () => {
    await db.delete(settings).where(eq(settings.key, COMPANY_TIMEZONE_SETTING_KEY));

    const result = await todayAccurateDate(new Date("2026-09-05T20:00:00.000Z"));
    expect(result).toBe("06/09/2026"); // sama seperti Asia/Jakarta eksplisit
  });
});
