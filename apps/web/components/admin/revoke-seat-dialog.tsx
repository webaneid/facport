"use client";

import { useState } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { IconInput } from "@/components/auth/icon-input";
import { Mail } from "lucide-react";
import { api } from "@/lib/api-client";
import { ReasonQuickPicks } from "@/components/admin/reason-quick-picks";

// § Fase 189B, D7/D15 — admin mencabut atau MEMINDAHKAN akses User Tambahan. Alasan WAJIB (tercatat di riwayat Data Usaha supaya kelak ada jejak bila akses
// ditambahkan lagi); saran cepat hanya mengisi kolom alasan. Alasan adalah catatan internal — pemilik hanya menerima notifikasi generik. "Pindahkan" = cabut + undang
// email baru di slot yang sama (undangan dikirim tim Facport atas permintaan pemilik).
const QUICK_REASONS = [
  { value: "owner", label: "Permintaan pemilik/atasan", text: "Permintaan pemilik/atasan perusahaan" },
  { value: "resign", label: "Karyawan resign", text: "Karyawan resign tanpa serah terima akun" },
  { value: "wrong", label: "Salah undang", text: "Salah mengundang email" },
  { value: "other", label: "Lainnya", text: "" },
] as const;
type QuickValue = (typeof QUICK_REASONS)[number]["value"];

export function RevokeSeatDialog({
  dataUsahaId,
  seatId,
  holderLabel,
  onDone,
}: {
  dataUsahaId: string;
  seatId: string;
  /** Email member / email undangan yang akan dicabut (untuk teks). */
  holderLabel: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState<QuickValue | null>(null);
  const [reason, setReason] = useState("");
  const [move, setMove] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setQuick(null);
    setReason("");
    setMove(false);
    setNewEmail("");
    setError(null);
  }

  function pickQuick(next: QuickValue | null) {
    setQuick(next);
    const text = QUICK_REASONS.find((q) => q.value === next)?.text ?? "";
    if (next && text) setReason(text);
  }

  const trimmed = reason.trim();
  const emailOk = !move || /^\S+@\S+\.\S+$/.test(newEmail.trim());
  const canSubmit = trimmed.length >= 3 && emailOk && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await api.admin["data-usaha"]({ id: dataUsahaId }).seats({ seatId }).revoke.post({ reason: trimmed, ...(move ? { newEmail: newEmail.trim() } : {}) });
    setSubmitting(false);
    if (err || !data) {
      const code = (err?.value as { code?: string } | undefined)?.code;
      setError(
        code === "SEAT_ALREADY_AVAILABLE"
          ? "Slot ini sudah tersedia (mungkin baru dicabut oleh pihak lain). Muat ulang daftar."
          : code === "SEAT_NOT_FOUND" || code === "DATA_USAHA_NOT_FOUND"
            ? "Slot tidak ditemukan. Muat ulang halaman."
            : code === "REASON_REQUIRED" || code === "REASON_TOO_LONG"
              ? "Alasan wajib diisi (3–500 karakter)."
              : "Gagal menyimpan, coba lagi.",
      );
      return;
    }
    toast.success(move ? `Akses ${holderLabel} dicabut dan undangan dikirim ke ${newEmail.trim()}.` : `Akses ${holderLabel} dicabut.`);
    setOpen(false);
    reset();
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Cabut / pindahkan akses"
        aria-label={`Cabut akses ${holderLabel}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
      >
        <UserMinus className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Cabut akses User Tambahan</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Akses <strong className="text-foreground">{holderLabel}</strong> dicabut dan sesinya langsung diakhiri. Pemilik diberi notifikasi; alasan di bawah hanya untuk catatan internal.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-2">
            <label htmlFor="revoke-reason" className="font-medium text-foreground">
              Alasan (wajib)
            </label>
            <ReasonQuickPicks label="Saran alasan" options={QUICK_REASONS.map((q) => ({ value: q.value, label: q.label }))} value={quick} onChange={pickQuick} disabled={submitting} />
            <Textarea id="revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Mis. karyawan resign, atasan meminta akses dicabut via WhatsApp" disabled={submitting} className="min-h-20" />
          </div>
          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox checked={move} onCheckedChange={(c) => setMove(c === true)} aria-label="Pindahkan ke email baru" className="mt-0.5" disabled={submitting} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">Pindahkan ke email baru</span>
              <span className="text-xs text-muted-foreground">Slot yang sama langsung diundangkan ke email pengganti (dikirim tim Facport atas permintaan pemilik).</span>
            </span>
          </label>
          {move && <IconInput icon={Mail} type="email" aria-label="Email pengganti" placeholder="Email pengganti" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} disabled={submitting} />}
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Batal
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit} loading={submitting} className="bg-destructive hover:bg-destructive/90">
            {move ? "Cabut & undang pengganti" : "Cabut akses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
