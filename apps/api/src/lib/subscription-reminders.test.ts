import { describe, test, expect } from "bun:test";
import { findApplicableReminderThreshold, SUBSCRIPTION_REMINDER_THRESHOLDS, TRIAL_REMINDER_THRESHOLDS } from "./subscription-reminders";

describe("findApplicableReminderThreshold", () => {
  test("null kalau sudah lewat (daysLeft <= 0) — biar JOBS.EXPIRE_SUBSCRIPTIONS yang urus", () => {
    expect(findApplicableReminderThreshold(0, SUBSCRIPTION_REMINDER_THRESHOLDS, null)).toBeNull();
    expect(findApplicableReminderThreshold(-1, SUBSCRIPTION_REMINDER_THRESHOLDS, null)).toBeNull();
  });

  test("null kalau belum masuk threshold manapun (mis. daysLeft=10, threshold terbesar cuma 7)", () => {
    expect(findApplicableReminderThreshold(10, SUBSCRIPTION_REMINDER_THRESHOLDS, null)).toBeNull();
  });

  test("balikin threshold TERKETAT yang applicable, BUKAN yang pertama match secara array-order", () => {
    // § bug yang ketemu sendiri saat nulis worker — daysLeft=2 HARUS
    // kena checkpoint "H-3" (2<=3), BUKAN "H-7" (2<=7 juga true tapi
    // kurang ketat).
    expect(findApplicableReminderThreshold(2, SUBSCRIPTION_REMINDER_THRESHOLDS, null)).toBe(3);
    expect(findApplicableReminderThreshold(6, SUBSCRIPTION_REMINDER_THRESHOLDS, null)).toBe(7);
    expect(findApplicableReminderThreshold(0.5, SUBSCRIPTION_REMINDER_THRESHOLDS, null)).toBe(1);
  });

  test("null kalau sudah pernah diingatkan di threshold ini atau yang LEBIH KETAT", () => {
    expect(findApplicableReminderThreshold(2, SUBSCRIPTION_REMINDER_THRESHOLDS, 3)).toBeNull(); // sudah diingatkan H-3
    expect(findApplicableReminderThreshold(2, SUBSCRIPTION_REMINDER_THRESHOLDS, 1)).toBeNull(); // sudah diingatkan H-1 (lebih ketat dari H-3)
  });

  test("TETAP kirim kalau lastReminder LEBIH LONGGAR dari threshold sekarang (mis. sudah H-7, sekarang masuk H-3)", () => {
    expect(findApplicableReminderThreshold(2, SUBSCRIPTION_REMINDER_THRESHOLDS, 7)).toBe(3);
  });

  test("threshold trial (lebih pendek: cuma H-3/H-1, tidak ada H-7)", () => {
    expect(findApplicableReminderThreshold(2, TRIAL_REMINDER_THRESHOLDS, null)).toBe(3);
    expect(findApplicableReminderThreshold(0.5, TRIAL_REMINDER_THRESHOLDS, null)).toBe(1);
    expect(findApplicableReminderThreshold(5, TRIAL_REMINDER_THRESHOLDS, null)).toBeNull(); // di luar jangkauan trial (cuma sampai H-3)
  });
});
