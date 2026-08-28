import { headers } from "next/headers";
import Link from "next/link";
import { FileSpreadsheet, Link2, CreditCard, Inbox, Eye } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { CancelImportDialog } from "@/components/purchase-invoice/cancel-import-dialog";
import { DeleteImportDialog } from "@/components/purchase-invoice/delete-import-dialog";
import { CANCELLABLE_BATCH_STATUS, DELETE_BLOCKED_BATCH_STATUS } from "@/lib/import-batch-status";
import { formatDate } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type SubscriptionInfo = {
  subscription: { status: string; endAt: string | null };
  plan: { name: string; modules: string[] };
} | null;

type AccurateStatus = { connected: boolean; accurateDbId: string | null };

type ImportBatch = { id: string; fileName: string; status: string; totalRows: number; createdAt: string };

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

const SUBSCRIPTION_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "Aktif", variant: "success" },
  pending_payment: { label: "Menunggu Pembayaran", variant: "warning" },
  expired: { label: "Kadaluarsa", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "default" },
};

const BATCH_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  completed: { label: "Selesai", variant: "success" },
  completed_with_errors: { label: "Selesai (ada gagal)", variant: "warning" },
  processing: { label: "Memproses", variant: "warning" },
  mapping_pending: { label: "Menunggu Konfirmasi", variant: "default" },
  failed: { label: "Gagal", variant: "destructive" },
  // § Fase 09, ADR-0013 — Batal Import
  cancelling: { label: "Membatalkan...", variant: "warning" },
  cancelled: { label: "Dibatalkan", variant: "default" },
  cancelled_partial: { label: "Dibatalkan (sebagian)", variant: "warning" },
};

export default async function DashboardPage() {
  const cookie = (await headers()).get("cookie") ?? "";

  const [subscriptionInfo, accurateStatus, importList] = await Promise.all([
    fetchJson<SubscriptionInfo>("/me/subscription", cookie),
    fetchJson<AccurateStatus>("/accurate/status", cookie),
    fetchJson<{ batches: ImportBatch[] }>("/purchase-invoice/import?limit=5", cookie),
  ]);

  const batches = importList?.batches ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Ringkasan akun & aktivitas import kamu.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary-600" />
              <CardTitle>Langganan</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!subscriptionInfo ? (
              <EmptyState icon={CreditCard} title="Belum punya langganan aktif" className="py-4" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{subscriptionInfo.plan.name}</span>
                  <Badge variant={(SUBSCRIPTION_STATUS[subscriptionInfo.subscription.status] ?? { variant: "default" }).variant}>
                    {SUBSCRIPTION_STATUS[subscriptionInfo.subscription.status]?.label ?? subscriptionInfo.subscription.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Modul: {subscriptionInfo.plan.modules.join(", ")}</p>
                {subscriptionInfo.subscription.endAt && (
                  <p className="text-xs text-muted-foreground">
                    Berlaku sampai {formatDate(subscriptionInfo.subscription.endAt)}
                  </p>
                )}
              </>
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
            {accurateStatus?.connected && accurateStatus.accurateDbId ? (
              <Badge variant="success">✓ Terhubung</Badge>
            ) : (
              <EmptyState
                icon={Link2}
                title="Belum terhubung ke Accurate"
                description="Hubungkan akun Accurate Online supaya faktur bisa langsung masuk otomatis."
                action={
                  <Link href="/accurate" className={buttonVariants("default")}>
                    Hubungkan Sekarang
                  </Link>
                }
                className="py-4"
              />
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
              <CardDescription>5 import Faktur Pembelian terbaru.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/purchase-invoice/import/riwayat" className={buttonVariants("outline")}>
                Tampilkan Arsip Lain
              </Link>
              <Link href="/purchase-invoice/import" className={buttonVariants("default")}>
                Import Faktur Pembelian →
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Belum ada riwayat import"
              description="Upload file Excel Faktur Pembelian pertama kamu untuk mulai."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Baris</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium text-foreground">{batch.fileName}</TableCell>
                    <TableCell>
                      <Badge variant={(BATCH_STATUS[batch.status] ?? { variant: "default" }).variant}>
                        {BATCH_STATUS[batch.status]?.label ?? batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{batch.totalRows}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(batch.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/purchase-invoice/import/${batch.id}`}
                          title="Detail"
                          aria-label={`Detail untuk ${batch.fileName}`}
                          className={buttonVariants("ghost", "h-8 w-8 p-0")}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {CANCELLABLE_BATCH_STATUS.has(batch.status) && <CancelImportDialog batch={batch} />}
                        {!DELETE_BLOCKED_BATCH_STATUS.has(batch.status) && <DeleteImportDialog batch={batch} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
