// § Fase 59 — label bulan pendek ("Jan 26") dari key "YYYY-MM" yang
// dikembalikan `/admin/stats/monthly` (§ `lib/admin-stats.ts` backend).
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, 1));
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}
