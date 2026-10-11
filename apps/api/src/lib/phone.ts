// § Fase 189A, ADR-0044 — standar nomor telepon & WhatsApp: E.164 DENGAN tanda "+" (mis. "+6281234567890").
// Salinan SENGAJA dari project Jalajogja (`apps/web/lib/phone.ts`, `docs/arsitektur-kontak.md`) — tidak ada paket bersama antar
// project. Duplikasi minimal juga ada di `apps/web/lib/phone.ts`; keduanya diuji paritas (kasus yang sama).
// Nomor milik AKUN manusia (BUKAN Data Usaha) — lihat `docs/architecture/architecture-contact.md`.

/** E.164: "+" lalu kode negara (tidak diawali 0) dan total 8–15 digit. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

// Normalisasi ke E.164 — WAJIB dipanggil di semua tempat server menyimpan nomor.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s; // sudah E.164
  if (s.startsWith("0")) return "+62" + s.slice(1); // lokal Indonesia: 08xxx
  if (s.startsWith("62")) return "+" + s; // tanpa +: 628xxx
  return "+62" + s; // fallback Indonesia
}

export const COMPANY_NAME_MAX_LENGTH = 200;

// § audit keamanan Fase 189A (Low) — nama perusahaan dirender di panel admin; karakter kontrol, zero-width, dan penimpa arah (bidi) tidak punya alasan sah
// di nama usaha dan memungkinkan spoofing tampilan. Spasi/tab/baris-baru biasa sudah dipadatkan jadi satu spasi sebelum cek ini.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_COMPANY_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

export type ContactInput = { companyName?: unknown; phone?: unknown; whatsapp?: unknown };
export type ContactValue = { companyName: string; phone: string; whatsapp: string };
export type ContactField = keyof ContactValue;

/**
 * Validasi + normalisasi data kontak akun. SEMUA tiga isian wajib dan valid; hasil siap disimpan.
 * `field` pada kegagalan = isian pertama yang salah (untuk pesan galat yang spesifik di UI).
 */
export function parseContact(input: ContactInput): { ok: true; value: ContactValue } | { ok: false; field: ContactField } {
  const companyName = typeof input.companyName === "string" ? input.companyName.trim().replace(/\s+/g, " ") : "";
  if (companyName.length < 1 || companyName.length > COMPANY_NAME_MAX_LENGTH || FORBIDDEN_COMPANY_CHARS.test(companyName)) return { ok: false, field: "companyName" };

  const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : null;
  if (!phone || !isValidE164(phone)) return { ok: false, field: "phone" };

  const whatsapp = typeof input.whatsapp === "string" ? normalizePhone(input.whatsapp) : null;
  if (!whatsapp || !isValidE164(whatsapp)) return { ok: false, field: "whatsapp" };

  return { ok: true, value: { companyName, phone, whatsapp } };
}

/** Apakah body membawa SALAH SATU isian kontak (kunci ada, apa pun nilainya)? Dipakai sign-up: tanpa kunci kontak = klien lama, diterima. */
export function hasContactKeys(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  return "companyName" in input || "phone" in input || "whatsapp" in input;
}

/** Satu definisi "profil kontak lengkap" di server: ketiga isian terisi dan nomornya E.164 sah. Dipakai `/me` (`profileComplete`) agar UI tidak menebak sendiri. */
export function isContactComplete(row: { companyName?: string | null; phone?: string | null; whatsapp?: string | null }): boolean {
  const name = row.companyName?.trim() ?? "";
  return name.length > 0 && !!row.phone && isValidE164(row.phone) && !!row.whatsapp && isValidE164(row.whatsapp);
}
