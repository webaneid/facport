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
