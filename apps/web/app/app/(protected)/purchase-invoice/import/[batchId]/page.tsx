"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

type Row = {
  id: string;
  rowNumber: number;
  status: string;
  accurateTransactionId: string | null;
  errorMessage: string | null;
};

type BatchDetail = {
  batch: { id: string; status: string; totalRows: number; fileName: string };
  summary: { pending: number; success: number; failed: number };
  rows: Row[];
};

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "default" }> = {
  success: { label: "Sukses", variant: "success" },
  failed: { label: "Gagal", variant: "destructive" },
  pending: { label: "Menunggu", variant: "warning" },
  processing: { label: "Memproses", variant: "warning" },
  completed: { label: "Selesai", variant: "success" },
  completed_with_errors: { label: "Selesai (ada gagal)", variant: "warning" },
  mapping_pending: { label: "Menunggu Konfirmasi", variant: "default" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function PurchaseInvoiceImportResultPage() {
  const params = useParams<{ batchId: string }>();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [retrying, setRetrying] = useState(false);

  async function load() {
    const res = await api["purchase-invoice"].import({ batchId: params.batchId }).get();
    if (res.data) setDetail(res.data as unknown as BatchDetail);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.batchId]);

  async function handleRetry() {
    setRetrying(true);
    await api["purchase-invoice"].import({ batchId: params.batchId }).retry.post();
    setRetrying(false);
    load();
  }

  if (!detail) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { batch, summary, rows } = detail;
  const isProcessing = batch.status === "processing";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
                {summary.success} sukses, {summary.failed} gagal, {summary.pending} menunggu (dari {batch.totalRows}{" "}
                baris)
              </CardDescription>
            </div>
            <StatusBadge status={batch.status} />
          </div>
        </CardHeader>
        {summary.failed > 0 && !isProcessing && (
          <CardContent>
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "Mengirim ulang..." : "Retry baris gagal"}
            </Button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detail per Baris</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Baris</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ID Transaksi Accurate / Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .sort((a, b) => a.rowNumber - b.rowNumber)
                .map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.accurateTransactionId ?? row.errorMessage ?? "-"}
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
