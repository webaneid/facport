"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Eye, Inbox, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/lib/status-badges";
import { moduleLabel } from "@/lib/module-options";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { DisconnectAccurateDialog } from "@/components/admin/disconnect-accurate-dialog";
import { api } from "@/lib/api-client";

// § diminta user 2026-09-05 — halaman detail user, tujuannya bantu admin
// diagnosa saat user telepon minta support: profil singkat + riwayat
// SEMUA batch import (lintas modul), klik Detail buka log per baris
// (§ `admin/import-batches/[batchId]/page.tsx`) yang tampilannya PERSIS
// halaman customer, cuma READ-ONLY (tidak ada retry/edit).
// § Fase 92 (2026-09-10) — ditambah Card "Langganan & Koneksi Accurate"
// (data terpisah dari `import-batches`, fetch paralel) — sebelumnya
// admin SAMA SEKALI tidak bisa lihat status koneksi Accurate customer
// dari sini, apalagi memperbaikinya kalau bermasalah (harus edit
// database manual). Sekarang admin bisa lihat + "Putuskan Koneksi"
// (mirror kemampuan customer sendiri di `/accurate`, § Fase 91) supaya
// customer tinggal "Hubungkan Ulang" dari sisi mereka.
type ImportBatch = { id: string; module: string; fileName: string; status: string; totalRows: number; createdAt: string };
type Detail = {
  user: { id: string; name: string; email: string; disabled: boolean; createdAt: string };
  batches: ImportBatch[];
  total: number;
};
type SubscriptionRow = {
  subscriptionId: string;
  status: string;
  endAt: string | null;
  moduleKey: string | null;
  planName: string;
  connected: boolean;
  connectionStatus: string | null;
  accurateDbAlias: string | null;
};

export default function AdminUserDetailPage() {
  const companyTimezone = useCompanyTimezone();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadSubscriptions = useCallback(async () => {
    const res = await api.admin.users({ id: params.id }).subscriptions.get();
    if (res.data) setSubscriptions((res.data as { subscriptions: SubscriptionRow[] }).subscriptions);
  }, [params.id]);

  useEffect(() => {
    async function load() {
      const res = await api.admin.users({ id: params.id })["import-batches"].get();
      if (res.data) setDetail(res.data as unknown as Detail);
      else if (res.error) setNotFound(true);
      await loadSubscriptions();
    }
    load();
  }, [params.id, loadSubscriptions]);

  if (notFound) {
    return <EmptyState icon={Inbox} title="User tidak ditemukan" />;
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { user, batches, total } = detail;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Detail User" description="Profil & riwayat import — buat referensi saat user telepon support." />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{user.name || "-"}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </div>
            {user.disabled ? <Badge variant="destructive">Nonaktif</Badge> : <Badge variant="success">Aktif</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Terdaftar {formatDate(user.createdAt, companyTimezone)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Langganan & Koneksi Accurate</CardTitle>
          <CardDescription>Status tiap fitur yang dilanggan user, beserta koneksi Accurate Online-nya.</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions === null ? (
            <Skeleton className="h-24 w-full" />
          ) : subscriptions.length === 0 ? (
            <EmptyState icon={Link2} title="Belum punya langganan" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fitur</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Status Langganan</TableHead>
                  <TableHead>Koneksi Accurate</TableHead>
                  <TableHead>Data Usaha</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.subscriptionId}>
                    <TableCell className="text-muted-foreground">{sub.moduleKey ? moduleLabel(sub.moduleKey) : "-"}</TableCell>
                    <TableCell className="font-medium text-foreground">{sub.planName}</TableCell>
                    <TableCell>
                      <StatusBadge domain="subscription" status={sub.status} />
                    </TableCell>
                    <TableCell>
                      {sub.connectionStatus === null ? (
                        <Badge variant="default">Belum Terhubung</Badge>
                      ) : (
                        <StatusBadge domain="accurate-connection" status={sub.connectionStatus} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sub.accurateDbAlias ?? "-"}</TableCell>
                    <TableCell>
                      {sub.connectionStatus !== null && (
                        <div className="flex justify-end">
                          <DisconnectAccurateDialog
                            subscription={{ subscriptionId: sub.subscriptionId, planName: sub.planName, accurateDbAlias: sub.accurateDbAlias }}
                            onDisconnected={loadSubscriptions}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Import</CardTitle>
          <CardDescription>{total} batch total, lintas semua fitur.</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada riwayat import" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Fitur</TableHead>
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
                    <TableCell className="text-muted-foreground">{moduleLabel(batch.module)}</TableCell>
                    <TableCell>
                      <StatusBadge domain="import-batch" status={batch.status} />
                    </TableCell>
                    <TableCell>{batch.totalRows}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(batch.createdAt, companyTimezone)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Link
                          href={`/import-batches/${batch.id}`}
                          title="Detail"
                          aria-label={`Detail batch ${batch.fileName}`}
                          className={buttonVariants("ghost", "h-8 w-8 p-0")}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
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
