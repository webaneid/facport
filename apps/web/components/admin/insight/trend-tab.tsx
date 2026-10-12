"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { currencyFormatter } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { TREND_METRICS, formatDelta, formatPercent, parseMetric, type TenureResponse, type TrendMetric, type TrendResponse } from "@/lib/insights";
import { monthLabel } from "@/components/admin/dashboard/chart-utils";
import { ExportButton } from "./export-button";
import { useInsightQuery } from "./use-insight-query";

const nf = new Intl.NumberFormat("id-ID");

function valueText(metric: TrendMetric, value: number | null): string {
  if (value === null) return "—";
  return metric === "money" ? currencyFormatter.format(value) : nf.format(value);
}

function deltaText(metric: TrendMetric, delta: number | null): string {
  if (delta === null) return "—";
  return metric === "money" ? `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(delta))}` : formatDelta(delta);
}

function TenurePanel({ month }: { month: string }) {
  const { loading, data, failed } = useInsightQuery<TenureResponse>(`tenure:${month}`, () => api.admin.insights.tenure.get({ query: { month } }) as never);
  if (failed) return <Alert variant="destructive">Gagal memuat rincian usia langganan.</Alert>;
  if (loading || !data) return <Skeleton className="h-24 w-full" />;
  const cells: { label: string; value: number }[] = [
    { label: "Aktif", value: data.aktif },
    { label: "Baru bulan ini", value: data.baru },
    { label: "Lanjutan tahun ke-1", value: data.lanjutanTahun1 },
    ...data.byYear.map((y) => ({ label: `Tahun ke-${y.year}`, value: y.count })),
    { label: "Berhenti", value: data.berhenti },
    { label: "Kembali (aktif lagi)", value: data.kembali },
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-md border p-3">
          <dt className="text-xs text-muted-foreground">{c.label}</dt>
          <dd className="m-0 text-xl font-semibold">{nf.format(c.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

// § Fase 189D — tab Tren & Retensi (butir 7): filter tahun, 5 metrik, grafik + tabel (bulan lalu · selisih · %), dan rincian usia langganan per bulan.
// Bulan setelah bulan berjalan tampil "—" (tidak digambar sebagai 0).
export function TrendTab({ initialMetric = "active" }: { initialMetric?: TrendMetric }) {
  const timeZone = useCompanyTimezone();
  const [currentYear] = useState(() => Number(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(new Date())));
  const [year, setYear] = useState(currentYear);
  const [metric, setMetric] = useState<TrendMetric>(initialMetric);
  const [picked, setPicked] = useState<string | null>(null);
  const { loading, data, failed } = useInsightQuery<TrendResponse>(`trend:${year}:${metric}`, () => api.admin.insights.trend.get({ query: { year, metric } }) as never);

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => currentYear - i), [currentYear]);
  const lastMonth = data ? [...data.points].reverse().find((p) => !p.future)?.month : undefined;
  const tenureMonth = picked && picked.startsWith(`${year}-`) ? picked : lastMonth;
  const chartData = data?.points.map((p) => ({ month: p.month, value: p.value })) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Tahun" value={String(year)} onChange={(e) => { setYear(Number(e.target.value)); setPicked(null); }} className="w-28">
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <Select aria-label="Metrik" value={metric} onChange={(e) => setMetric(parseMetric(e.target.value))} className="w-64">
          {TREND_METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </Select>
        <div className="ml-auto">
          <ExportButton name="trend" params={{ year, metric }} />
        </div>
      </div>
      {failed ? <Alert variant="destructive">Gagal memuat tren.</Alert> : null}
      {loading ? <Skeleton className="h-72 w-full" /> : null}
      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {TREND_METRICS.find((m) => m.key === metric)?.label} · {year}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {data.summary.kind === "stock" ? "saat ini" : "total tahun berjalan"}: {valueText(metric, data.summary.value)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} width={metric === "money" ? 72 : 36} tickFormatter={(v) => (metric === "money" ? nf.format(Number(v)) : String(v))} />
                  <Tooltip labelFormatter={(v) => monthLabel(String(v))} formatter={(value) => [valueText(metric, Number(value)), "Nilai"]} />
                  <Bar dataKey="value" fill="#178549" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead>Nilai</TableHead>
                <TableHead>Bulan lalu</TableHead>
                <TableHead>Selisih</TableHead>
                <TableHead>%</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.points.map((p) => (
                <TableRow key={p.month} data-selected={p.month === tenureMonth}>
                  <TableCell>{monthLabel(p.month)}</TableCell>
                  <TableCell>{valueText(metric, p.value)}</TableCell>
                  <TableCell>{valueText(metric, p.previous)}</TableCell>
                  <TableCell>{deltaText(metric, p.delta)}</TableCell>
                  <TableCell>{formatPercent(p.percent)}</TableCell>
                  <TableCell>
                    {p.future ? null : (
                      <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPicked(p.month)} aria-label={`Rincian ${monthLabel(p.month)}`}>
                        Rincian
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {tenureMonth ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usia langganan · {monthLabel(tenureMonth)}</CardTitle>
              </CardHeader>
              <CardContent>
                <TenurePanel month={tenureMonth} />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
