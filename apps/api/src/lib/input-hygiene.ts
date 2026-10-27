// ADR-0052, architecture-input-hygiene.md - lapis 1: karakter TAK TERLIHAT dari salin-tempel/ketik (NBSP, zero-width, BOM, kontrol, dst) membuat Accurate
// tidak mengenali data yang sebenarnya ada. Hanya yang tak terlihat/setara yang diubah - karakter TERLIHAT (en dash, kutip lengkung, dst) TIDAK disentuh
// (dokumen client tidak boleh diubah). Berlaku di MANA PUN posisinya (awal, tengah, akhir), bukan cuma ujung.
// Semua karakter di bawah SENGAJA ditulis sebagai escape (bukan literal) supaya terbaca di kode.

// Spasi Unicode non-standar -> spasi biasa: NBSP, Ogham, en/em/thin/hair space (2000-200A), narrow NBSP, medium math space, ideographic space.
const ODD_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
// Pemisah baris/paragraf Unicode (LS, PS, NEL) -> baris baru biasa.
const LINE_SEPARATORS = /[\u2028\u2029\u0085]/g;
// Dibuang tanpa pengganti: zero-width (200B-200D, 2060), BOM (FEFF), soft hyphen (00AD), penanda arah (200E/200F, 202A-202E, 2066-2069),
// karakter kontrol C0/C1 kecuali tab (09), LF (0A), CR (0D).
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u00ad\u200e\u200f\u202a-\u202e\u2066-\u2069\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff\u00ad]/g;

export function cleanCell<T>(value: T): T {
  if (typeof value !== "string") return value;
  return value.replace(ODD_SPACES, " ").replace(LINE_SEPARATORS, "\n").replace(INVISIBLE, "").trim() as T;
}

export function cleanRawData(rawData: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) cleaned[cleanCell(key)] = cleanCell(value);
  return cleaned;
}

/** Tampilkan nilai dengan penanda karakter yang biasanya tak terlihat - untuk pesan galat (lapis 4). Contoh: "CUST IN " -> CUST[spasi]IN[spasi] ditandai. */
export function visibleChars(value: unknown): string {
  return String(value ?? "")
    .replace(ZERO_WIDTH, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}>`)
    .replace(/\u00a0/g, "\u237d")
    .replace(/ /g, "\u2420")
    .replace(/\t/g, "\u2409")
    .replace(/\n/g, "\u240a")
    .replace(/\r/g, "\u240d");
}

/** Petunjuk singkat kalau `value` berbeda dari versi bersihnya (spasi/karakter tak terlihat). Kosong kalau tidak ada masalah. */
export function hygieneHint(value: unknown): string {
  const raw = String(value ?? "");
  if (cleanCell(raw) === raw) return "";
  return ` Nilai di file: [${visibleChars(raw)}] - ada spasi/karakter tak terlihat (di awal, tengah, atau akhir).`;
}

/**
 * Lapis 4 - petunjuk untuk karakter yang TERLIHAT tapi mencurigakan SETELAH pembersihan (tidak diubah otomatis, ADR-0052): karakter non-ASCII (mis. huruf Cyrillic
 * yang mirip "C", tanda hubung panjang) dan spasi ganda. Dipakai di pesan "tidak ditemukan di Accurate". Kosong kalau tidak ada yang mencurigakan.
 */
export function oddCharsHint(value: unknown): string {
  const raw = String(value ?? "");
  const found: string[] = [];
  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    if (code > 127) found.push(`"${ch}" (U+${code.toString(16).toUpperCase().padStart(4, "0")})`);
  }
  const parts: string[] = [];
  if (found.length > 0) parts.push(`karakter non-ASCII ${[...new Set(found)].slice(0, 5).join(", ")}`);
  if (/ {2,}/.test(raw)) parts.push("spasi ganda di tengah");
  return parts.length > 0 ? ` Periksa nomor/nama ini - ada ${parts.join(" dan ")}; pastikan sama persis dengan yang tercatat di Accurate.` : "";
}
