// § Fase 173, ADR-0041 — SATU-SATUNYA tempat aritmetika periode langganan. Murni (tanpa DB, hanya `Intl`) supaya
// dipakai sama persis oleh server DAN web (re-export `apps/web/lib/subscription-period.ts`, pola `module-options.ts`):
// pratinjau tanggal akhir di UI harus identik dengan yang dihitung server.
//
// Aturan (ADR-0041): akhir = tanggal & JAM DINDING yang sama di bulan/tahun berikutnya DALAM ZONA yang diberikan (zona perusahaan,
// bukan UTC — jam 00:00–07:00 WIB beda tanggal di UTC). Tanggal yang tidak ada di bulan tujuan dijepit ke hari terakhir bulan itu
// (31 Jan + 1 bulan = 28/29 Feb; 29 Feb + 1 tahun = 28 Feb). Detik & milidetik titik awal dipertahankan.
// Zona tanpa DST (Indonesia); zona ber-DST tidak didukung penuh (jam dinding yang "hilang" saat maju jam tidak ditangani).

export type SubscriptionInterval = "monthly" | "yearly";
export const SUBSCRIPTION_INTERVALS: readonly SubscriptionInterval[] = ["monthly", "yearly"];

export function isSubscriptionInterval(value: unknown): value is SubscriptionInterval {
  return value === "monthly" || value === "yearly";
}

export function intervalMonths(interval: SubscriptionInterval): number {
  return interval === "yearly" ? 12 : 1;
}

// § Turunan `duration_days` (kompatibilitas/tampilan lama) dari periode — BUKAN dipakai menghitung akhir langganan.
export function intervalCompatDays(interval: SubscriptionInterval): number {
  return interval === "yearly" ? 365 : 30;
}

// § Data lama (`plans.duration_days` saja, belum punya periode): ≥ 360 hari = tahunan (360 = tahun lama 12×30), selain itu bulanan.
export function inferIntervalFromDays(days: number): SubscriptionInterval {
  return days >= 360 ? "yearly" : "monthly";
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClockParts(date: Date, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Jam dinding di `timeZone` → instant UTC. Algoritma sama dengan `zonedTimeToUtc` (apps/api/src/lib/company-timezone.ts) — salinan
// SENGAJA di sini karena file itu mengimpor DB (tidak bisa dipakai web) sedangkan file ini harus murni.
function zonedWallClockToUtc(p: Parts, ms: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0));
  const shown = wallClockParts(guess, timeZone);
  const offset = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second) - guess.getTime();
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, ms) - offset);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `start` + N bulan kalender di `timeZone`, jam dinding tetap, tanggal dijepit ke akhir bulan tujuan. */
export function addCalendarMonths(start: Date, months: number, timeZone: string): Date {
  if (!Number.isInteger(months) || months < 0) throw new RangeError(`Jumlah bulan harus bilangan bulat ≥ 0 (diterima ${months}).`);
  if (Number.isNaN(start.getTime())) throw new RangeError("Waktu mulai tidak valid.");
  const p = wallClockParts(start, timeZone);
  const index = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(p.day, daysInMonth(year, month));
  const ms = ((start.getTime() % 1000) + 1000) % 1000;
  return zonedWallClockToUtc({ year, month, day, hour: p.hour, minute: p.minute, second: p.second }, ms, timeZone);
}

/** `start` + `count` periode (bulanan = 1 bulan, tahunan = 12 bulan) — pintu masuk utama semua jalur aktivasi. */
export function addCalendarPeriod(start: Date, interval: SubscriptionInterval, count: number, timeZone: string): Date {
  return addCalendarMonths(start, intervalMonths(interval) * count, timeZone);
}

/**
 * Periode LANGGANAN BARU yang mulai di `start` (saat pembayaran disetujui / admin assign): akhir = tanggal & jam dinding yang sama bulan/tahun
 * berikutnya; `periodAnchorAt`/`periodMonths` dicatat sebagai jangkar anti-geser tanggal untuk perpanjangan berikutnya (Fase 176).
 */
export function computeSubscriptionPeriod(
  start: Date,
  interval: SubscriptionInterval,
  timeZone: string,
): { startAt: Date; endAt: Date; periodAnchorAt: Date; periodMonths: number } {
  const periodMonths = intervalMonths(interval);
  return { startAt: start, endAt: addCalendarMonths(start, periodMonths, timeZone), periodAnchorAt: start, periodMonths };
}
