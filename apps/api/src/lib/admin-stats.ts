// § Fase 59 — logic MURNI (tanpa DB) di balik dashboard admin, diekstrak
// dari `routes/admin/stats.route.ts` supaya bisa di-unit-test dengan data
// sintetis (bukan lewat DB dev yang shared antar test, § feedback user
// soal cleanup test — angka agregat GLOBAL seperti userCount/efficiency
// tidak bisa diasersi nilai eksak-nya kalau bergantung isi tabel asli).
// Route handler cuma fetch data mentah dari DB lalu panggil fungsi di
// sini — SATU sumber kebenaran formula, dites terpisah dari query.

export type MonthBucket = { key: string; start: Date; end: Date };

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// § 12 bulan rolling (bulan ini + 11 bulan sebelumnya), UTC calendar month
// — dikonfirmasi user (BUKAN tahun kalender Jan-Des), § phase-59 doc.
export function last12Months(now: Date): MonthBucket[] {
  const months: MonthBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    months.push({ key: monthKey(start), start, end });
  }
  return months;
}

export type MonthlyGrowthEntry = { month: string; newUserCount: number; cumulativeUserCount: number; newSubscribingUserCount: number };

// § agregasi bulanan di JS (bukan raw SQL/GROUP BY) — dijelaskan di
// architecture-admin-dashboard.md, volume data kecil (produk B2B).
export function aggregateMonthlyGrowth(
  months: MonthBucket[],
  baselineUserCount: number,
  userCreatedAts: Date[],
  subscriptionRows: { createdAt: Date; userId: string }[],
): MonthlyGrowthEntry[] {
  const newUserCountByMonth = new Map<string, number>();
  for (const createdAt of userCreatedAts) {
    const key = monthKey(createdAt);
    newUserCountByMonth.set(key, (newUserCountByMonth.get(key) ?? 0) + 1);
  }
  const subscribingUsersByMonth = new Map<string, Set<string>>();
  for (const row of subscriptionRows) {
    const key = monthKey(row.createdAt);
    const set = subscribingUsersByMonth.get(key) ?? new Set<string>();
    set.add(row.userId);
    subscribingUsersByMonth.set(key, set);
  }

  let cumulative = baselineUserCount;
  return months.map(({ key }) => {
    const newUserCount = newUserCountByMonth.get(key) ?? 0;
    cumulative += newUserCount;
    return {
      month: key,
      newUserCount,
      cumulativeUserCount: cumulative,
      newSubscribingUserCount: subscribingUsersByMonth.get(key)?.size ?? 0,
    };
  });
}

export type ModulePopularityEntry = { moduleKey: string; count: number };

// § snapshot SEKARANG (bukan time series) — subscription `active` di-group
// by `modules[0]`, diurutkan DESC (modul paling laku di atas).
export function aggregateModulePopularity(rows: { modules: string[] }[]): ModulePopularityEntry[] {
  const countByModule = new Map<string, number>();
  for (const row of rows) {
    const key = row.modules[0];
    if (!key) continue;
    countByModule.set(key, (countByModule.get(key) ?? 0) + 1);
  }
  return [...countByModule.entries()].map(([moduleKey, count]) => ({ moduleKey, count })).sort((a, b) => b.count - a.count);
}

// § pertumbuhan baris bulan-ke-bulan (poin 7.1, dikonfirmasi user: growth
// month-over-month, BUKAN porsi dari total all-time).
export function computeGrowthPercent(current: number, previous: number): number {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

export type EfficiencyResult = { actualSecondsTotal: number; manualSecondsTotal: number; efficiencyPercent: number };

// § poin 7.2 (dikonfirmasi user): (waktu manual − waktu aktual) ÷ waktu
// manual × 100, clamp 0-100. "Waktu aktual" = durasi WALL-CLOCK batch
// (completedAt − createdAt, TERMASUK antrian job) — bukan pengukuran
// per-baris murni (`import_batch_rows` tidak simpan timestamp mulai per
// baris). Batch gagal-dini (Fase 56) HARUS SUDAH dikecualikan oleh
// caller (durasinya ~0 detik, akan mendistorsi angka jadi keliatan
// sempurna padahal tidak ada baris yang diproses).
export function computeEfficiency(batches: { createdAt: Date; completedAt: Date; totalRows: number }[], manualInputSecondsPerRow: number): EfficiencyResult {
  let actualSecondsTotal = 0;
  let manualSecondsTotal = 0;
  for (const batch of batches) {
    actualSecondsTotal += (batch.completedAt.getTime() - batch.createdAt.getTime()) / 1000;
    manualSecondsTotal += batch.totalRows * manualInputSecondsPerRow;
  }
  const raw = manualSecondsTotal > 0 ? ((manualSecondsTotal - actualSecondsTotal) / manualSecondsTotal) * 100 : 0;
  return { actualSecondsTotal, manualSecondsTotal, efficiencyPercent: Math.max(0, Math.min(100, raw)) };
}
