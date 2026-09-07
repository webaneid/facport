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
      // § bug ditemukan 2026-09-08 (feedback user) — SEBELUMNYA "/admin/orders".
      // Href di sini HARUS bare path (tanpa prefix surface) — `proxy.ts`
      // SENDIRI yang rewrite `/${surface}${pathname}` (§ baris 50), jadi
      // "/admin/orders" di sini bikin double-prefix jadi "/admin/admin/orders"
      // (404, folder itu tidak ada) begitu diklik di admin.facinstitute.id.
      // Konvensi yang benar sama seperti sidebar admin (`app-shell/sidebar.tsx`
      // pakai `href: "/orders"` bare, BUKAN "/admin/orders").
      return "/orders";
    case "announcement":
      // § ditemukan 2026-09-07 di production — sebelumnya "/" (dashboard
      // kosong, tidak nunjukin apa-apa soal pengumuman). Isi lengkap
      // (`notif.body`) SUDAH tampil langsung di dropdown/arsip notifikasi
      // (`NotificationList`), TIDAK perlu halaman detail baru — cukup
      // arahkan ke arsip `/notifications` yang sudah ada, konsisten
      // dengan tempat user sebenarnya lihat isinya.
      // § bug 2026-09-08 — "/admin/announcements" (double-prefix, sama
      // kelas bug dengan "admin_payment_proof_submitted" di atas) diganti
      // bare "/announcements".
      return surface === "admin" ? "/announcements" : "/notifications";
    default:
      // § bug 2026-09-08 — "/admin" (double-prefix jadi "/admin/admin",
      // 404) diganti "/", sama kelas bug di atas.
      return "/";
  }
}
