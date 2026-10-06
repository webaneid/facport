// § Fase 175, ADR-0041 — jadwal job yang berkaitan dengan masa langganan, satu tempat (bisa diuji, tidak tersebar sebagai string cron di worker).
//
// EXPIRE_SUBSCRIPTIONS: flip `status` → "expired" + notifikasi/email "langganan berakhir". Akses TIDAK lagi bergantung pada job ini (gerbang mengecek
// `end_at` langsung), jadi frekuensi hanya menentukan seberapa cepat pelanggan menerima pemberitahuan berakhir — tiap 10 menit.
export const EXPIRE_SUBSCRIPTIONS_CRON = "*/10 * * * *";

// NOTIFY_EXPIRING_SOON: pengingat H-7/H-3/H-1 (trial H-3/H-1). Dijalankan sekali sehari jam 09:00 di ZONA PERUSAHAAN (bukan UTC) supaya email/notifikasi
// tidak datang tengah malam; zona dibaca saat worker menjadwalkan (`company.timezone`, perlu restart worker bila zona diubah di setting).
export const NOTIFY_EXPIRING_SOON_CRON = "0 9 * * *";

// EXPIRE_UNPAID_ORDERS (§ Fase 178): invoice yang belum dibayar (order "pending", belum ada bukti transfer) dan lewat jatuh tempo → order "expired", invoice "expired",
// notifikasi ke customer. Tiap jam (menit ke-5). Order "submitted"/"rejected" TIDAK pernah kedaluwarsa otomatis (sudah ada bukti / menunggu keputusan admin).
export const EXPIRE_UNPAID_ORDERS_CRON = "5 * * * *";
