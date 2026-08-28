import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// § permintaan user 2026-08-28 — icon Edit (pencil) & Delete (tempat
// sampah) dipasang di kolom aksi SEKARANG (biar tampilan lengkap),
// TAPI fungsinya belum dibangun (dibahas nanti). Disabled + title jelas
// "Segera hadir" supaya tidak menyesatkan (bukan tombol mati diam-diam).
export function ComingSoonIconButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${label} — segera hadir`}
      aria-label={`${label} — segera hadir, belum tersedia`}
      className={cn(buttonVariants("ghost", "h-8 w-8 p-0 cursor-not-allowed opacity-40"))}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
