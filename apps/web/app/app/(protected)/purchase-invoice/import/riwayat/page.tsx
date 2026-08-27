"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

// § Fase 09, ADR-0013 — halaman arsip SEMUA batch import (dashboard cuma
// tampil 5 terakhir, § app/(protected)/page.tsx). Kolom aksi icon SVG
// (`lucide-react`, § permintaan user 2026-08-28) — scope KECIL, cuma
// tombol di tabel ini, bukan seluruh aplikasi.
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

const CANCELLABLE_STATUS = new Set(["completed", "completed_with_errors"]);

// § ADR-0013 Decision #2 — type-to-confirm: user WAJIB ketik ulang nama
// file batch persis sebelum tombol "Batalkan Import" aktif, karena ini
// destructive ke data akuntansi ASLI client (bukan cuma dialog Ya/Tidak).
function CancelImportDialog({ batch, onCancelled }: { batch: ImportBatch; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const res = await api["purchase-invoice"].import({ batchId: batch.id }).cancel.post();
    setSubmitting(false);
    if (res.error) {
      toast.error("Gagal memulai Batal Import — coba lagi.");
      return;
    }
    toast.success("Batal Import diproses — transaksi terkait akan dihapus/disusutkan dari Accurate.");
    setOpen(false);
    setConfirmText("");
    onCancelled();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText("");
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Batal Import"
        aria-label={`Batal Import untuk ${batch.fileName}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Batal Import: {batch.fileName}</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Ini akan <strong className="text-destructive">menghapus atau menyusutkan permanen</strong> seluruh
            transaksi Faktur Pembelian yang dibuat batch ini langsung di Accurate Online — bukan cuma menyembunyikan
            riwayat di Facport. Tindakan ini <strong>tidak bisa dibatalkan lewat Facport</strong>.
          </p>
          <p className="text-muted-foreground">
            Faktur yang gabungan dengan batch import lain akan disusutkan (item batch lain tetap aman), faktur yang
            tidak bisa dipastikan keamanannya akan dilewati (perlu dihapus manual di Accurate).
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">
              Ketik ulang nama file (<code className="text-destructive">{batch.fileName}</code>) untuk konfirmasi:
            </span>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          <Button
            onClick={handleConfirm}
            disabled={confirmText !== batch.fileName || submitting}
            className="self-end bg-destructive hover:bg-destructive/90"
          >
            {submitting ? "Memproses..." : "Batalkan Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
                          {CANCELLABLE_STATUS.has(batch.status) && (
                            <CancelImportDialog batch={batch} onCancelled={load} />
                          )}
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
