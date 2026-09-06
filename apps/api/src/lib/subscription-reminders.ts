// § Fase 45 — logic murni (tanpa DB I/O) untuk `JOBS.NOTIFY_EXPIRING_SOON`
// (workers/index.ts), diekstrak supaya testable tanpa perlu jalankan job
// pg-boss sungguhan (pola sama `checkTrialRowBudget`, Fase 43).

// § Array WAJIB ASCENDING (1 dulu, baru 3, baru 7) — `findApplicableReminderThreshold`
// butuh urutan ini supaya nemu threshold TERKETAT yang applicable (mis.
// daysLeft=2 harus kena "H-3", BUKAN "H-7" cuma karena 2<=7 juga true).
export const SUBSCRIPTION_REMINDER_THRESHOLDS = [1, 3, 7];
export const TRIAL_REMINDER_THRESHOLDS = [1, 3];

// § balikin threshold (hari) yang SEHARUSNYA memicu reminder sekarang,
// atau `null` kalau belum waktunya ATAU sudah pernah diingatkan di
// threshold ini (atau yang lebih ketat, `lastReminderThresholdDays`).
export function findApplicableReminderThreshold(daysLeft: number, thresholds: number[], lastReminderThresholdDays: number | null): number | null {
  if (daysLeft <= 0) return null; // sudah lewat, biar JOBS.EXPIRE_SUBSCRIPTIONS yang urus
  const applicable = thresholds.find((t) => daysLeft <= t);
  if (applicable === undefined) return null;
  if (lastReminderThresholdDays != null && lastReminderThresholdDays <= applicable) return null;
  return applicable;
}
