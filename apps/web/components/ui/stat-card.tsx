import Link from "next/link";
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
  href,
  spark,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  trend?: string;
  tone?: keyof typeof TONE_CLASSES;
  /** § Fase 190 — kartu dapat diklik (mis. KPI dashboard → tab Insight terkait). Tanpa `href` tampilan & perilaku lama. */
  href?: string;
  /** § Fase 190 — grafik mini (sparkline) di kanan nilai. */
  spark?: React.ReactNode;
  className?: string;
}) {
  const card = (
    <Card className={cn(href && "h-full transition-colors group-hover:border-primary-300 group-focus-visible:ring-2 group-focus-visible:ring-primary-500/40", className)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full compact:h-8 compact:w-8", TONE_CLASSES[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle>{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2">
          <p className="text-3xl font-bold text-foreground compact:text-2xl compact:font-semibold">{value}</p>
          {spark ? <div className="h-8 w-24 shrink-0" aria-hidden="true">{spark}</div> : null}
        </div>
        {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="group block rounded-2xl outline-none compact:rounded-lg">
      {card}
    </Link>
  ) : (
    card
  );
}
