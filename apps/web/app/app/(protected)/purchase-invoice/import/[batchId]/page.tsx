"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TruncateText } from "@/components/ui/truncate-text";
import { Skeleton } from "@/components/ui/skeleton";
import { EditRowDialog, DATE_INTERNAL_FIELDS, REQUIRED_INTERNAL_FIELDS } from "@/components/purchase-invoice/edit-row-dialog";
import { EditableGrid } from "@/components/import/editable-grid";
import { ImportProgress } from "@/components/import/import-progress";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { describeImportActionError, type ImportActionErrorValue } from "@/lib/import-error-message";
import { getProdApiOrigin } from "@/lib/get-prod-api-origin";
import { findNumberColumn, findBillNumberColumn, invoiceNumberOf, siblingRowNumbersOf, sortByInvoiceNumber } from "@/lib/purchase-invoice-batch-helpers";
import { ImportErrorSummary } from "@/components/import/import-error-summary";
import { CancelImportDialog } from "@/components/purchase-invoice/cancel-import-dialog";
import { CANCELLABLE_BATCH_STATUS } from "@/lib/import-batch-status";
import { useIsDataUsahaOwner } from "@/lib/use-data-usaha-owner";

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
  // hasil Batal Import terakhir (cuma ada untuk batch `cancelled_partial`); `failedReasons` kosong di batch lama.
  cancelResult: { deleted: string[]; blocked: string[]; failed: string[]; failedReasons?: Record<string, string> } | null;
};

// § Fase 81 (2026-09-09) — logic penentuan "Nomor Transaksi" (Trans No
// diutamakan, fallback Bill No — feedback client: Bill No boleh sama
// walau beda transaksi, Trans No harus unik) diekstrak ke
// `lib/purchase-invoice-batch-helpers.ts` (dites terpisah di sana, tanpa
// import modul page.tsx ini — hindari konflik `mock.module("next/navigation")`
// dari test file lain), mirror Sales Invoice Fase 63.

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

function describeUndeletedReason(invoiceId: string, result: BatchDetail["cancelResult"]): string {
  if (result?.blocked.includes(invoiceId)) {
    return "Faktur ini juga dipakai batch import lain, jadi tidak dihapus otomatis. Hapus manual di Accurate bila perlu.";
  }
  const accurateMessage = result?.failedReasons?.[invoiceId];
  if (accurateMessage) return `Accurate menolak menghapus: ${accurateMessage}`;
  if (result?.failed.includes(invoiceId)) return "Accurate menolak menghapus (alasan tidak tercatat — kemungkinan sudah dibayar atau dipakai dokumen lain).";
  return "Belum terhapus.";
}

export default function PurchaseInvoiceImportResultPage() {
  const params = useParams<{ batchId: string }>();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const isOwner = useIsDataUsahaOwner();

  async function load() {
    const res = await api["purchase-invoice"].import({ batchId: params.batchId }).get();
    if (res.data) setDetail(res.data as unknown as BatchDetail);
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
    const res = await api["purchase-invoice"].import({ batchId: params.batchId }).retry.post();
    setRetrying(false);
    if (res.error) {
      const value = res.error.value as ImportActionErrorValue | undefined;
      toast.error(describeImportActionError(value, "Gagal mengirim ulang baris — coba lagi."));
      return;
    }
    load();
  }

  // § Fase 51 — bulk save (grid ala Excel), mirror pola `EditRowDialog`
  // tapi untuk banyak baris sekaligus. TIDAK auto-retry (konsisten
  // dengan edit per-baris — user klik "Retry baris gagal" terpisah).
  async function handleGridSave(rowsToSave: { id: string; rawData: Record<string, string> }[]) {
    const res = await api["purchase-invoice"].import({ batchId: params.batchId }).rows.put({ rows: rowsToSave });
    if (res.error) return null;
    return res.data as { updated: string[]; errors: { rowId: string; rowNumber: number; fields: string[] }[] };
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
  // § audit-temuan-2026-09-27 Batch 5.2 — sebelumnya cuma cek "processing",
  // tombol Retry tetap tampil saat batch "cancelling" (job Batal Import
  // lagi jalan) — race window kecil sebelum backend juga ditutup (409
  // BATCH_BUSY, lihat purchase-invoice-import.route.ts).
  const isBusy = batch.status === "processing" || batch.status === "cancelling";
  const numberColumn = findNumberColumn(batch.columnMapping);
  const billNumberColumn = findBillNumberColumn(batch.columnMapping);
  const sortedRows = sortByInvoiceNumber(rows, numberColumn, billNumberColumn);

  // § Batal Import sebagian — faktur yang MASIH ada di Accurate = baris yang tetap `success` (baris
  // yang terhapus sudah `cancelled`). Dikelompokkan per faktur, alasannya dari hasil pembatalan terakhir.
  const undeletedInvoices =
    batch.status === "cancelled_partial"
      ? [
          ...rows
            .filter((r) => r.status === "success" && r.accurateTransactionId)
            .reduce((acc, r) => {
              const id = r.accurateTransactionId as string;
              const entry = acc.get(id) ?? { id, number: invoiceNumberOf(r, numberColumn, billNumberColumn), rowCount: 0 };
              entry.rowCount += 1;
              acc.set(id, entry);
              return acc;
            }, new Map<string, { id: string; number: string; rowCount: number }>())
            .values(),
        ].map((inv) => ({
          ...inv,
          reason: describeUndeletedReason(inv.id, detail.cancelResult),
        }))
      : [];

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
                {summary.success} sukses, {summary.failed} gagal, {summary.pending} menunggu (dari {batch.totalRows}{" "}
                baris)
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {/* Batal Import menghapus transaksi ASLI di Accurate — cuma pemilik Data Usaha (sama seperti tabel riwayat). */}
              {isOwner && CANCELLABLE_BATCH_STATUS.has(batch.status) && (
                <CancelImportDialog batch={{ id: batch.id, fileName: batch.fileName }} onCancelled={load} trigger="button" />
              )}
              <StatusBadge status={batch.status} />
            </div>
          </div>
          {batch.status === "cancelled_partial" && (
            <p className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-foreground">
              Sebagian faktur belum terhapus dari Accurate — biasanya karena sudah dibayar atau dipakai dokumen lain.
              Batalkan dokumen turunannya dulu (mis. Purchase Payment), lalu klik <strong>Batal Import</strong> lagi.
            </p>
          )}
          <ImportProgress status={batch.status} total={batch.totalRows} processed={summary.success + summary.failed} />
        </CardHeader>
        {(summary.failed > 0 || summary.pending > 0) && !isBusy && batch.columnMapping && (
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "Mengirim ulang..." : "Retry baris gagal"}
            </Button>
            {summary.failed > 0 && (
              <Button variant="outline" onClick={() => setGridOpen((v) => !v)}>
                {gridOpen ? "Tutup Tabel" : "Edit Semua (Tabel)"}
              </Button>
            )}
            {summary.failed > 0 && (
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/purchase-invoice/import/${batch.id}/failed-rows/export`}
                className={buttonVariants("outline")}
              >
                Download Baris Gagal (Excel)
              </a>
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

      {undeletedInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Faktur yang belum terhapus ({undeletedInvoices.length})</CardTitle>
            <CardDescription>
              Faktur ini masih ada di Accurate. Bereskan penyebabnya (mis. batalkan Purchase Payment-nya), lalu klik Batal
              Import lagi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Nomor Transaksi</TableHead>
                  <TableHead className="w-20">Baris</TableHead>
                  <TableHead>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {undeletedInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.number || `ID Accurate ${inv.id}`}</TableCell>
                    <TableCell>{inv.rowCount}</TableCell>
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">{inv.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ImportErrorSummary rows={rows} />

      <Card>
        <CardHeader>
          <CardTitle>Detail per Baris</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Nomor Transaksi</TableHead>
                <TableHead className="w-20">Baris</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>ID Transaksi Accurate / Error</TableHead>
                <TableHead className="w-16 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">
                    {invoiceNumberOf(row, numberColumn, billNumberColumn) || "-"}
                  </TableCell>
                  <TableCell>{row.rowNumber}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <TruncateText>{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TruncateText>
                  </TableCell>
                  <TableCell>
                    {row.status === "failed" && batch.columnMapping && (
                      <div className="flex justify-end">
                        <EditRowDialog
                          batchId={batch.id}
                          row={row}
                          columnMapping={batch.columnMapping}
                          siblingRowNumbers={siblingRowNumbersOf(row, rows, numberColumn, billNumberColumn)}
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
