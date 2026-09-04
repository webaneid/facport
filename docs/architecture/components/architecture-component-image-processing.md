# Component — Image Processing (Autocrop/Resize)

## Tool: `sharp`
Native library, kompatibel Bun, cepat, gratis. Smart-crop (deteksi area
penting otomatis, mirip mesin crop WordPress) lewat opsi bawaan
`position: "attention"` — **tidak perlu API eksternal berbayar** (mis. layanan
AI-crop SaaS), semua diproses di server sendiri.

## Kapan Jalan
Otomatis, sinkron dengan alur upload di Media Library (§
`architecture-component-media-library.md`) — bukan proses terpisah yang
di-trigger manual.

```ts
// apps/api/src/services/image-processing.service.ts
import sharp from "sharp";

const VARIANTS = {
  thumbnail: { width: 150, height: 150, fit: "cover" as const },
  medium: { width: 768, fit: "inside" as const }, // proporsional, tidak dipotong paksa
  large: { width: 1024, fit: "inside" as const },
};

export async function generateVariants(buffer: Buffer) {
  const variants: Record<string, Buffer> = {};
  for (const [name, opts] of Object.entries(VARIANTS)) {
    variants[name] = await sharp(buffer)
      .resize({
        ...opts,
        position: opts.fit === "cover" ? sharp.strategy.attention : undefined, // smart-crop cuma relevan kalau fit:"cover" (dipotong paksa)
      })
      .webp({ quality: 82 }) // WebP — lebih ringan dari JPEG/PNG, didukung semua browser modern
      .toBuffer();
  }
  return variants; // upload tiap variant ke MinIO, simpan key-nya di kolom media.variants
}
```

## Standar Ukuran (Acuan Google/SEO)
| Variant | Ukuran | Dipakai Untuk |
|---|---|---|
| `thumbnail` | 150×150, cropped | Grid Media Library, preview kecil |
| `medium` | max-width 768px, proporsional | Konten artikel (inline images) |
| `large` | max-width 1024px, proporsional | Gambar utama/hero |

> `fit: "cover"` (thumbnail, og) = dipotong paksa ke rasio target → smart-crop
> aktif. `fit: "inside"` (medium, large) = tetap proporsional, tidak dipotong
> → tidak butuh smart-crop, cuma resize.

## Format Output — WebP
Semua variant di-convert ke WebP (kecuali file asli tetap disimpan dalam
format aslinya sebagai backup/re-process). WebP dipilih karena ukuran file
jauh lebih kecil dari JPEG/PNG di kualitas visual setara — mempercepat
loading dashboard admin (logo, avatar, dll).

## Favicon (Kasus Khusus) — Terimplementasi Fase 12, ADR-0017
Favicon butuh multi-ukuran berbeda dari variant di atas (16×16, 32×32,
180×180 untuk Apple touch icon, 512×512 untuk PWA), generate TERPISAH dari
pipeline Media Library umum (`generateVariants` di atas) — logic-nya beda
(favicon butuh transparent background dipertahankan, PNG bukan WebP karena
kompatibilitas browser lama untuk favicon):

```ts
// apps/api/src/services/image-processing.service.ts
const FAVICON_SIZES = [16, 32, 180, 512] as const;

export async function generateFaviconSizes(buffer: Buffer) {
  const sizes: Record<string, Buffer> = {};
  for (const size of FAVICON_SIZES) {
    sizes[String(size)] = await sharp(buffer)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }) // transparent, TIDAK di-flatten
      .png()
      .toBuffer();
  }
  return sizes; // upload tiap ukuran ke bucket facport-public, key branding/favicon-{uuid}/{size}.png
}
```
Dipanggil dari `POST /admin/branding/favicon` (§ `architecture-settings.md`
§ API), hasil upload disimpan sebagai object `{ "16": url, ... }` di
`settings.company.favicon` — BUKAN lewat `POST /media/upload` generik.

## Referensi
- Dipanggil dari alur upload → `architecture-component-media-library.md`
