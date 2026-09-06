import type { Surface } from "@/components/app-shell/sidebar";

// § Fase 45 — SATU sumber kebenaran "tipe notifikasi → halaman tujuan
// saat diklik", pola sama `module-import-routes.ts`. Beberapa tipe
// (mis. `payment_verified`) tujuannya beda antara surface app (customer)
// vs admin — makanya lookup ini fungsi, bukan Record statis, terima
// `surface` supaya link admin vs customer bisa beda tanpa 2 tabel
// terpisah. WAJIB tambah entri baru di sini kalau ada tipe notifikasi
// baru (§ apps/api/src/lib/notifications.ts `NOTIFICATION_TYPES`,
// SATU sumber kebenaran yang SAMA di sisi backend).
export function notificationLink(type: string, surface: Surface): string {
  switch (type) {
    case "order_created":
    case "payment_proof_submitted":
    case "payment_rejected":
      // § halaman detail order butuh orderId (§ entityId) — arsip
      // notifikasi TIDAK selalu tahu orderId spesifik di sini (link
      // generik ke daftar tagihan), link presisi per-order dibangun di
      // pemanggil (notification-list.tsx) kalau `entityId` tersedia.
      return "/billing";
    case "payment_verified":
      return "/billing";
    case "trial_started":
    case "trial_ending_soon":
    case "trial_expired":
    case "subscription_ending_soon":
    case "subscription_expired":
      return "/subscribe";
    case "accurate_connection_expired":
      return "/accurate";
    case "admin_payment_proof_submitted":
      return "/admin/orders";
    case "announcement":
      return surface === "admin" ? "/admin/announcements" : "/";
    default:
      return surface === "admin" ? "/admin" : "/";
  }
}
