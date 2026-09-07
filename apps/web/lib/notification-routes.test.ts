import { describe, test, expect } from "bun:test";
import { notificationLink } from "./notification-routes";

// § bug ditemukan 2026-09-08 (feedback user) — link admin sebelumnya
// double-prefix ("/admin/orders" dst) karena `proxy.ts` SENDIRI yang
// rewrite `/${surface}${pathname}` (lihat proxy.ts baris 50). Semua link
// yang dikembalikan fungsi ini WAJIB bare path (tanpa "/admin"), sama
// seperti konvensi sidebar admin (`app-shell/sidebar.tsx`).
describe("notificationLink", () => {
  test("admin_payment_proof_submitted → bare /orders, BUKAN /admin/orders", () => {
    expect(notificationLink("admin_payment_proof_submitted", "admin")).toBe("/orders");
  });

  test("announcement di surface admin → bare /announcements", () => {
    expect(notificationLink("announcement", "admin")).toBe("/announcements");
  });

  test("announcement di surface app → /notifications", () => {
    expect(notificationLink("announcement", "app")).toBe("/notifications");
  });

  test("tipe tidak dikenal di surface admin → bare /, BUKAN /admin", () => {
    expect(notificationLink("some_unknown_type", "admin")).toBe("/");
  });

  test("tipe tidak dikenal di surface app → /", () => {
    expect(notificationLink("some_unknown_type", "app")).toBe("/");
  });

  test("semua link yang dikembalikan untuk surface admin TIDAK PERNAH diawali /admin", () => {
    const types = [
      "order_created",
      "payment_proof_submitted",
      "payment_rejected",
      "payment_verified",
      "trial_started",
      "trial_ending_soon",
      "trial_expired",
      "subscription_ending_soon",
      "subscription_expired",
      "accurate_connection_expired",
      "admin_payment_proof_submitted",
      "announcement",
      "unknown",
    ];
    for (const type of types) {
      const link = notificationLink(type, "admin");
      expect(link.startsWith("/admin")).toBe(false);
    }
  });
});
