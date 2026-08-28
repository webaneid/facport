"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Inbox, Trash2 } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ComingSoonIconButton } from "@/components/ui/coming-soon-icon-button";
import { CancelImportDialog } from "@/components/purchase-invoice/cancel-import-dialog";
import { CANCELLABLE_BATCH_STATUS } from "@/lib/import-batch-status";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

// § Fase 09, ADR-0013 — halaman arsip SEMUA batch import (dashboard cuma
// tampil 5 terakhir, § app/(protected)/page.tsx). Kolom aksi icon SVG
// (`lucide-react`, § permintaan user 2026-08-28) — Detail=mata,
// Batal Import=undo (`components/purchase-invoice/cancel-import-dialog.tsx`,
// dipakai bareng dashboard).
type ImportBatch = { id: string; fileName: string; status: string; totalRows: number; createdAt: string };

const PAGE_SIZE = 20;

const BATCH_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  completed: { label: "Selesai", variant: "success" },
  completed_with_errors: { label: "Selesai (ada gagal)", variant: "warning" },
  processing: { label: "Memproses", variant: "warning" },
  mapping_pending: { label: "Menunggu Konfirmasi", variant: "default" },
  failed: { label: "Gagal", variant: "destructive" },
  cancelling: { label: "Membatalkan...", variant: "warning" },
  cancelled: { label: "Dibatalkan", variant: "default" },
  cancelled_partial: { label: "Dibatalkan (sebagian)", variant: "warning" },
};

export default function PurchaseInvoiceImportArchivePage() {
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
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Arsip Riwayat Import</h1>
        <p className="text-sm text-muted-foreground">Semua import Faktur Pembelian, termasuk yang lebih lama.</p>
      </div>

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
                          {CANCELLABLE_BATCH_STATUS.has(batch.status) && (
                            <CancelImportDialog batch={batch} onCancelled={load} />
                          )}
                          <ComingSoonIconButton icon={Trash2} label="Delete" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Halaman {page + 1} dari {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page + 1 >= totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
