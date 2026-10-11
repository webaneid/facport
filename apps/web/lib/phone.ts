// § Fase 189A, ADR-0044 — standar nomor telepon & WhatsApp: E.164 DENGAN tanda "+" (mis. "+6281234567890"). Salinan SENGAJA dari project Jalajogja
// (`apps/web/lib/phone.ts`, `docs/arsitektur-kontak.md`) dan paritas dengan `apps/api/src/lib/phone.ts` (kasus tes yang sama). Nomor milik AKUN
// manusia, bukan Data Usaha. Aturan baku: input pakai `PhoneInput`; server MENORMALISASI saat simpan; tampilan lewat `displayPhone`; tautan
// `wa.me` dibangun dari nilai E.164 ASLI lewat `toWaDigits` — JANGAN dari hasil `displayPhone` (kehilangan kode negara, bug yang pernah terjadi di Jalajogja).

/** E.164: "+" lalu kode negara (tidak diawali 0), total 8–15 digit. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s;
  if (s.startsWith("0")) return "+62" + s.slice(1);
  if (s.startsWith("62")) return "+" + s;
  return "+62" + s;
}

/** Tampilan: +628xxx → 08xxx (enak dibaca orang Indonesia); nomor internasional apa adanya. */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  if (e164.startsWith("+62")) return "0" + e164.slice(3);
  return e164;
}

/** Digit saja untuk tautan wa.me — WAJIB dari nilai E.164 asli, bukan hasil `displayPhone`. Kosong bila nomor tidak sah. */
export function toWaDigits(raw: string | null | undefined): string {
  const normalized = normalizePhone(raw);
  if (!normalized || !isValidE164(normalized)) return "";
  return normalized.replace(/^\+/, "");
}

/** Tautan WhatsApp Web/Desktop/aplikasi, atau null bila nomor tidak sah (tombol tidak ditampilkan). */
export function waLink(raw: string | null | undefined): string | null {
  const digits = toWaDigits(raw);
  return digits ? `https://wa.me/${digits}` : null;
}
