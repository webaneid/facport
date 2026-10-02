"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { moduleLabel } from "@/lib/module-options";

// § Fase 165 — "Batal Import" GENERIC untuk 19 modul yang TIDAK pernah
// merge lintas-batch (beda dari Purchase Invoice/Sales Invoice yang
// punya dialog sendiri, § `components/purchase-invoice/cancel-import-
// dialog.tsx` — keduanya perlu narasi khusus "faktur gabungan dilewati
// otomatis" yang tidak relevan untuk 19 modul ini). SATU komponen,
// dipakai lewat prop `onConfirm` (call Eden Treaty milik tiap modul,
// ditulis di titik pakai supaya type-safety end-to-end tetap utuh —
// bukan index string ke `api` yang butuh `as any`).
// § diminta user 2026-10-02 — WAJIB warning keras yang EKSPLISIT
// menyebut 2 efek: data di Accurate (hapus permanen) DAN di Facport
// (status baris berubah, tidak terhitung sukses lagi).
type CancellableBatch = { id: string; fileName: string; module: string };

export function GenericCancelImportDialog({
  batch,
  onConfirm,
  onCancelled,
}: {
  batch: CancellableBatch;
  onConfirm: () => Promise<{ error?: { value?: unknown } | null }>;
  onCancelled?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const res = await onConfirm();
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string } | undefined;
      toast.error(
        value?.code === "CANCEL_OWNER_ONLY"
          ? "Cuma pemilik Data Usaha yang boleh Batal Import — aksi ini menghapus transaksi asli di Accurate."
          : value?.code === "ACCURATE_SCOPE_MISSING"
            ? "Koneksi Accurate belum mengizinkan Batal Import untuk modul ini — sambungkan ulang Accurate dulu lewat gerbang koneksi Data Usaha."
            : "Gagal memulai Batal Import — coba lagi.",
      );
      return;
    }
    toast.success("Batal Import diproses — transaksi terkait akan dihapus dari Accurate.");
    setOpen(false);
    setConfirmText("");
    if (onCancelled) onCancelled();
    else router.refresh();
  }

  const label = moduleLabel(batch.module);

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
          <p className="font-medium text-destructive">Peringatan — tindakan ini permanen dan tidak bisa dibatalkan.</p>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              Transaksi {label} yang dibuat batch ini akan <strong className="text-destructive">dihapus permanen langsung di Accurate Online</strong> (lewat API) — bukan cuma disembunyikan.
            </li>
            <li>
              Baris batch ini di <strong className="text-destructive">Facport</strong> akan ditandai &ldquo;Dibatalkan&rdquo; — tidak lagi dihitung sebagai baris sukses.
            </li>
          </ul>
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
