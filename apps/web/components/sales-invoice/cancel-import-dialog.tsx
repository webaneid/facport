"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § Fase 13 — mirror 1:1 `components/purchase-invoice/cancel-import-dialog.tsx`.
type CancellableBatch = { id: string; fileName: string };

export function CancelImportDialog({ batch, onCancelled }: { batch: CancellableBatch; onCancelled?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const res = await api["sales-invoice"].import({ batchId: batch.id }).cancel.post();
    setSubmitting(false);
    if (res.error) {
      toast.error("Gagal memulai Batal Import — coba lagi.");
      return;
    }
    toast.success("Batal Import diproses — transaksi terkait akan dihapus dari Accurate.");
    setOpen(false);
    setConfirmText("");
    if (onCancelled) onCancelled();
    else router.refresh();
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
        <Undo2 className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Batal Import: {batch.fileName}</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Ini akan <strong className="text-destructive">menghapus permanen</strong> seluruh transaksi Faktur
            Penjualan yang dibuat batch ini langsung di Accurate Online — bukan cuma menyembunyikan riwayat di
            Facport. Tindakan ini <strong>tidak bisa dibatalkan lewat Facport</strong>.
          </p>
          <p className="text-muted-foreground">
            Faktur yang gabungan dengan batch import lain (lewat fitur Retry) akan DILEWATI otomatis, bukan
            terhapus — Accurate tidak mendukung hapus sebagian item faktur, jadi faktur itu perlu dihapus manual
            lewat Accurate langsung kalau memang perlu.
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
