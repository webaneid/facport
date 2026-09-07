"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "./chart-utils";

type MonthlyEntry = { month: string; cumulativeUserCount: number };

// § Fase 59, poin 5 — chart "EKG-style" kenaikan TOTAL user (kumulatif,
// bukan delta bulanan — beda dari `UserSubscriptionBarChart`), 12 bulan
// rolling. `type="monotone"` + `dot` supaya tiap titik bulan kelihatan
// jelas (kesan garis EKG naik bertahap), bukan garis lurus polos.
export function UserGrowthAreaChart({ data }: { data: MonthlyEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="userGrowthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1b8f51" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#1b8f51" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} width={32} />
        <Tooltip labelFormatter={(v) => monthLabel(String(v))} formatter={(value) => [value, "Total Pengguna"]} />
        <Area type="monotone" dataKey="cumulativeUserCount" stroke="#178549" strokeWidth={2} fill="url(#userGrowthFill)" dot={{ r: 3, fill: "#178549" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
