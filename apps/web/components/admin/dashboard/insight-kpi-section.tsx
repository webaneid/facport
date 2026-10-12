"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import type { SummaryResponse, TrendResponse } from "@/lib/insights";
import { KpiCards } from "@/components/admin/insight/kpi-cards";
import { useInsightQuery } from "@/components/admin/insight/use-insight-query";

function Body() {
  const { loading, data, failed } = useInsightQuery<SummaryResponse>("dashboard-summary", () => api.admin.insights.summary.get() as never);
  // tren mini (tahun berjalan menurut zona waktu perusahaan, dihitung server dari `year`): kegagalan tidak mengganggu kartu — sparkline saja yang hilang
  const [year] = useState(() => new Date().getFullYear());
  const active = useInsightQuery<TrendResponse>(`dashboard-trend-active-${year}`, () => api.admin.insights.trend.get({ query: { year, metric: "active" } }) as never);
  const money = useInsightQuery<TrendResponse>(`dashboard-trend-money-${year}`, () => api.admin.insights.trend.get({ query: { year, metric: "money" } }) as never);
  if (loading) return <Skeleton className="h-40 w-full" aria-busy="true" />;
  if (failed || !data) return <Alert variant="destructive">Gagal memuat KPI pelanggan.</Alert>;
  return <KpiCards data={data} links sparks={{ active: active.data?.points.map((p) => p.value), money: money.data?.points.map((p) => p.value) }} />;
}

// § Fase 189E — KPI komersil vs internal & nilai rupiah di dashboard `/admin`. Hanya untuk `insights.view`; tanpa izin tidak ada bagian dan tidak ada panggilan API.
export function InsightKpiSection() {
  const allowed = usePermissions().includes("insights.view");
  if (!allowed) return null;
  return (
    <section className="space-y-3" aria-label="KPI pelanggan dan keuangan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 text-lg font-semibold">Pelanggan & Keuangan (komersil)</h2>
          <p className="m-0 text-xs text-muted-foreground">Akun internal tidak dihitung. Angka statistik di bawah mencakup semua akun customer.</p>
        </div>
        <Link href="/insight" className="text-sm text-primary-700 hover:underline">
          Buka Insight →
        </Link>
      </div>
      <Body />
    </section>
  );
}
