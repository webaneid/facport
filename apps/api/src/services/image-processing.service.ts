import sharp from "sharp";

// § components/architecture-component-image-processing.md — TANPA variant
// `og` (dihapus pas project-init, SEO Analyzer = Tidak untuk project ini).
const VARIANTS = {
  thumbnail: { width: 150, height: 150, fit: "cover" as const },
  medium: { width: 768, fit: "inside" as const },
  large: { width: 1024, fit: "inside" as const },
};

export async function generateVariants(buffer: Buffer) {
  const variants: Record<string, Buffer> = {};
  for (const [name, opts] of Object.entries(VARIANTS)) {
    variants[name] = await sharp(buffer)
      .resize({
        ...opts,
        position: opts.fit === "cover" ? sharp.strategy.attention : undefined,
      })
      .webp({ quality: 82 })
      .toBuffer();
  }
  return variants;
}

// § Fase 12, ADR-0017 — favicon PIPELINE TERPISAH dari `generateVariants`
// di atas: PNG (bukan WebP, kompatibilitas browser lama) + transparent
// background dipertahankan (bukan di-flatten putih), § architecture-
// component-image-processing.md § "Favicon (Kasus Khusus)".
const FAVICON_SIZES = [16, 32, 180, 512] as const;

export async function generateFaviconSizes(buffer: Buffer) {
  const sizes: Record<string, Buffer> = {};
  for (const size of FAVICON_SIZES) {
    sizes[String(size)] = await sharp(buffer)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  return sizes;
}
