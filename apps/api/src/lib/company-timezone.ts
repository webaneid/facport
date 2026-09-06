import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "../db/schema";

// § ditemukan 2026-09-06 — audit timezone menyeluruh (diminta user,
// "berlangganan tidak benar terhitung-nya hanya karena timezone"). Setting
// `company.timezone` (§ architecture-settings.md, Fase 00/01) sudah ada
// sejak awal TAPI belum pernah benar-benar dipakai di kode manapun untuk
// perhitungan berbasis "hari ini"/tanggal kalender — cuma tersimpan di DB
// tanpa efek nyata. Helper ini SATU sumber kebenaran buat baca nilainya,
// dipakai di titik-titik yang butuh tahu "hari ini menurut kalender
// perusahaan" (BUKAN kalender UTC server, BUKAN local time server) — lihat
// `todayAccurateDate()` di `accurate-vendor.ts` untuk contoh pemakaian.
export const COMPANY_TIMEZONE_SETTING_KEY = "company.timezone";
export const DEFAULT_COMPANY_TIMEZONE = "Asia/Jakarta";

export async function getCompanyTimezone(): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, COMPANY_TIMEZONE_SETTING_KEY));
  return typeof row?.value === "string" && row.value.length > 0 ? row.value : DEFAULT_COMPANY_TIMEZONE;
}

// § Fase 46 — algoritma umum konversi "jam dinding" (wall-clock) di
// timezone tertentu → instant UTC yang benar. SAMA persis dengan
// `apps/web/lib/timezone.ts` (Fase 44) — duplikasi SENGAJA (2 app
// terpisah deploy, tidak bisa share module langsung), native
// `Intl.DateTimeFormat`, TIDAK nambah dependency baru. SATU tempat di
// backend — jangan re-implementasikan offset calculation ini lagi di
// file lain, import dari sini.
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number, timeZone: string): Date {
  // § offset dihitung dari instant TANPA milidetik — `Intl.DateTimeFormat`
  // membulatkan pecahan detik ke atas, bikin hasil akhir meleset ~1
  // detik kalau dipakai langsung (ketemu Fase 44 lewat test round-trip).
  const guessWithoutMs = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  const offset = getTimeZoneOffsetMs(guessWithoutMs, timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - offset);
}

function todayPartsInTimezone(now: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// § "end of TODAY" (23:59:59.999) di timezone perusahaan, dihitung dari
// instant `now` — dipakai toggle "off hari ini" (§ lib/customer-care.ts
// `markAgentOfflineToday`). BEDA dari `endOfDayInTimezone` versi frontend
// (Fase 44, terima tanggal dari date-picker) — di sini tanggalnya
// ditentukan dari `now` ITU SENDIRI (hari ini menurut timezone
// perusahaan), bukan input user.
export function endOfTodayInTimezone(now: Date, timezone: string): Date {
  const { year, month, day } = todayPartsInTimezone(now, timezone);
  return zonedTimeToUtc(year, month, day, 23, 59, 59, 999, timezone);
}

// § awal hari INI (00:00:00.000) di timezone perusahaan — dipakai
// analitik Customer Care (§ admin/customer-care.route.ts `periodStartFor`)
// dan rotasi (hitung klik hari ini).
export function startOfTodayInTimezone(now: Date, timezone: string): Date {
  const { year, month, day } = todayPartsInTimezone(now, timezone);
  return zonedTimeToUtc(year, month, day, 0, 0, 0, 0, timezone);
}

// § menit-sejak-tengah-malam + hari-dalam-minggu (0=Minggu..6=Sabtu)
// SAAT INI di timezone perusahaan — dipakai cek jam kerja (§
// `isWithinWorkHours`). Trik: baca Y-M-D-H-M wall-clock di timezone
// target via Intl, lalu treat sebagai UTC (weekday cuma properti
// kalender, tidak tergantung instant absolut yang direpresentasikan).
export function getLocalTimeParts(now: Date, timezone: string): { minutesOfDay: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const fakeUtc = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")));
  return { minutesOfDay: get("hour") * 60 + get("minute"), weekday: fakeUtc.getUTCDay() };
}
