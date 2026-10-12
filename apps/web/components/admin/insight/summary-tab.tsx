"use client";

import Link from "next/link";
import { UserCog } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api-client";
import type { SummaryResponse } from "@/lib/insights";
import { KpiCards } from "./kpi-cards";
import { useInsightQuery } from "./use-insight-query";

// § Fase 189D — tab Ringkasan: kartu KPI dari `GET /admin/insights/summary` + pintasan ke tab terkait.
export function SummaryTab() {
  const { loading, data, failed } = useInsightQuery<SummaryResponse>("summary", () => api.admin.insights.summary.get() as never);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (failed || !data) return <Alert variant="destructive">Gagal memuat ringkasan. Muat ulang halaman.</Alert>;

  return (
    <div className="space-y-4">
      <KpiCards data={data} />
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <UserCog className="h-4 w-4" />
        Telusuri:
        <Link className="text-primary-700 hover:underline" href="/insight?tab=pelanggan">Pelanggan</Link>
        <Link className="text-primary-700 hover:underline" href="/insight?tab=langganan">Langganan akan berakhir</Link>
        <Link className="text-primary-700 hover:underline" href="/insight?tab=tren">Tren & retensi</Link>
        <Link className="text-primary-700 hover:underline" href="/insight?tab=koneksi">Riwayat koneksi</Link>
      </p>
    </div>
  );
}
