import { headers } from "next/headers";
import Link from "next/link";
import { FileSpreadsheet, Link2, CreditCard, Inbox, AlertTriangle, FileCheck2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/lib/status-badges";
import { ImportBatchTable, type UnifiedImportBatch } from "@/components/import-archive/import-batch-table";
import { formatDate, currencyFormatter, formatWorkTimeSaved } from "@/lib/utils";
import { moduleLabel } from "@/lib/module-options";
import { getPublicSettings } from "@/lib/get-public-settings";
import { DEFAULT_COMPANY_TIMEZONE } from "@/lib/timezone";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type SubscriptionRow = {
  subscription: { id: string; status: string; endAt: string | null };
  plan: { name: string; modules: string[] };
};
type SubscriptionsResponse = { subscriptions: SubscriptionRow[] };

type AccurateSubscriptionRow = {
  subscriptionId: string;
  moduleKey: string | null;
  planName: string;
  connected: boolean;
  accurateDbId: string | null;
  accurateDbAlias: string | null;
};
type AccurateSubscriptionsResponse = { subscriptions: AccurateSubscriptionRow[] };

// § Fase 17 — reminder invoice belum dibayar. `orderId` sudah ikut
// diekspos `GET /me/invoices` sejak Fase 16 (link "Bayar Sekarang").
type UnpaidInvoiceRow = { id: string; invoiceNumber: string; total: number; status: string; orderId: string | null };
type InvoicesResponse = { invoices: UnpaidInvoiceRow[] };

// § diminta user 2026-09-06 — "efisiensi waktu kerja": total baris sukses
// milik user ini (lintas SEMUA modul) × estimasi admin detik/baris,
// dihitung server-side (§ apps/api/src/routes/me.route.ts `GET /me/stats`).
type MeStats = { successfulRowCount: number; estimatedTimeSavedSeconds: number };

// § architecture-app-dashboard.md — Server Component fetch DENGAN cookie
// forward manual (pola sama app/admin/(protected)/layout.tsx) — Eden
// client (lib/api-client.ts) `credentials:"include"` cuma efektif di
// BROWSER, tidak ada artinya untuk fetch server-side (tidak ada cookie
// jar browser di server) — jadi endpoint yang butuh auth WAJIB pakai raw
// `fetch()` + header `cookie` manual kalau dipanggil dari Server Component.
async function fetchJson<T>(path: string, cookie: string): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) return null;
  // Elysia serialize handler yang `return null` jadi body BENERAN KOSONG
  // (content-length: 0), bukan literal teks "null" — res.json() langsung
  // throw "Unexpected end of JSON input" kalau dipanggil di body kosong
  // (ketemu 2026-08-27: akun baru tanpa subscription bikin dashboard 500).
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

export default async function DashboardPage() {
  const cookie = (await headers()).get("cookie") ?? "";
  // § Fase 43 (audit timezone 2026-09-06) — Server Component TIDAK bisa
  // pakai `useCompanyTimezone()` (hook), fetch langsung sama seperti
  // `generateMetadata`/root layout (Next.js dedup otomatis).
  const publicSettings = await getPublicSettings();
  const companyTimezone = publicSettings["company.timezone"] ?? DEFAULT_COMPANY_TIMEZONE;

  const [subscriptionsInfo, accurateSubscriptionsInfo, invoicesInfo, meStats, recentImportBatches] = await Promise.all([
    fetchJson<SubscriptionsResponse>("/me/subscriptions", cookie),
    fetchJson<AccurateSubscriptionsResponse>("/accurate/subscriptions", cookie),
    fetchJson<InvoicesResponse>("/me/invoices", cookie),
    fetchJson<MeStats>("/me/stats", cookie),
    fetchJson<{ batches: UnifiedImportBatch[]; total: number }>("/me/import-batches?limit=5", cookie),
  ]);
  const accurateSubscriptions = accurateSubscriptionsInfo?.subscriptions ?? [];
  const unpaidInvoices = (invoicesInfo?.invoices ?? []).filter((inv) => inv.status === "unpaid");

  // § Fase 14, ADR-0019 — `/me/subscriptions` (JAMAK) cuma balikin baris
  // "active" (server-side filtered) — 1 user boleh punya BANYAK
  // subscription aktif sekaligus (1 per sub-modul).
  const subscriptions = subscriptionsInfo?.subscriptions ?? [];

  // § diminta user 2026-09-06 — "Import Terakhir" SEKARANG 1 card
  // GABUNGAN lintas semua modul (bukan 1 card per modul lagi) —
  // `GET /me/import-batches` generik, § `components/import-archive/import-batch-table.tsx`.
  const recentBatches = recentImportBatches?.batches ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Ringkasan akun & aktivitas import kamu." />

      {unpaidInvoices.length > 0 && (
        <Card className="border-warning/40 bg-warning-bg">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <p className="text-sm text-foreground">
                {unpaidInvoices.length === 1
                  ? `Invoice ${unpaidInvoices[0]!.invoiceNumber} (${currencyFormatter.format(unpaidInvoices[0]!.total)}) belum dibayar.`
                  : `${unpaidInvoices.length} invoice belum dibayar.`}
              </p>
            </div>
            <Link
              href={unpaidInvoices.length === 1 && unpaidInvoices[0]!.orderId ? `/billing/${unpaidInvoices[0]!.orderId}/pay` : "/billing"}
              className={buttonVariants("default", "h-8")}
            >
              Bayar Sekarang
            </Link>
          </CardContent>
        </Card>
      )}

      {meStats && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary-600" />
                <CardTitle>Baris Berhasil Diimport</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{meStats.successfulRowCount.toLocaleString("id-ID")}</p>
            </CardContent>
          </Card>

          <Card className="bg-primary-600 text-white">
            <CardContent className="flex items-center gap-3 py-6">
              <Clock className="h-8 w-8 shrink-0" />
              <div>
                <p className="text-sm text-white/90">Anda telah efisiensi waktu kerja sebanyak:</p>
                <p className="text-xl font-bold">{formatWorkTimeSaved(meStats.estimatedTimeSavedSeconds)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary-600" />
              <CardTitle>Langganan</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {subscriptions.length === 0 ? (
              <EmptyState icon={CreditCard} title="Belum punya langganan aktif" className="py-4" />
            ) : (
              subscriptions.map((row) => (
                <div key={row.subscription.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{row.plan.name}</span>
                    <StatusBadge domain="subscription" status={row.subscription.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">Modul: {row.plan.modules.map(moduleLabel).join(", ")}</p>
                  {row.subscription.endAt && <p className="text-xs text-muted-foreground">Berlaku sampai {formatDate(row.subscription.endAt, companyTimezone)}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary-600" />
              <CardTitle>Koneksi Accurate</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {accurateSubscriptions.length === 0 ? (
              <EmptyState icon={Link2} title="Belum punya langganan aktif" className="py-4" />
            ) : accurateSubscriptions.every((row) => row.connected) ? (
              <Badge variant="success">✓ Semua modul terhubung</Badge>
            ) : (
              <>
                {accurateSubscriptions.map((row) => (
                  <div key={row.subscriptionId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{row.planName}</span>
                    {row.connected ? <Badge variant="success">✓ Terhubung</Badge> : <Badge variant="warning">Belum terhubung</Badge>}
                  </div>
                ))}
                <Link href="/accurate" className={buttonVariants("default")}>
                  Hubungkan Sekarang
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary-600" />
                <CardTitle>Import Terakhir</CardTitle>
              </div>
              <CardDescription>5 import terakhir dari semua modul.</CardDescription>
            </div>
            <Link href="/import/arsip" className={buttonVariants("outline")}>
              Tampilkan Arsip Lain
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentBatches.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada riwayat import" description="Upload file Excel pertama kamu untuk mulai." />
          ) : (
            <ImportBatchTable batches={recentBatches} timezone={companyTimezone} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
