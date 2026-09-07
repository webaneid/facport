"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "./chart-utils";

type MonthlyEntry = { month: string; newUserCount: number; newSubscribingUserCount: number };

// § Fase 59, poin 4 — batang jumlah user baru (role customer) vs jumlah
// user yang mulai berlangganan, 12 bulan rolling. Data mentah dari
// `GET /admin/stats/monthly` (§ `lib/admin-stats.ts` backend), komponen
// ini cuma render.
export function UserSubscriptionBarChart({ data }: { data: MonthlyEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthLabel} fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} width={32} />
        <Tooltip labelFormatter={(v) => monthLabel(String(v))} />
        <Legend />
        <Bar dataKey="newUserCount" name="Pengguna Baru" fill="#1b8f51" radius={[3, 3, 0, 0]} />
        <Bar dataKey="newSubscribingUserCount" name="Mulai Berlangganan" fill="#16a34a" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
