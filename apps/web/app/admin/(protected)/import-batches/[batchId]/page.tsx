"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

// § diminta user 2026-09-05 — versi ADMIN dari halaman "Hasil Import"
// customer (`purchase-invoice`/`sales-invoice`/`vendor/payable-account`/
// `purchase-payment`/`sales-receipt`/`journal-voucher`
// `import/[batchId]/page.tsx`) — SENGAJA replikasi PERSIS tampilan tiap
// modul (bukan 1 tampilan generik), TAPI READ-ONLY TOTAL: TIDAK ADA
// tombol Retry/Edit Baris — itu tetap aksi self-service milik user
// sendiri, admin di sini cuma boleh LIHAT (buat diagnosa saat telepon
// support). 1 ROUTE untuk semua modul (bukan 6 dynamic route terpisah)
// — cukup baca `batch.module` dari response buat pilih tampilan mana
// yang dirender, endpoint backend-nya sendiri sudah generik (§
// `admin/import-batches.route.ts`).
// § 2026-09-06 — audit menemukan 3 modul baru (Purchase Payment/Sales
// Receipt/Journal Voucher, Fase 33-35) TIDAK PERNAH dapat cabang render
// di sini (dibangun setelah Fase 30 ini selesai, tidak pernah
// di-backfill) — admin yang buka detail batch modul itu cuma lihat
// header kosong TANPA tabel per-baris sama sekali. Ditambahkan sekarang,
// mirror persis pola `VendorPayableAccountView` (rowNumber/status/id
// atau error, tanpa grouping kolom).
type Row = {
  id: string;
  rowNumber: number;
  status: string;
  accurateTransactionId: string | null;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

type BatchDetail = {
  batch: { id: string; module: string; status: string; totalRows: number; fileName: string; columnMapping: Record<string, string> | null };
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
  cancelling: { label: "Membatalkan...", variant: "warning" },
  cancelled: { label: "Dibatalkan", variant: "default" },
  cancelled_partial: { label: "Dibatalkan (sebagian)", variant: "warning" },
};

function RowStatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

// § pola sama persis `purchase-invoice/import/[batchId]/page.tsx` §
// `findBillNumberColumn`/`invoiceNumberOf`/`sortByInvoiceNumber` —
// TIDAK diekstrak jadi util shared FRONTEND supaya halaman customer
// TIDAK ikut ter-impact kalau versi admin ini berubah nanti (2 lifecycle
// beda: customer page dites & dipakai user asli tiap hari, admin page
// ini cuma dibuka pas ada telepon support).
function findColumn(columnMapping: Record<string, string> | null, field: string): string | null {
  if (!columnMapping) return null;
  const entry = Object.entries(columnMapping).find(([, f]) => f === field);
  return entry?.[0] ?? null;
}

function valueOf(row: Row, column: string | null): string {
  if (!column) return "";
  const value = row.rawData[column];
  return value === undefined || value === null ? "" : String(value).trim();
}

function sortByValue(rows: Row[], column: string | null): Row[] {
  return [...rows].sort((a, b) => {
    const vA = valueOf(a, column);
    const vB = valueOf(b, column);
    if (!vA && !vB) return a.rowNumber - b.rowNumber;
    if (!vA) return 1;
    if (!vB) return -1;
    const cmp = vA.localeCompare(vB, undefined, { numeric: true, sensitivity: "base" });
    return cmp !== 0 ? cmp : a.rowNumber - b.rowNumber;
  });
}

// § mirror `purchase-invoice/import/[batchId]/page.tsx` — kolom "Nomor
// Faktur" (field `billNumber`), TANPA kolom Aksi (read-only).
function PurchaseInvoiceView({ batch, rows }: { batch: BatchDetail["batch"]; rows: Row[] }) {
  const billNumberColumn = findColumn(batch.columnMapping, "billNumber");
  const sortedRows = sortByValue(rows, billNumberColumn);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nomor Faktur</TableHead>
          <TableHead>Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>ID Transaksi Accurate / Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium text-foreground">{valueOf(row, billNumberColumn) || "-"}</TableCell>
            <TableCell>{row.rowNumber}</TableCell>
            <TableCell>
              <RowStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// § mirror `sales-invoice/import/[batchId]/page.tsx` — kolom "Nomor
// Faktur" (field `poNumber`, PO Number ganti peran Bill No, § Fase 13).
function SalesInvoiceView({ batch, rows }: { batch: BatchDetail["batch"]; rows: Row[] }) {
  const poNumberColumn = findColumn(batch.columnMapping, "poNumber");
  const sortedRows = sortByValue(rows, poNumberColumn);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nomor Faktur</TableHead>
          <TableHead>Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>ID Transaksi Accurate / Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium text-foreground">{valueOf(row, poNumberColumn) || "-"}</TableCell>
            <TableCell>{row.rowNumber}</TableCell>
            <TableCell>
              <RowStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// § mirror `vendor/payable-account/import/[batchId]/page.tsx` — TANPA
// ekstraksi kolom (tidak ada grouping per Nomor Faktur di modul ini).
function VendorPayableAccountView({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>ID Vendor Accurate / Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...rows]
          .sort((a, b) => a.rowNumber - b.rowNumber)
          .map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.rowNumber}</TableCell>
              <TableCell>
                <RowStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

// § mirror `purchase-payment/import/[batchId]/page.tsx` — TANPA
// ekstraksi kolom, sama seperti VendorPayableAccountView (tidak ada
// grouping per Nomor Faktur di modul ini, § architecture-purchase-payment.md).
function PurchasePaymentView({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>ID Pembayaran Accurate / Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...rows]
          .sort((a, b) => a.rowNumber - b.rowNumber)
          .map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.rowNumber}</TableCell>
              <TableCell>
                <RowStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

// § diminta user 2026-09-10 — tambah kolom "Nomor Bukti" (field
// `receiptNumber`, § Fase 49 — kunci grouping 1 struk bisa bayar banyak
// faktur) SEBELUM "Baris", mirror persis pola `SalesInvoiceView`/
// `PurchaseInvoiceView` di atas (nomor dokumen dulu, biar baris yang
// sama-sama 1 struk kelihatan mengelompok saat di-sort).
function SalesReceiptView({ batch, rows }: { batch: BatchDetail["batch"]; rows: Row[] }) {
  const receiptNumberColumn = findColumn(batch.columnMapping, "receiptNumber");
  const sortedRows = sortByValue(rows, receiptNumberColumn);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nomor Bukti</TableHead>
          <TableHead>Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>ID Penerimaan Accurate / Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium text-foreground">{valueOf(row, receiptNumberColumn) || "-"}</TableCell>
            <TableCell>{row.rowNumber}</TableCell>
            <TableCell>
              <RowStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// § mirror `journal-voucher/import/[batchId]/page.tsx`.
function JournalVoucherView({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>ID Jurnal Accurate / Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...rows]
          .sort((a, b) => a.rowNumber - b.rowNumber)
          .map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.rowNumber}</TableCell>
              <TableCell>
                <RowStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{row.accurateTransactionId ?? row.errorMessage ?? "-"}</TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

const MODULE_TITLE: Record<string, string> = {
  purchase_invoice: "Hasil Import Faktur Pembelian",
  sales_invoice: "Hasil Import Faktur Penjualan",
  vendor_payable_account: "Hasil Import Akun Hutang Pemasok",
  purchase_payment: "Hasil Import Purchase Payment",
  sales_receipt: "Hasil Import Sales Receipt",
  journal_voucher: "Hasil Import Jurnal Umum",
};

export default function AdminImportBatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await api.admin["import-batches"]({ batchId: params.batchId }).get();
      if (res.data) setDetail(res.data as unknown as BatchDetail);
      else if (res.error) setNotFound(true);
    }
    // § TANPA polling (beda dari versi customer) — read-only, tidak ada
    // proses berjalan yang perlu dipantau admin real-time.
    load();
  }, [params.batchId]);

  if (notFound) {
    return <p className="text-muted-foreground">Batch tidak ditemukan.</p>;
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{MODULE_TITLE[batch.module] ?? "Hasil Import"}</h1>
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
            <RowStatusBadge status={batch.status} />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detail per Baris</CardTitle>
          <CardDescription>Read-only — buat diagnosa, bukan aksi. Retry/edit baris tetap dilakukan user sendiri di app.</CardDescription>
        </CardHeader>
        <CardContent>
          {batch.module === "purchase_invoice" && <PurchaseInvoiceView batch={batch} rows={rows} />}
          {batch.module === "sales_invoice" && <SalesInvoiceView batch={batch} rows={rows} />}
          {batch.module === "vendor_payable_account" && <VendorPayableAccountView rows={rows} />}
          {batch.module === "purchase_payment" && <PurchasePaymentView rows={rows} />}
          {batch.module === "sales_receipt" && <SalesReceiptView batch={batch} rows={rows} />}
          {batch.module === "journal_voucher" && <JournalVoucherView rows={rows} />}
        </CardContent>
      </Card>
    </div>
  );
}
