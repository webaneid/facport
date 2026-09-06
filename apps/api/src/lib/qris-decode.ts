import sharp from "sharp";
import jsQR from "jsqr";
import { isValidQrisPayload } from "./qris-emv";

// § diminta user 2026-09-06 — SEBELUM ini, admin WAJIB scan/decode
// barcode QRIS SENDIRI pakai alat eksternal lalu copy-paste hasilnya ke
// form (rawan whitespace, § lessons-learned.md 2026-09-06 — bug fix
// sebelumnya). Barcode QRIS yang diupload SUDAH berisi PERSIS payload
// EMV yang dicari — baca LANGSUNG dari gambarnya di sini, admin tidak
// perlu cari alat lain sama sekali.
//
// `jsQR` butuh raw RGBA pixel data (bukan buffer file JPEG/PNG
// terkompresi) — `sharp().ensureAlpha().raw()` (dependency project sejak
// Fase 12) pas untuk ini, tidak perlu library image-processing baru
// selain `jsQR` sendiri.
//
// Return `null` (BUKAN throw) kalau gagal baca — foto boleh saja bukan
// QR code sama sekali (buram/rusak), ATAU QR code valid tapi ISINYA
// bukan payload QRIS (mis. QR link website) — caller (`branding.route.ts`)
// treat `null` sebagai "auto-detect gagal", fallback ke input manual di
// frontend TETAP ada, ini murni best-effort bukan satu-satunya jalur.
export async function decodeQrisEmvPayload(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
    if (!result) return null;
    const trimmed = result.data.trim();
    return isValidQrisPayload(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}
