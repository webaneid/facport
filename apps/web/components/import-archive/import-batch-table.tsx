import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/lib/status-badges";
import { moduleLabel } from "@/lib/module-options";
import { MODULE_IMPORT_BASE_PATH } from "@/lib/module-import-routes";
import { CANCELLABLE_BATCH_STATUS, DELETE_BLOCKED_BATCH_STATUS } from "@/lib/import-batch-status";
import { formatDate } from "@/lib/utils";
import { CancelImportDialog as PurchaseInvoiceCancelImportDialog } from "@/components/purchase-invoice/cancel-import-dialog";
import { DeleteImportDialog as PurchaseInvoiceDeleteImportDialog } from "@/components/purchase-invoice/delete-import-dialog";
import { CancelImportDialog as SalesInvoiceCancelImportDialog } from "@/components/sales-invoice/cancel-import-dialog";
import { DeleteImportDialog as SalesInvoiceDeleteImportDialog } from "@/components/sales-invoice/delete-import-dialog";
import { DeleteImportDialog as VendorPayableAccountDeleteImportDialog } from "@/components/vendor-payable-account/delete-import-dialog";
import { DeleteImportDialog as PurchasePaymentDeleteImportDialog } from "@/components/purchase-payment/delete-import-dialog";
import { DeleteImportDialog as SalesReceiptDeleteImportDialog } from "@/components/sales-receipt/delete-import-dialog";
import { DeleteImportDialog as JournalVoucherDeleteImportDialog } from "@/components/journal-voucher/delete-import-dialog";
import { DeleteImportDialog as OtherPaymentDeleteImportDialog } from "@/components/other-payment/delete-import-dialog";
// § Fase 128 — ditemukan sekalian: 5 modul Fase 120-124 TIDAK PERNAH
// ditambahkan ke dispatch tabel gabungan ini (checklist di komentar
// bawah kelewat) — "Arsip Import" jadi tidak punya tombol Delete utk
// batch modul itu (beda dari 12 halaman Riwayat PER-MODUL yang sudah
// benar sejak Fase 126). Diperbaiki sekalian di sini.
import { DeleteImportDialog as PurchaseOrderDeleteImportDialog } from "@/components/purchase-order/delete-import-dialog";
import { DeleteImportDialog as ReceiveItemDeleteImportDialog } from "@/components/receive-item/delete-import-dialog";
import { DeleteImportDialog as PurchaseReturnDeleteImportDialog } from "@/components/purchase-return/delete-import-dialog";
import { DeleteImportDialog as SalesQuotationDeleteImportDialog } from "@/components/sales-quotation/delete-import-dialog";
import { DeleteImportDialog as SalesReturnDeleteImportDialog } from "@/components/sales-return/delete-import-dialog";
import { DeleteImportDialog as OtherDepositDeleteImportDialog } from "@/components/other-deposit/delete-import-dialog";

export type UnifiedImportBatch = {
  id: string;
  module: string;
  fileName: string;
  status: string;
  totalRows: number;
  createdAt: string;
  // § Fase 125 poin 3 (2026-09-15) — endpoint `/me/import-batches` SEKARANG
  // gabungan SEMUA uploader di Data Usaha ini (bukan cuma milik sendiri
  // lagi), jadi tabel ini perlu tahu SIAPA yang upload tiap baris.
  uploadedByName?: string;
  uploadedByYou?: boolean;
};

// § diminta user 2026-09-06 — tabel "Import Terakhir"/"Arsip Import"
// GABUNGAN lintas 6 modul, dipakai dashboard (card, limit kecil, Server
// Component) DAN halaman arsip penuh (paginated, Client Component) —
// SATU tempat untuk dispatch Detail/Cancel/Delete per baris berdasarkan
// `batch.module`, supaya kalau ada modul baru nanti, cukup update di SINI
// (+ `lib/module-import-routes.ts`), bukan di 2 tempat terpisah lagi
// (§ lessons-learned.md 2026-09-06 — pelajaran dari bug admin batch-view
// yang lupa di-backfill pas modul baru ditambah).
// Cancel HANYA untuk purchase_invoice/sales_invoice (satu-satunya 2 modul
// yang punya fitur itu, § architecture masing-masing modul).
// § Fase 43 (audit timezone 2026-09-06) — komponen ini dipakai dari
// Server Component (`app/(protected)/page.tsx`) MAUPUN Client Component
// (`import/arsip/page.tsx`) — `timezone` WAJIB dikirim sebagai prop
// (bukan `useCompanyTimezone()`, hook itu tidak bisa dipanggil dari
// Server Component pemanggil pertama).
// § Fase 125 poin 3 (2026-09-15) — `isDataUsahaOwner` BARU: data di tabel
// ini sekarang gabungan SEMUA anggota tim (bukan cuma upload sendiri
// lagi, § `/me/import-batches`), tapi hapus tetap HANYA boleh pemilik
// Data Usaha (backend `DELETE_OWNER_ONLY`, § phase-125). `undefined` =
// anggap owner (kompatibilitas pemanggil lama yang belum kirim prop ini)
// — kedua pemanggil SEKARANG selalu kirim eksplisit, lihat masing-masing.
export function ImportBatchTable({
  batches,
  onChanged,
  timezone,
  isDataUsahaOwner,
}: {
  batches: UnifiedImportBatch[];
  onChanged?: () => void;
  timezone: string;
  isDataUsahaOwner?: boolean;
}) {
  const canDeleteAtAll = isDataUsahaOwner !== false;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Fitur</TableHead>
          <TableHead>Diupload oleh</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Baris</TableHead>
          <TableHead>Tanggal</TableHead>
          <TableHead className="text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => {
          const basePath = MODULE_IMPORT_BASE_PATH[batch.module];
          const canDelete = canDeleteAtAll && !DELETE_BLOCKED_BATCH_STATUS.has(batch.status);
          const canCancel = CANCELLABLE_BATCH_STATUS.has(batch.status);
          return (
            <TableRow key={batch.id}>
              <TableCell className="font-medium text-foreground">{batch.fileName}</TableCell>
              <TableCell className="text-muted-foreground">{moduleLabel(batch.module)}</TableCell>
              <TableCell className="text-muted-foreground">{batch.uploadedByYou ? "Anda" : (batch.uploadedByName ?? "-")}</TableCell>
              <TableCell>
                <StatusBadge domain="import-batch" status={batch.status} />
              </TableCell>
              <TableCell>{batch.totalRows}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(batch.createdAt, timezone)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {basePath && (
                    <Link
                      href={`${basePath}/${batch.id}`}
                      title="Detail"
                      aria-label={`Detail untuk ${batch.fileName}`}
                      className={buttonVariants("ghost", "h-8 w-8 p-0")}
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  )}
                  {batch.module === "purchase_invoice" && canCancel && (
                    <PurchaseInvoiceCancelImportDialog batch={batch} onCancelled={onChanged} />
                  )}
                  {batch.module === "sales_invoice" && canCancel && (
                    <SalesInvoiceCancelImportDialog batch={batch} onCancelled={onChanged} />
                  )}
                  {canDelete && batch.module === "purchase_invoice" && (
                    <PurchaseInvoiceDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "sales_invoice" && (
                    <SalesInvoiceDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "vendor_payable_account" && (
                    <VendorPayableAccountDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "purchase_payment" && (
                    <PurchasePaymentDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "sales_receipt" && (
                    <SalesReceiptDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "journal_voucher" && (
                    <JournalVoucherDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "other_payment" && (
                    <OtherPaymentDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "other_deposit" && (
                    <OtherDepositDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "purchase_order" && (
                    <PurchaseOrderDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "receive_item" && (
                    <ReceiveItemDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "purchase_return" && (
                    <PurchaseReturnDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "sales_quotation" && (
                    <SalesQuotationDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "sales_return" && (
                    <SalesReturnDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
