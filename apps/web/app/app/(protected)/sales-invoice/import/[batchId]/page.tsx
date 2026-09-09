"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EditRowDialog, DATE_INTERNAL_FIELDS, REQUIRED_INTERNAL_FIELDS } from "@/components/sales-invoice/edit-row-dialog";
import { EditableGrid } from "@/components/import/editable-grid";
import { ImportProgress } from "@/components/import/import-progress";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { findNumberColumn, findPoNumberColumn, invoiceNumberOf, siblingRowNumbersOf, sortByInvoiceNumber } from "@/lib/sales-invoice-batch-helpers";

// § Fase 13 — mirror 1:1 `app/app/(protected)/purchase-invoice/import/[batchId]/page.tsx`
// (PO Number ganti peran Bill No).
type Row = {
  id: string;
  rowNumber: number;
  status: string;
  accurateTransactionId: string | null;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

type BatchDetail = {
  batch: {
    id: string;
    status: string;
    totalRows: number;
    fileName: string;
    columnMapping: Record<string, string> | null;
  };
  summary: { pending: number; success: number; failed: number };
  rows: Row[];
};

// § Fase 63 — logic penentuan "Nomor Transaksi" (Trans No diutamakan,
// fallback PO Number — feedback client: PO Number/Bill No boleh sama
// walau beda transaksi, Trans No harus unik) diekstrak ke
// `lib/sales-invoice-batch-helpers.ts` (dites terpisah di sana, tanpa
// import modul page.tsx ini — hindari konflik `mock.module("next/navigation")`
// dari test file lain).

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "default" }> = {
  success: { label: "Sukses", variant: "success" },
  failed: { label: "Gagal", variant: "destructive" },
  pending: { label: "Menunggu", variant: "warning" },
  processing: { label: "Memproses", variant: "warning" },
  completed: { label: "Selesai", variant: "success" },
  completed_with_errors: { label: "Selesai (ada gagal)", variant: "warning" },
  mapping_pending: { label: "Menunggu Konfirmasi", variant: "default" },
  cancelling: { label: "Membatalkan...", variant: "warning" },
  cancelled: { label: "Dibatalkan", variant: "default" },
  cancelled_partial: { label: "Dibatalkan (sebagian)", variant: "warning" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function SalesInvoiceImportResultPage() {
  const params = useParams<{ batchId: string }>();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);

  async function load() {
    const res = await api["sales-invoice"].import({ batchId: params.batchId }).get();
    if (res.data) setDetail(res.data as unknown as BatchDetail);
  }

  // § Fase 51 — bulk save (grid ala Excel), TIDAK auto-retry.
  async function handleGridSave(rowsToSave: { id: string; rawData: Record<string, string> }[]) {
    const res = await api["sales-invoice"].import({ batchId: params.batchId }).rows.put({ rows: rowsToSave });
    if (res.error) return null;
    return res.data as { updated: string[]; errors: { rowId: string; rowNumber: number; fields: string[] }[] };
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal + polling status batch, pola standar
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.batchId]);

  async function handleRetry() {
    setRetrying(true);
    const res = await api["sales-invoice"].import({ batchId: params.batchId }).retry.post();
    setRetrying(false);
    if (res.error) {
      const value = res.error.value as { code?: string; remaining?: number; max?: number } | undefined;
      toast.error(
        value?.code === "TRIAL_ROW_LIMIT_EXCEEDED"
          ? `Kuota trial tidak cukup — sisa ${value.remaining} dari ${value.max} baris. Kurangi jumlah baris atau upgrade ke paket berbayar.`
          : "Gagal mengirim ulang baris — coba lagi.",
      );
      return;
    }
    load();
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { batch, summary, rows } = detail;
  const isProcessing = batch.status === "processing";
  const numberColumn = findNumberColumn(batch.columnMapping);
  const poNumberColumn = findPoNumberColumn(batch.columnMapping);
  const sortedRows = sortByInvoiceNumber(rows, numberColumn, poNumberColumn);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Hasil Import</h1>
        <p className="text-sm text-muted-foreground">{batch.fileName}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Ringkasan</CardTitle>
              <CardDescription>
                {summary.success} sukses, {summary.failed} gagal, {summary.pending} menunggu (dari {batch.totalRows} baris)
              </CardDescription>
            </div>
            <StatusBadge status={batch.status} />
          </div>
          <ImportProgress status={batch.status} total={batch.totalRows} processed={summary.success + summary.failed} />
        </CardHeader>
        {(summary.failed > 0 || summary.pending > 0) && !isProcessing && batch.columnMapping && (
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "Mengirim ulang..." : "Retry baris gagal"}
            </Button>
            {summary.failed > 0 && (
              <Button variant="outline" onClick={() => setGridOpen((v) => !v)}>
                {gridOpen ? "Tutup Tabel" : "Edit Semua (Tabel)"}
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      {gridOpen && batch.columnMapping && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Semua Baris Gagal</CardTitle>
            <CardDescription>Ubah langsung di tabel, lalu simpan semua sekaligus.</CardDescription>
          </CardHeader>
          <CardContent>
            <EditableGrid
              rows={rows.filter((r) => r.status === "failed")}
              columnMapping={batch.columnMapping}
              requiredInternalFields={REQUIRED_INTERNAL_FIELDS}
              dateInternalFields={DATE_INTERNAL_FIELDS}
              onSave={handleGridSave}
              onSaved={load}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Detail per Baris</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor Transaksi</TableHead>
                <TableHead>Baris</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ID Transaksi Accurate / Error</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">{invoiceNumberOf(row, numberColumn, poNumberColumn) || "-"}</TableCell>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
                  <TableCell>
                    {row.status === "failed" && batch.columnMapping && (
                      <div className="flex justify-end">
                        <EditRowDialog
                          batchId={batch.id}
                          row={row}
                          columnMapping={batch.columnMapping}
                          siblingRowNumbers={siblingRowNumbersOf(row, rows, numberColumn, poNumberColumn)}
                          onSaved={load}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
