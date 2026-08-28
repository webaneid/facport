// § Fase 10, architecture-subscription.md § "Retensi Data Import" — satu
// sumber kebenaran angka retensi, dipakai validasi `PUT /settings` (admin
// default) SEKARANG dan validasi override per-customer NANTI (kolom
// `subscriptions.importRetentionDaysOverride` sudah ada, endpoint tulisnya
// ditunda) — JANGAN duplikasi angka `7`/`2` di tempat lain.
export const IMPORT_RETENTION_SETTING_KEY = "data.importRetentionDays";
export const MAX_IMPORT_RETENTION_DAYS = 7;
export const DEFAULT_IMPORT_RETENTION_DAYS = 2;
