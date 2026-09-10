"use client";

import { useState } from "react";
import { Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

// § Fase 92 (2026-09-10) — konfirmasi SEDERHANA (BUKAN pola "ketik ulang
// nama" seperti `cancel-import-dialog.tsx`) — disengaja: risikonya lebih
// rendah & gampang dipulihkan (customer tinggal "Hubungkan Ulang", § Fase
// 91), beda dari Batal Import yang menghapus data permanen di Accurate.
type DisconnectableSubscription = { subscriptionId: string; planName: string; accurateDbAlias: string | null };

export function DisconnectAccurateDialog({
  subscription,
  onDisconnected,
}: {
  subscription: DisconnectableSubscription;
  onDisconnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const res = await api.admin.subscriptions({ id: subscription.subscriptionId })["disconnect-accurate"].post();
    setSubmitting(false);
    if (res.error) {
      toast.error("Gagal memutuskan koneksi — coba lagi.");
      return;
    }
    toast.success(`Koneksi Accurate untuk "${subscription.planName}" diputuskan — user akan diberi tahu untuk menghubungkan ulang.`);
    setOpen(false);
    onDisconnected();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Putuskan Koneksi"
        aria-label={`Putuskan koneksi Accurate untuk ${subscription.planName}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
      >
        <Unlink className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Putuskan Koneksi Accurate</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Ini akan memutuskan koneksi Accurate untuk fitur <strong className="text-foreground">{subscription.planName}</strong>
            {subscription.accurateDbAlias && (
              <>
                {" "}
                (Data Usaha: <strong className="text-foreground">{subscription.accurateDbAlias}</strong>)
              </>
            )}
            . User tidak akan bisa import lagi sampai menghubungkan ulang sendiri dari halaman koneksi mereka.
          </p>
          <p className="text-muted-foreground">User akan diberi notifikasi otomatis supaya tahu harus menghubungkan ulang.</p>
          <Button onClick={handleConfirm} disabled={submitting} className="self-end bg-destructive hover:bg-destructive/90">
            {submitting ? "Memproses..." : "Putuskan Koneksi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
