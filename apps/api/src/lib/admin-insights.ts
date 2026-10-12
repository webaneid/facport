import { zonedTimeToUtc } from "./company-timezone";
import { computeGrowthPercent } from "./admin-stats";

// § Fase 189C — rumus MURNI (tanpa DB) untuk API Insight (`routes/admin/insights.route.ts`). Pola sama `lib/admin-stats.ts`: route hanya mengambil data mentah lalu memanggil
// fungsi di sini, supaya angka bisa diuji dengan data sintetis (DB dev dipakai bersama, tidak bisa diuji dengan nilai eksak). Definisi baku: docs/phases/phase-189c-api-insight.md.
// SEMUA bulan dihitung menurut ZONA WAKTU PERUSAHAAN (tanggal mulai/berakhir ditampilkan ke manusia), BUKAN UTC seperti chart 12-bulan Fase 59.

export type MonthRef = { year: number; month: number }; // month 1..12

export const monthKey = (ref: MonthRef): string => `${ref.year}-${String(ref.month).padStart(2, "0")}`;

export function parseMonthKey(value: string): MonthRef | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  // tahun di luar 2000–2100 ditolak: Date.UTC memetakan tahun 0–99 ke 1900-an sehingga bulan "0050-01" diam-diam salah (temuan audit 189C, Info)
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100 ? { year, month } : null;
}

/** Urutan bulan sebagai bilangan bulat (untuk selisih/pembanding). */
const monthIndex = (ref: MonthRef): number => ref.year * 12 + (ref.month - 1);
const fromIndex = (index: number): MonthRef => ({ year: Math.floor(index / 12), month: (index % 12) + 1 });
export const addMonths = (ref: MonthRef, delta: number): MonthRef => fromIndex(monthIndex(ref) + delta);

/** Bulan kalender dari sebuah instan menurut zona waktu perusahaan. */
export function monthOf(date: Date, timeZone: string): MonthRef {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  return { year: Number(parts.find((p) => p.type === "year")!.value), month: Number(parts.find((p) => p.type === "month")!.value) };
}

/** [start, end) bulan itu dalam zona perusahaan: start inklusif, end EKSKLUSIF (= awal bulan berikutnya). */
export function monthBounds(ref: MonthRef, timeZone: string): { start: Date; end: Date } {
  const next = addMonths(ref, 1);
  return { start: zonedTimeToUtc(ref.year, ref.month, 1, 0, 0, 0, 0, timeZone), end: zonedTimeToUtc(next.year, next.month, 1, 0, 0, 0, 0, timeZone) };
}

/** Langganan yang DIHITUNG (modul, bukan trial/seat; sudah dimulai) milik pemilik Data Usaha SAAT INI. `endAt` kosong = berjalan terus (data lama). */
export type CountedSubscription = { ownerId: string; startAt: Date; endAt: Date | null };

/** Aktif di bulan: masa berlaku MENYENTUH bulan itu. Berakhir tepat di awal bulan = tidak; mulai tepat di akhir bulan = tidak. Tanpa jeda toleransi. */
export function isActiveInMonth(sub: CountedSubscription, bounds: { start: Date; end: Date }): boolean {
  return sub.startAt.getTime() < bounds.end.getTime() && (sub.endAt === null || sub.endAt.getTime() > bounds.start.getTime());
}

export function activeOwnersInMonth(subs: CountedSubscription[], bounds: { start: Date; end: Date }): Set<string> {
  const owners = new Set<string>();
  for (const sub of subs) if (isActiveInMonth(sub, bounds)) owners.add(sub.ownerId);
  return owners;
}

/** Awal langganan TERAWAL per pemilik (D13: dari langganan yang dihitung, bukan tanggal daftar/trial). */
export function firstStartByOwner(subs: CountedSubscription[]): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const sub of subs) {
    const current = first.get(sub.ownerId);
    if (!current || sub.startAt.getTime() < current.getTime()) first.set(sub.ownerId, sub.startAt);
  }
  return first;
}

export type TrendPoint = { month: string; value: number | null; previous: number | null; delta: number | null; percent: number | null; future: boolean };

/**
 * 12 titik untuk `year`. `valueOf(bulan)` dipanggil juga untuk Desember tahun sebelumnya (pembanding Januari). Bulan SETELAH `now` ditandai future dengan nilai null
 * (tidak digambar sebagai 0). Persen mengikuti `computeGrowthPercent` (bulan sebelumnya 0 → 100 bila naik, 0 bila tetap 0; tanpa Infinity/NaN).
 */
export function buildTrend(year: number, valueOf: (ref: MonthRef) => number, now: MonthRef): TrendPoint[] {
  const nowIndex = monthIndex(now);
  return Array.from({ length: 12 }, (_, i) => {
    const ref = { year, month: i + 1 };
    if (monthIndex(ref) > nowIndex) return { month: monthKey(ref), value: null, previous: null, delta: null, percent: null, future: true };
    const value = valueOf(ref);
    const previous = valueOf(addMonths(ref, -1));
    return { month: monthKey(ref), value, previous, delta: value - previous, percent: computeGrowthPercent(value, previous), future: false };
  });
}

export type TenureBreakdown = {
  /** pelanggan aktif di bulan itu */
  aktif: number;
  /** awal pertama jatuh di bulan itu */
  baru: number;
  /** sudah ≥1 bulan tetapi masih di tahun pertama (bulan ke-2 s.d. ke-12) */
  lanjutanTahun1: number;
  /** tahun ke-2, ke-3, … (kunci = nomor tahun) */
  byYear: Record<number, number>;
  /** aktif di bulan sebelumnya, tidak aktif di bulan ini */
  berhenti: number;
  /** aktif lagi setelah jeda (irisan dengan kolom usia, BUKAN kolom tambahan) */
  kembali: number;
};

/** Rincian menurut usia langganan. Kolom `baru + lanjutanTahun1 + byYear[*]` memartisi `aktif` tepat satu kali. */
export function tenureBreakdown(subs: CountedSubscription[], month: MonthRef, timeZone: string): TenureBreakdown {
  const active = activeOwnersInMonth(subs, monthBounds(month, timeZone));
  const previousActive = activeOwnersInMonth(subs, monthBounds(addMonths(month, -1), timeZone));
  const first = firstStartByOwner(subs);

  const result: TenureBreakdown = { aktif: active.size, baru: 0, lanjutanTahun1: 0, byYear: {}, berhenti: 0, kembali: 0 };
  for (const owner of active) {
    const monthsSinceFirst = monthIndex(month) - monthIndex(monthOf(first.get(owner)!, timeZone));
    const tenureYear = Math.floor(monthsSinceFirst / 12) + 1;
    if (monthsSinceFirst === 0) result.baru += 1;
    else if (tenureYear === 1) result.lanjutanTahun1 += 1;
    else result.byYear[tenureYear] = (result.byYear[tenureYear] ?? 0) + 1;
    if (!previousActive.has(owner) && monthsSinceFirst > 0) result.kembali += 1;
  }
  for (const owner of previousActive) if (!active.has(owner)) result.berhenti += 1;
  return result;
}

/**
 * Satu sel CSV. Teks pengguna berawalan `= + - @ TAB CR` DINETRALKAN dengan apostrof (cegah injeksi rumus saat dibuka di Excel/Sheets); bertipe `number` apa adanya (angka
 * negatif asli bukan teks pengguna). Dikutip bila mengandung koma, kutip, atau baris baru.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV UTF-8 dengan BOM (Excel membaca aksara non-Latin), CRLF. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Rentang tanggal maksimum laporan (≈ 24 bulan). */
export const MAX_RANGE_DAYS = 731;

type RangeResult = { ok: true; start: Date; endExclusive: Date } | { ok: false; code: "INVALID_DATE" | "RANGE_ORDER" | "RANGE_TOO_LONG" };

function parseLocalDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  // tanggal mustahil (30 Feb, bulan 13) ditolak — Date.UTC menggulirkannya, jadi bandingkan balik
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day ? { year, month, day } : null;
}

/**
 * `from`/`to` = tanggal kalender (YYYY-MM-DD) menurut ZONA PERUSAHAAN, `to` INKLUSIF. Hasil [start, endExclusive): awal hari `from` sampai awal hari SETELAH `to`.
 * Dibatasi `MAX_RANGE_DAYS` (cegah laporan raksasa).
 */
export function resolveDateRange(from: string, to: string, timeZone: string): RangeResult {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (!a || !b) return { ok: false, code: "INVALID_DATE" };
  const start = zonedTimeToUtc(a.year, a.month, a.day, 0, 0, 0, 0, timeZone);
  const endExclusive = zonedTimeToUtc(b.year, b.month, b.day + 1, 0, 0, 0, 0, timeZone);
  if (endExclusive.getTime() <= start.getTime()) return { ok: false, code: "RANGE_ORDER" };
  const days = Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, code: "RANGE_TOO_LONG" };
  return { ok: true, start, endExclusive };
}
