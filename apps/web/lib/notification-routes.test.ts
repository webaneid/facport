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

  test("Fase 178: invoice dibatalkan / kedaluwarsa → /billing (customer melihat statusnya & bisa memesan ulang)", () => {
    expect(notificationLink("order_cancelled", "app")).toBe("/billing");
    expect(notificationLink("order_expired", "app")).toBe("/billing");
  });

  test("Fase 181: tagihan perpanjangan terbit → /billing; gagal terbit (admin) → bare /users", () => {
    expect(notificationLink("renewal_invoice_issued", "app")).toBe("/billing");
    expect(notificationLink("admin_renewal_invoice_failed", "admin")).toBe("/users");
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
      "order_cancelled",
      "order_expired",
      "trial_started",
      "trial_ending_soon",
      "trial_expired",
      "subscription_ending_soon",
      "subscription_expired",
      "accurate_connection_expired",
      "admin_payment_proof_submitted",
      "renewal_invoice_issued",
      "admin_renewal_invoice_failed",
      "announcement",
      "unknown",
    ];
    for (const type of types) {
      const link = notificationLink(type, "admin");
      expect(link.startsWith("/admin")).toBe(false);
    }
  });
});
