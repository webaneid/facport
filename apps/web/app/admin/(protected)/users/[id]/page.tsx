"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Eye, Inbox } from "lucide-react";
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
import { api } from "@/lib/api-client";

// § diminta user 2026-09-05 — halaman detail user, tujuannya bantu admin
// diagnosa saat user telepon minta support: profil singkat + riwayat
// SEMUA batch import (lintas modul), klik Detail buka log per baris
// (§ `admin/import-batches/[batchId]/page.tsx`) yang tampilannya PERSIS
// halaman customer, cuma READ-ONLY (tidak ada retry/edit).
type ImportBatch = { id: string; module: string; fileName: string; status: string; totalRows: number; createdAt: string };
type Detail = {
  user: { id: string; name: string; email: string; disabled: boolean; createdAt: string };
  batches: ImportBatch[];
  total: number;
};

export default function AdminUserDetailPage() {
  const companyTimezone = useCompanyTimezone();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await api.admin.users({ id: params.id })["import-batches"].get();
      if (res.data) setDetail(res.data as unknown as Detail);
      else if (res.error) setNotFound(true);
    }
    load();
  }, [params.id]);

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
          <CardTitle>Riwayat Import</CardTitle>
          <CardDescription>{total} batch total, lintas semua modul.</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada riwayat import" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Modul</TableHead>
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
