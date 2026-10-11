"use client";

import Link from "next/link";
import { Users, Building2, CalendarClock, Wallet, Layers, UserCog } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api-client";
import { currencyFormatter } from "@/lib/utils";
import type { SummaryResponse } from "@/lib/insights";
import { useInsightQuery } from "./use-insight-query";

const nf = new Intl.NumberFormat("id-ID");

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

  const { accounts, dataUsaha, customers, expiring, money } = data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="Akun komersil" value={nf.format(accounts.commercial)} trend={`${nf.format(accounts.internal)} akun internal · ${nf.format(accounts.disabled)} nonaktif`} />
        <StatCard icon={Building2} label="Data Usaha terhubung" value={`${nf.format(dataUsaha.connected)} / ${nf.format(dataUsaha.total)}`} trend="terhubung ke Accurate dari total Data Usaha" tone="success" />
        <StatCard icon={Layers} label="Pelanggan aktif" value={nf.format(customers.active)} trend={`${nf.format(customers.activeFeatures)} fitur aktif berbayar`} />
        <StatCard
          icon={CalendarClock}
          label="Akan berakhir"
          value={`${nf.format(expiring.owners14)} pelanggan`}
          trend={`dalam 14 hari · ${nf.format(expiring.owners30)} pelanggan dalam 30 hari`}
          tone="warning"
        />
        <StatCard
          icon={Wallet}
          label="Uang bulan ini"
          value={currencyFormatter.format(money.thisMonth.total)}
          trend={`terverifikasi ${currencyFormatter.format(money.thisMonth.verified)} · dilunasi admin ${currencyFormatter.format(money.thisMonth.adminSettled)}`}
          tone="success"
        />
        <StatCard
          icon={Wallet}
          label="Uang tahun ini"
          value={currencyFormatter.format(money.thisYear.total)}
          trend={`terverifikasi ${currencyFormatter.format(money.thisYear.verified)} · dilunasi admin ${currencyFormatter.format(money.thisYear.adminSettled)}`}
          tone="success"
        />
      </div>
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
