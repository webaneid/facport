import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Ekstraksi pola stat-card yang sebelumnya hand-code inline 3x di
// admin dashboard (Pengguna/Paket Aktif/Langganan Aktif) — dipakai
// ulang di halaman modul lain (plans, orders, dst) supaya bentuk
// selalu sama (§ ADR-0023).
export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  trend?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary-600" />
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
