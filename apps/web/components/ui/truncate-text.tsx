import { cn } from "@/lib/utils";

// § ADR-0034 (2026-09-17) — bungkus kolom tabel berisi teks TAK TERBATAS
// (nama bebas, daftar digabung koma, pesan error, nama file) supaya
// ditruncate 1 baris (bukan bikin tabel melebar/wrap multi-baris), info
// penuh tetap tersedia lewat `title` attribute (hover browser bawaan) —
// SENGAJA bukan Radix `Tooltip` (`components/ui/tooltip.tsx`, 0 pemakaian
// di app ini sampai keputusan ini) supaya tidak perlu mount
// `TooltipProvider` baru cuma untuk kebutuhan ini.
export function TruncateText({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  const resolvedTitle = title ?? (typeof children === "string" ? children : undefined);
  return (
    <span className={cn("block truncate", className)} title={resolvedTitle}>
      {children}
    </span>
  );
}
