import { describe, test, expect } from "bun:test";
import { findApplicableReminderThreshold, buildExpiryReminder, SUBSCRIPTION_REMINDER_THRESHOLDS, TRIAL_REMINDER_THRESHOLDS } from "./subscription-reminders";

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

describe("buildExpiryReminder — tiga varian teks (Fase 181)", () => {
  const base = { featureLabel: "Sales Order", dataUsahaName: "PT Maju", daysLeft: 2.4, tanggalBerakhir: "10 Oktober 2026" };
  test("trial → ajakan upgrade; langganan biasa → ajakan perpanjang (teks lama TIDAK berubah)", () => {
    expect(buildExpiryReminder({ ...base, isTrial: true })).toEqual({
      title: "Trial akan berakhir",
      body: "Trial Sales Order di Data Usaha PT Maju akan berakhir 3 hari lagi (10 Oktober 2026) — upgrade sekarang supaya tidak terputus.",
    });
    expect(buildExpiryReminder({ ...base, isTrial: false })).toEqual({
      title: "Langganan akan berakhir",
      body: "Langganan Sales Order di Data Usaha PT Maju akan berakhir 3 hari lagi (10 Oktober 2026) — perpanjang sekarang supaya tidak terputus.",
    });
  });
  test("ber-perpanjangan-terjadwal dengan tagihan terbuka → menyebut nomor tagihan, nominal, dan link bayar", () => {
    const r = buildExpiryReminder({ ...base, isTrial: false, openRenewal: { invoiceNumber: "INV/2026/10/0042", amountDue: 1000123, payUrl: "https://app.test/billing/o-1/pay" } });
    expect(r.title).toBe("Tagihan perpanjangan belum dibayar");
    expect(r.body).toContain("INV/2026/10/0042");
    expect(r.body).toContain("https://app.test/billing/o-1/pay");
    expect(r.body).toMatch(/Rp1\.000\.123/);
    expect(r.body).toContain("3 hari lagi");
  });
  test("trial tidak pernah memakai varian tagihan walau ada openRenewal (trial tidak ditandai)", () => {
    expect(buildExpiryReminder({ ...base, isTrial: true, openRenewal: { invoiceNumber: "X", amountDue: 1, payUrl: "u" } }).title).toBe("Trial akan berakhir");
  });
});
