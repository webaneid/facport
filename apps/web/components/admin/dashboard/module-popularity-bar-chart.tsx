"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { moduleLabel } from "@/lib/module-options";
import { EmptyState } from "@/components/ui/empty-state";
import { PackageSearch } from "lucide-react";

type ModulePopularityEntry = { moduleKey: string; count: number };

// § Fase 59, poin 6 — batang horizontal popularitas sub-modul (urut DESC
// dari backend, `GET /admin/stats/module-popularity`), biar admin tahu
// modul mana yang paling laku. `layout="vertical"` di Recharts = bar
// MENDATAR (kategori di sumbu Y, angka di sumbu X) — penamaan Recharts
// terbalik dari intuisi "vertical/horizontal" biasa.
export function ModulePopularityBarChart({ data }: { data: ModulePopularityEntry[] }) {
  if (data.length === 0) {
    return <EmptyState icon={PackageSearch} title="Belum ada langganan aktif" description="Popularitas modul muncul begitu ada subscription aktif." />;
  }

  const chartData = data.map((d) => ({ ...d, label: moduleLabel(d.moduleKey) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 48)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} fontSize={12} />
        <YAxis type="category" dataKey="label" width={160} fontSize={12} />
        <Tooltip formatter={(value) => [value, "Langganan Aktif"]} />
        <Bar dataKey="count" name="Langganan Aktif" fill="#1b8f51" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
