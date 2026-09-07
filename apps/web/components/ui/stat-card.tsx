import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// § Fase 59 — badge icon warna (bukan icon kecil polos di sebelah label)
// pakai token semantik yang SAMA dengan `Badge` (`components/ui/badge.tsx`)
// supaya konsisten 1 palet, bukan warna baru sembarang.
const TONE_CLASSES = {
  primary: "bg-primary-100 text-primary-700",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
} as const;

// Ekstraksi pola stat-card yang sebelumnya hand-code inline 3x di
// admin dashboard (Pengguna/Paket Aktif/Langganan Aktif) — dipakai
// ulang di halaman modul lain (plans, orders, dst) supaya bentuk
// selalu sama (§ ADR-0023). `tone` (Fase 59) opsional, default "primary"
// — backward-compatible, caller lama tidak berubah tampilannya.
export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  tone = "primary",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  trend?: string;
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle>{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
      </CardContent>
    </Card>
  );
}
