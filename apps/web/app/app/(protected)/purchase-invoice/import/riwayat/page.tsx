"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/lib/status-badges";
import { CancelImportDialog } from "@/components/purchase-invoice/cancel-import-dialog";
import { DeleteImportDialog } from "@/components/purchase-invoice/delete-import-dialog";
import { CANCELLABLE_BATCH_STATUS, DELETE_BLOCKED_BATCH_STATUS } from "@/lib/import-batch-status";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

// § Fase 09, ADR-0013 — halaman arsip SEMUA batch import (dashboard cuma
// tampil 5 terakhir, § app/(protected)/page.tsx). Kolom aksi icon SVG
// (`lucide-react`, § permintaan user 2026-08-28) — Detail=mata,
// Batal Import=undo (`components/purchase-invoice/cancel-import-dialog.tsx`,
// dipakai bareng dashboard).
type ImportBatch = { id: string; fileName: string; status: string; totalRows: number; createdAt: string };

const PAGE_SIZE = 20;

export default function PurchaseInvoiceImportArchivePage() {
  const companyTimezone = useCompanyTimezone();
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  async function load() {
    const res = await api["purchase-invoice"].import.get({ query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE } });
    if (res.data) {
      const data = res.data as unknown as { batches: ImportBatch[]; total: number };
      setBatches(data.batches);
      setTotal(data.total);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal + polling daftar batch, pola standar
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Arsip Riwayat Import" description="Semua import Faktur Pembelian, termasuk yang lebih lama." />

      <Card>
        <CardHeader>
          <CardTitle>Semua Batch</CardTitle>
          <CardDescription>{total} batch total.</CardDescription>
        </CardHeader>
        <CardContent>
          {!batches ? (
            <Skeleton className="h-40 w-full" />
          ) : batches.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada riwayat import" />
          ) : (
            <>
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
                        <StatusBadge domain="import-batch" status={batch.status} />
                      </TableCell>
                      <TableCell>{batch.totalRows}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(batch.createdAt, companyTimezone)}</TableCell>
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
                          {CANCELLABLE_BATCH_STATUS.has(batch.status) && (
                            <CancelImportDialog batch={batch} onCancelled={load} />
                          )}
                          {!DELETE_BLOCKED_BATCH_STATUS.has(batch.status) && (
                            <DeleteImportDialog batch={batch} onDeleted={load} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
