import { headers } from "next/headers";
import { Users, Package, CreditCard, FileCheck2, TrendingUp, Timer, Hourglass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { formatWorkTimeSaved } from "@/lib/utils";
import { UserSubscriptionBarChart } from "@/components/admin/dashboard/user-subscription-bar-chart";
import { UserGrowthAreaChart } from "@/components/admin/dashboard/user-growth-area-chart";
import { ModulePopularityBarChart } from "@/components/admin/dashboard/module-popularity-bar-chart";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Stats = { userCount: number; planCount: number; activeSubscriptionCount: number; successfulRowCount: number };
type MonthlyEntry = { month: string; newUserCount: number; cumulativeUserCount: number; newSubscribingUserCount: number };
type ModulePopularityEntry = { moduleKey: string; count: number };
type EfficiencyStats = { rowsThisMonth: number; rowsLastMonth: number; rowGrowthPercent: number; efficiencyPercent: number; totalEfficiencySeconds: number };

// § architecture-app-dashboard.md — Server Component fetch DENGAN cookie
// forward manual (pola sama app/app/(protected)/page.tsx).
async function fetchJson<T>(path: string, cookie: string): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("id-ID")}%`;
}

export default async function AdminDashboardPage() {
  const cookie = (await headers()).get("cookie") ?? "";

  const [stats, monthly, modulePopularity, efficiency] = await Promise.all([
    fetchJson<Stats>("/admin/stats", cookie),
    fetchJson<MonthlyEntry[]>("/admin/stats/monthly", cookie),
    fetchJson<ModulePopularityEntry[]>("/admin/stats/module-popularity", cookie),
    fetchJson<EfficiencyStats>("/admin/stats/efficiency", cookie),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard Admin" description="Ringkasan Facport." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileCheck2}
          label="Baris Berhasil Diimport"
          value={stats ? stats.successfulRowCount.toLocaleString("id-ID") : "-"}
          tone="success"
        />
        {/* § Fase 59 — HANYA role customer (bug lama: ikut hitung admin/staff) */}
        <StatCard icon={Users} label="Pengguna" value={stats?.userCount ?? "-"} tone="primary" />
        <StatCard icon={Package} label="Paket Aktif" value={stats?.planCount ?? "-"} tone="success" />
        <StatCard icon={CreditCard} label="Langganan Aktif" value={stats?.activeSubscriptionCount ?? "-"} tone="primary" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          label="Pertumbuhan Baris Bulan Ini"
          value={efficiency ? formatPercent(efficiency.rowGrowthPercent) : "-"}
          trend={efficiency ? `${efficiency.rowsThisMonth.toLocaleString("id-ID")} baris (bulan lalu: ${efficiency.rowsLastMonth.toLocaleString("id-ID")})` : undefined}
          tone={efficiency && efficiency.rowGrowthPercent < 0 ? "warning" : "success"}
        />
        <StatCard
          icon={Timer}
          label="Efisiensi Waktu"
          value={efficiency ? `${(Math.round(efficiency.efficiencyPercent * 10) / 10).toLocaleString("id-ID")}%` : "-"}
          trend="Dibanding estimasi input manual ke Accurate"
          tone="primary"
        />
        <StatCard
          icon={Hourglass}
          label="Total Waktu Dihemat"
          value={efficiency ? formatWorkTimeSaved(efficiency.totalEfficiencySeconds) : "-"}
          trend="Sepanjang waktu, seluruh pengguna"
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pengguna & Langganan Baru (12 Bulan Terakhir)</CardTitle>
          </CardHeader>
          <CardContent>
            <UserSubscriptionBarChart data={monthly ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Popularitas Sub-Modul</CardTitle>
          </CardHeader>
          <CardContent>
            <ModulePopularityBarChart data={modulePopularity ?? []} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kenaikan Total Pengguna (12 Bulan Terakhir)</CardTitle>
        </CardHeader>
        <CardContent>
          <UserGrowthAreaChart data={monthly ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
