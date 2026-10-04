// § diminta user 2026-10-03 — segmen URL yang berisi ID (UUID, ID user 32 karakter, nomor panjang) dulu di-title-case apa adanya
// jadi label breadcrumb yang sangat panjang dan menumpuk ke logo header. ID dipendekkan (`#wbEE2zd6…`), nilai lengkap tetap
// tersedia lewat `title` (hover). Segmen biasa ("import-faktur-pembelian") tetap di-title-case seperti sebelumnya.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_TOKEN_RE = /^[A-Za-z0-9_]{16,}$/; // tanpa tanda hubung → bukan kata biasa ("import-faktur" selalu pakai tanda hubung)
const LONG_NUMBER_RE = /^\d{8,}$/;

export function isIdSegment(segment: string): boolean {
  return UUID_RE.test(segment) || LONG_TOKEN_RE.test(segment) || LONG_NUMBER_RE.test(segment);
}

export function breadcrumbLabel(segment: string): { label: string; title?: string } {
  if (isIdSegment(segment)) return { label: `#${segment.slice(0, 8)}…`, title: segment };
  return { label: segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
}
