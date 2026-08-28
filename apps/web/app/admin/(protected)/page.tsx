import { headers } from "next/headers";
import { Users, Package, CreditCard, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Stats = { userCount: number; planCount: number; activeSubscriptionCount: number };
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

  const [stats, auditLogsResult] = await Promise.all([
    fetchJson<Stats>("/admin/stats", cookie),
    fetchJson<{ auditLogs: AuditLog[] }>("/admin/audit-logs?limit=10", cookie),
  ]);
  const auditLogs = auditLogsResult?.auditLogs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Admin</h1>
        <p className="text-sm text-muted-foreground">Ringkasan Facport.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-600" />
              <CardTitle>Pengguna</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{stats?.userCount ?? "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary-600" />
              <CardTitle>Paket Aktif</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{stats?.planCount ?? "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary-600" />
              <CardTitle>Langganan Aktif</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{stats?.activeSubscriptionCount ?? "-"}</p>
          </CardContent>
        </Card>
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
                  <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
