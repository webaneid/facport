import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TruncateText } from "@/components/ui/truncate-text";
import { StatusBadge } from "@/lib/status-badges";
import { moduleLabel } from "@/lib/module-options";
import { MODULE_IMPORT_BASE_PATH, MODULE_DISPLAY_LABEL_OVERRIDES } from "@/lib/module-import-routes";
import { CANCELLABLE_BATCH_STATUS, DELETE_BLOCKED_BATCH_STATUS } from "@/lib/import-batch-status";
import { formatDate } from "@/lib/utils";
import { CancelImportDialog as PurchaseInvoiceCancelImportDialog } from "@/components/purchase-invoice/cancel-import-dialog";
import { DeleteImportDialog as PurchaseInvoiceDeleteImportDialog } from "@/components/purchase-invoice/delete-import-dialog";
import { CancelImportDialog as SalesInvoiceCancelImportDialog } from "@/components/sales-invoice/cancel-import-dialog";
import { DeleteImportDialog as SalesInvoiceDeleteImportDialog } from "@/components/sales-invoice/delete-import-dialog";
// § Fase 165 — "Batal Import" generalisasi ke 19 modul "sederhana" (1
// batch = 1 dokumen Accurate, tanpa merge lintas-batch seperti PI/SI di
// atas) lewat SATU dialog generic, bukan 19 file dialog nyaris identik.
import { GenericCancelImportDialog } from "@/components/import-archive/generic-cancel-import-dialog";
import { api } from "@/lib/api-client";
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
import { DeleteImportDialog as SalesOrderDeleteImportDialog } from "@/components/sales-order/delete-import-dialog";
import { DeleteImportDialog as SalesReturnDeleteImportDialog } from "@/components/sales-return/delete-import-dialog";
import { DeleteImportDialog as OtherDepositDeleteImportDialog } from "@/components/other-deposit/delete-import-dialog";
// § Fase 134-135 — Item Transfer & Item Requisition.
import { DeleteImportDialog as ItemTransferDeleteImportDialog } from "@/components/item-transfer/delete-import-dialog";
import { DeleteImportDialog as ItemRequisitionDeleteImportDialog } from "@/components/item-requisition/delete-import-dialog";
// § Fase 138.
import { DeleteImportDialog as InventoryAdjustmentDeleteImportDialog } from "@/components/inventory-adjustment/delete-import-dialog";
import { DeleteImportDialog as JobCostingDeleteImportDialog } from "@/components/job-costing/delete-import-dialog";
import { DeleteImportDialog as RollOverDeleteImportDialog } from "@/components/roll-over/delete-import-dialog";
import { DeleteImportDialog as WorkOrderDeleteImportDialog } from "@/components/work-order/delete-import-dialog";
import { DeleteImportDialog as MaterialSlipDeleteImportDialog } from "@/components/material-slip/delete-import-dialog";
import { DeleteImportDialog as FinishedGoodSlipDeleteImportDialog } from "@/components/finished-good-slip/delete-import-dialog";
// § Fase 157 — Delivery Order, ditemukan KELEWAT (§ checklist modul baru,
// architecture-accurate-integration.md § 3b poin 10) saat audit tabel ini 2026-09-24.
import { DeleteImportDialog as DeliveryOrderDeleteImportDialog } from "@/components/delivery-order/delete-import-dialog";
// § Import Formula/Produksi (Excel, AutoProduksi) — HANYA Delete (lokal),
// TIDAK ADA Cancel: Import Formula tidak pernah menyentuh Accurate sama
// sekali (master data lokal); Cancel untuk Import Produksi sengaja
// ditunda (§ architecture-autoproduksi.md Known Limitations — flow
// manual single-entry juga belum punya Cancel, supaya tidak asimetris).
import { FormulaImportDeleteDialog } from "@/components/autoproduksi/formula-import-delete-dialog";
import { ProductionImportDeleteDialog } from "@/components/autoproduksi/production-import-delete-dialog";

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
// § Fase 165 — Cancel ("Batal Import") sekarang berlaku 21 modul: 2 modul
// kompleks (purchase_invoice/sales_invoice, dialog sendiri — merge
// lintas-batch) + 19 modul sederhana (dialog generic, § `generic-cancel-
// import-dialog.tsx`). `job_costing` (2 dokumen Accurate berurutan) &
// `vendor_payable_account` (sync master data, bukan transaksi) SENGAJA
// belum dapat Cancel — lihat architecture-batal-import-generic.md.
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
// § diminta user 2026-10-02 — tombol "Delete" (hapus RIWAYAT LOKAL
// Facport saja, § `delete-import-dialog.tsx` tiap modul — TIDAK pernah
// menyentuh Accurate, beda total dari "Batal Import"/Undo2 di atas yang
// menghapus transaksi ASLI) DISEMBUNYIKAN SEMENTARA di sini — BUKAN
// dihapus fungsinya. Alasan: dari sisi user ada kerancuan nyata antara
// 2 tombol ini ("kembali"/Undo2 vs "tong sampah"/Trash2) — gampang
// salah pencet padahal efeknya beda jauh (1 cuma hapus histori lokal,
// 1 lagi hapus data akuntansi ASLI client). Karena sudah ada sistem
// hapus OTOMATIS riwayat lokal (retensi 2 hari, § `lib/import-retention.ts`,
// `docs/architecture/architecture-subscription.md` § "Retensi Data
// Import"), tombol manual ini dianggap TIDAK URGENT dipertahankan
// sekarang — client BISA berubah pikiran nanti, makanya endpoint
// `DELETE .../import/:batchId` DAN komponen `DeleteImportDialog` tiap
// modul TETAP ADA APA ADANYA, TIDAK disentuh — cuma di-skip rendernya
// DI SINI. Scope SENGAJA cuma tabel gabungan ini (dipakai "Arsip Import"
// `/import/arsip` DAN kartu ringkas Dashboard `/` — keduanya ikut
// tersembunyi otomatis) — 23 halaman "Riwayat" PER-MODUL (mis.
// `/delivery-order/import/riwayat`) SENGAJA TIDAK disentuh, tombol
// Delete di sana TETAP tampil (keputusan eksplisit, scope lebih kecil
// dulu). Untuk AKTIFKAN LAGI: ganti `false` jadi `true` di bawah ini,
// satu baris, tidak ada perubahan lain yang diperlukan. § dicatat juga
// di memory sesi (`project_...arsip_import_delete_hidden`, kalau ada)
// dan `docs/lessons-learned.md` 2026-10-02 — baca itu dulu kalau mau
// mengaktifkan lagi, ada konteks kenapa ini sempat disembunyikan.
const SHOW_LOCAL_DELETE_BUTTON = false;

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
  const isOwner = isDataUsahaOwner !== false;
  const canDeleteAtAll = SHOW_LOCAL_DELETE_BUTTON && isOwner;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[24%]">File</TableHead>
          <TableHead className="w-[16%]">Fitur</TableHead>
          <TableHead className="w-[16%]">Diupload oleh</TableHead>
          {/* § diminta user 2026-09-24 — `min-w` WAJIB di kolom label panjang (badge status "Dibatalkan
             (sebagian)"/"Menunggu Konfirmasi", tanggal id-ID "24 Sep 2026, 14.35") — tanpa ini, `table-fixed`
             + `whitespace-nowrap` (§ ADR-0034, components/ui/table.tsx) bikin isi kolom MELUBER ke kolom
             sebelah kalau % lebih kecil dari kontennya. `overflow-x-auto` (sudah ada di `Table`) yang
             menampung selisihnya jadi scroll horizontal, bukan tabel yang dideklarasikan lebar tapi rusak. */}
          <TableHead className="w-[10%] min-w-[150px]">Status</TableHead>
          <TableHead className="w-[8%]">Baris</TableHead>
          <TableHead className="w-[12%] min-w-[130px]">Tanggal</TableHead>
          <TableHead className="w-[112px] text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => {
          const basePath = MODULE_IMPORT_BASE_PATH[batch.module];
          const canDelete = canDeleteAtAll && !DELETE_BLOCKED_BATCH_STATUS.has(batch.status);
          // § BUG DITEMUKAN & DIPERBAIKI (2026-10-02, evaluasi user) —
          // "Batal Import" (hapus transaksi ASLI di Accurate) dulu TIDAK
          // dibatasi pemilik Data Usaha sama sekali di sisi server (sudah
          // diperbaiki, § route `/cancel`) — tombolnya di sini JUGA ikut
          // digate `isOwner` (BUKAN `canDeleteAtAll` — itu field terpisah
          // yang JUGA memeriksa `SHOW_LOCAL_DELETE_BUTTON`, flag yang
          // TIDAK relevan untuk Cancel), supaya anggota tim non-pemilik
          // tidak lihat tombol yang ujung-ujungnya cuma gagal 403.
          const canCancel = isOwner && CANCELLABLE_BATCH_STATUS.has(batch.status);
          return (
            <TableRow key={batch.id}>
              <TableCell className="font-medium text-foreground">
                <TruncateText>{batch.fileName}</TruncateText>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <TruncateText>{MODULE_DISPLAY_LABEL_OVERRIDES[batch.module] ?? moduleLabel(batch.module)}</TruncateText>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <TruncateText>{batch.uploadedByYou ? "Anda" : (batch.uploadedByName ?? "-")}</TruncateText>
              </TableCell>
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
                  {batch.module === "sales_receipt" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["sales-receipt"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "purchase_payment" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["purchase-payment"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "journal_voucher" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["journal-voucher"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "other_payment" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["other-payment"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "other_deposit" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["other-deposit"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "purchase_order" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["purchase-order"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "receive_item" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["receive-item"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "purchase_return" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["purchase-return"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "sales_quotation" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["sales-quotation"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "sales_order" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["sales-order"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "sales_return" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["sales-return"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "delivery_order" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["delivery-order"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "item_transfer" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["item-transfer"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "item_requisition" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["item-requisition"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "inventory_adjustment" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["inventory-adjustment"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "roll_over" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["roll-over"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "work_order" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["work-order"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "material_slip" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["material-slip"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
                  )}
                  {batch.module === "finished_good_slip" && canCancel && (
                    <GenericCancelImportDialog batch={batch} onConfirm={() => api["finished-good-slip"].import({ batchId: batch.id }).cancel.post()} onCancelled={onChanged} />
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
                  {canDelete && batch.module === "sales_order" && (
                    <SalesOrderDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "sales_return" && (
                    <SalesReturnDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "item_transfer" && (
                    <ItemTransferDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "item_requisition" && (
                    <ItemRequisitionDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "inventory_adjustment" && (
                    <InventoryAdjustmentDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "job_costing" && (
                    <JobCostingDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "roll_over" && (
                    <RollOverDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "work_order" && (
                    <WorkOrderDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "material_slip" && (
                    <MaterialSlipDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "finished_good_slip" && (
                    <FinishedGoodSlipDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "delivery_order" && (
                    <DeliveryOrderDeleteImportDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "autoproduksi_formula" && (
                    <FormulaImportDeleteDialog batch={batch} onDeleted={onChanged} />
                  )}
                  {canDelete && batch.module === "autoproduksi_production" && (
                    <ProductionImportDeleteDialog batch={batch} onDeleted={onChanged} />
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
