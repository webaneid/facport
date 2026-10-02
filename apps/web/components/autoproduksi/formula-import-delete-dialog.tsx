"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

// § mirror `components/purchase-order/delete-import-dialog.tsx` — hapus
// riwayat batch LOKAL saja. Formula yang SUDAH dibuat batch ini TETAP ADA
// (sama filosofi modul lain: Delete tidak pernah mundurkan efek yang
// sudah terjadi, § architecture-autoproduksi.md).
type DeletableBatch = { id: string; fileName: string; status: string };

export function FormulaImportDeleteDialog({ batch, onDeleted }: { batch: DeletableBatch; onDeleted?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    const res = await api.autoproduksi["import-formula"]({ batchId: batch.id }).delete();
    setSubmitting(false);
    if (res.error) {
      toast.error("Gagal menghapus — coba lagi.");
      return;
    }
    toast.success(`"${batch.fileName}" dihapus dari Facport.`);
    setOpen(false);
    if (onDeleted) onDeleted();
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Delete"
        aria-label={`Delete untuk ${batch.fileName}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Hapus: {batch.fileName}</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Ini menghapus riwayat import ini dari Facport (file & data baris) secara permanen. Formula yang sudah
            berhasil dibuat batch ini <strong>TETAP ADA</strong> di List Formula — hapus Formula itu sendiri lewat
            halaman List Formula kalau memang perlu.
          </p>
          <p className="text-muted-foreground">Tindakan ini tidak bisa dibatalkan.</p>
          <Button onClick={handleDelete} disabled={submitting} className="self-end bg-destructive hover:bg-destructive/90">
            {submitting ? "Menghapus..." : "Ya, Hapus"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
