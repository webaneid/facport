import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// § architecture-app-dashboard.md — pengganti teks polos ("Belum Terhubung",
// "Belum ada data") yang sebelumnya cuma 1 baris kecil. Dipakai kapan pun
// sebuah Card/halaman tidak punya data — ikon besar + judul + deskripsi +
// aksi opsional, supaya kelihatan disengaja, bukan "belum selesai dibuat".
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-10 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
