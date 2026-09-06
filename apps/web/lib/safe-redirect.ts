// § audit Fase 18, dipakai lagi Fase 48 — `redirect` datang mentah dari
// query string publik (landing → `/login?redirect=/subscribe?plans=...`,
// § Fase 17/47, diteruskan lagi login↔register § Fase 48). WAJIB path
// relatif SATU-slash, TOLAK URL absolute (`http(s)://...`) dan
// protocol-relative (`//evil.com`, browser menganggap ini absolute juga)
// — tanpa ini, link phishing `?redirect=https://evil.com` bisa arahkan
// user KELUAR aplikasi tepat setelah login/verifikasi sukses (open
// redirect klasik).
export function getSafeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
