"use client";

import { Users, Building2, CalendarClock, Wallet, Layers } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { currencyFormatter } from "@/lib/utils";
import type { SummaryResponse } from "@/lib/insights";

const nf = new Intl.NumberFormat("id-ID");

// § Fase 189D/189E — kartu KPI Insight, SATU sumber untuk tab Ringkasan Insight dan dashboard `/admin` (tanpa duplikasi).
export function KpiCards({ data }: { data: SummaryResponse }) {
  const { accounts, dataUsaha, customers, expiring, money } = data;
  return (
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
  );
}
