import { headers } from "next/headers";
import { Users, Package, CreditCard, History, FileCheck2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { getPublicSettings } from "@/lib/get-public-settings";
import { DEFAULT_COMPANY_TIMEZONE } from "@/lib/timezone";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Stats = { userCount: number; planCount: number; activeSubscriptionCount: number; successfulRowCount: number };
type AuditLog = { id: string; entityType: string; entityId: string; action: string; createdAt: string };

// § architecture-app-dashboard.md — Server Component fetch DENGAN cookie
// forward manual (pola sama app/app/(protected)/page.tsx).
async function fetchJson<T>(path: string, cookie: string): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

const ACTION_LABEL: Record<string, string> = {
  create: "membuat",
  update: "mengubah",
  delete: "menghapus",
};

export default async function AdminDashboardPage() {
  const cookie = (await headers()).get("cookie") ?? "";
  // § Fase 43 (audit timezone 2026-09-06) — Server Component, tidak bisa
  // pakai `useCompanyTimezone()`.
  const publicSettings = await getPublicSettings();
  const companyTimezone = publicSettings["company.timezone"] ?? DEFAULT_COMPANY_TIMEZONE;

  const [stats, auditLogsResult] = await Promise.all([
    fetchJson<Stats>("/admin/stats", cookie),
    fetchJson<{ auditLogs: AuditLog[] }>("/admin/audit-logs?limit=10", cookie),
  ]);
  const auditLogs = auditLogsResult?.auditLogs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard Admin" description="Ringkasan Facport." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileCheck2}
          label="Baris Berhasil Diimport"
          value={stats ? stats.successfulRowCount.toLocaleString("id-ID") : "-"}
        />
        <StatCard icon={Users} label="Pengguna" value={stats?.userCount ?? "-"} />
        <StatCard icon={Package} label="Paket Aktif" value={stats?.planCount ?? "-"} />
        <StatCard icon={CreditCard} label="Langganan Aktif" value={stats?.activeSubscriptionCount ?? "-"} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary-600" />
            <CardTitle>Aktivitas Terakhir</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <EmptyState icon={History} title="Belum ada aktivitas tercatat" />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {auditLogs.map((log) => (
                <li key={log.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">
                    {ACTION_LABEL[log.action] ?? log.action} <strong>{log.entityType}</strong>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(log.createdAt, companyTimezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
