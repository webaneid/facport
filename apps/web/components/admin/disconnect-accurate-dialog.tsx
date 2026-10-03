"use client";

import { useState } from "react";
import { Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

// § Fase 92 (2026-09-10) — konfirmasi SEDERHANA (BUKAN pola "ketik ulang
// nama" seperti `cancel-import-dialog.tsx`) — disengaja: risikonya lebih
// rendah & gampang dipulihkan (customer tinggal "Hubungkan Ulang", § Fase
// 91), beda dari Batal Import yang menghapus data permanen di Accurate.
// § Fase 144 (ADR-0037) — koneksi dipegang DATA USAHA: tombol ini SATU per Data Usaha (bukan per fitur/subscription) dan memutus
// semua fitur di dalamnya (salinan di bawah harus jujur soal ini).
// § DIUBAH 2026-10-03 (diminta client) — putus sekarang BERSIH: pilihan database Accurate ikut dihapus (user wajib memilih
// database lagi), dan opsional "hapus akun Accurate" (token dibuang, user wajib login/OAuth dari nol — untuk kasus salah
// email/akun Accurate) yang juga memutus Data Usaha lain milik user yang memakai akun yang sama.
type DisconnectableDataUsaha = { id: string; name: string; accurateDbAlias: string | null; accountEmail?: string | null; accountDataUsahaCount?: number };

export function DisconnectAccurateDialog({
  dataUsaha,
  onDisconnected,
}: {
  dataUsaha: DisconnectableDataUsaha;
  onDisconnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removeAccount, setRemoveAccount] = useState(false);
  const sharedCount = dataUsaha.accountDataUsahaCount ?? 1;

  async function handleConfirm() {
    setSubmitting(true);
    const res = await api.admin["data-usaha"]({ id: dataUsaha.id })["disconnect-accurate"].post({ removeAccount });
    setSubmitting(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(code === "IMPORT_RUNNING" ? "Ada import yang sedang berjalan di Data Usaha ini — tunggu selesai (atau batalkan) dulu." : "Gagal memutuskan koneksi — coba lagi.");
      return;
    }
    toast.success(
      removeAccount
        ? `Akun Accurate diputus total — Data Usaha terkait harus menghubungkan ulang dari awal.`
        : `Koneksi Accurate Data Usaha "${dataUsaha.name}" diputuskan — pemilik harus menghubungkan ulang dan memilih database lagi.`,
    );
    setOpen(false);
    setRemoveAccount(false);
    onDisconnected();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Putuskan Koneksi"
        aria-label={`Putuskan koneksi Accurate Data Usaha ${dataUsaha.name}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
      >
        <Unlink className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Putuskan Koneksi Accurate</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Ini akan memutuskan koneksi Accurate untuk Data Usaha <strong className="text-foreground">{dataUsaha.name}</strong>
            {dataUsaha.accurateDbAlias && (
              <>
                {" "}
                (database: <strong className="text-foreground">{dataUsaha.accurateDbAlias}</strong>)
              </>
            )}
            . <strong className="text-foreground">Semua fitur</strong> di Data Usaha ini ikut terputus, dan pemilik tidak bisa import lagi
            sampai menghubungkan ulang sendiri dari popup koneksi di dashboard mereka.
          </p>
          <p className="text-muted-foreground">
            Putus ini <strong className="text-foreground">bersih</strong>: pilihan database Accurate juga dihapus, jadi saat menyambung lagi pemilik{" "}
            <strong className="text-foreground">wajib memilih database Accurate dari awal</strong> (tidak otomatis kembali ke database sebelumnya).
          </p>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-3">
            <Checkbox checked={removeAccount} onCheckedChange={(v) => setRemoveAccount(v === true)} className="mt-0.5" />
            <span className="flex flex-col gap-1">
              <span className="font-medium text-foreground">
                Putuskan juga akun Accurate-nya{dataUsaha.accountEmail ? ` (${dataUsaha.accountEmail})` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                Pakai kalau user salah memilih email/akun login Accurate. Token akun dihapus, pemilik wajib login & izinkan Accurate dari nol.
                {sharedCount > 1 && (
                  <strong className="text-destructive">
                    {" "}
                    Akun ini dipakai {sharedCount} Data Usaha — SEMUANYA ikut terputus.
                  </strong>
                )}
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            User diberi notifikasi otomatis. Catatan: kalau browser user masih login ke akun Accurate yang salah, minta logout dari Accurate dulu
            (atau pakai jendela incognito) sebelum menghubungkan ulang.
          </p>
          <Button onClick={handleConfirm} disabled={submitting} className="self-end bg-destructive hover:bg-destructive/90">
            {submitting ? "Memproses..." : removeAccount ? "Putuskan Koneksi & Akun" : "Putuskan Koneksi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
