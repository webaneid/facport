"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ComingSoonIconButton } from "@/components/ui/coming-soon-icon-button";
import { api } from "@/lib/api-client";

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

// Kolom Excel yang di-mapping user ke field "billNumber" (Nomor Faktur) —
// columnMapping arahnya excelColumn -> field internal, jadi WAJIB di-invert
// buat cari nama kolom aslinya.
function findBillNumberColumn(columnMapping: Record<string, string> | null): string | null {
  if (!columnMapping) return null;
  const entry = Object.entries(columnMapping).find(([, field]) => field === "billNumber");
  return entry?.[0] ?? null;
}

function invoiceNumberOf(row: Row, billNumberColumn: string | null): string {
  if (!billNumberColumn) return "";
  const value = row.rawData[billNumberColumn];
  return value === undefined || value === null ? "" : String(value).trim();
}

// § permintaan user 2026-08-28 — urut berdasarkan Nomor Faktur (natural
// sort, angka di dalam string diurutkan numerik: "PI2" < "PI10"), BUKAN
// nomor baris Excel seperti sebelumnya. Baris tanpa Nomor Faktur ditaruh
// di akhir, fallback urut nomor baris. Baris dengan Nomor Faktur SAMA
// (grup multi-item, Fase 06) otomatis nempel berurutan lewat sort ini.
function sortByInvoiceNumber(rows: Row[], billNumberColumn: string | null): Row[] {
  return [...rows].sort((a, b) => {
    const invA = invoiceNumberOf(a, billNumberColumn);
    const invB = invoiceNumberOf(b, billNumberColumn);
    if (!invA && !invB) return a.rowNumber - b.rowNumber;
    if (!invA) return 1;
    if (!invB) return -1;
    const cmp = invA.localeCompare(invB, undefined, { numeric: true, sensitivity: "base" });
    return cmp !== 0 ? cmp : a.rowNumber - b.rowNumber;
  });
}

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "default" }> = {
  success: { label: "Sukses", variant: "success" },
  failed: { label: "Gagal", variant: "destructive" },
  pending: { label: "Menunggu", variant: "warning" },
  processing: { label: "Memproses", variant: "warning" },
  completed: { label: "Selesai", variant: "success" },
  completed_with_errors: { label: "Selesai (ada gagal)", variant: "warning" },
  mapping_pending: { label: "Menunggu Konfirmasi", variant: "default" },
  // § Fase 09, ADR-0013 — Batal Import
  cancelling: { label: "Membatalkan...", variant: "warning" },
  cancelled: { label: "Dibatalkan", variant: "default" },
  cancelled_partial: { label: "Dibatalkan (sebagian)", variant: "warning" },
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
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { batch, summary, rows } = detail;
  const isProcessing = batch.status === "processing";
  const billNumberColumn = findBillNumberColumn(batch.columnMapping);
  const sortedRows = sortByInvoiceNumber(rows, billNumberColumn);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
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
                <TableHead>Nomor Faktur</TableHead>
                <TableHead>Baris</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ID Transaksi Accurate / Error</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">
                    {invoiceNumberOf(row, billNumberColumn) || "-"}
                  </TableCell>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.accurateTransactionId ?? row.errorMessage ?? "-"}
                  </TableCell>
                  <TableCell>
                    {/* § dibahas 2026-08-28 — Edit baris gagal, belum dibangun */}
                    {row.status === "failed" && (
                      <div className="flex justify-end">
                        <ComingSoonIconButton icon={Pencil} label="Edit" />
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
