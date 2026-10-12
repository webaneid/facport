"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

// § Fase 190 — grafik mini untuk kartu KPI. Titik `null` (bulan yang belum berjalan) membuat garis putus — tidak digambar sebagai 0.
export function Sparkline({ values, color = "#178549" }: { values: (number | null)[]; color?: string }) {
  const data = values.map((v, i) => ({ i, v }));
  if (data.filter((d) => d.v !== null).length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
