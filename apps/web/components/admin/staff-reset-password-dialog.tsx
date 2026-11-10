"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { staffResetError } from "@/lib/staff-actions";

// § Fase 216, ADR-0053 — reset kata sandi akun staf. Konfirmasi ketik email (dicek ulang di server). Sandi sementara ditampilkan SEKALI setelah berhasil (juga dikirim ke email
// staf); sesi lama staf dicabut. Sandi tidak disimpan di state selain untuk tampilan dialog ini dan hilang saat dialog ditutup.
export function StaffResetPasswordDialog({ open, onOpenChange, staffId, email }: { open: boolean; onOpenChange: (open: boolean) => void; staffId: string; email: string }) {
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka (pola standar)
    setConfirm("");
    setError(null);
    setResult(null);
  }, [open, staffId]);

  const canApply = confirm.trim().toLowerCase() === email.toLowerCase() && !saving;

  async function apply() {
    setSaving(true);
    setError(null);
    const res = await api.admin.staff({ id: staffId })["reset-password"].post({ confirm });
    setSaving(false);
    if (res.error || !res.data) {
      setError(staffResetError((res.error?.value as { code?: string } | undefined)?.code));
      return;
    }
    setResult(res.data as unknown as { email: string; tempPassword: string });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Kata sandi disalin.");
    } catch {
      toast.error("Tidak dapat menyalin otomatis. Salin manual.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Reset kata sandi</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Kata sandi lama langsung tidak berlaku dan sesi login staf ini dikeluarkan. Kata sandi sementara baru dikirim ke email staf.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {result ? (
            <>
              <Alert variant="warning">
                <strong>Catat kata sandi ini sekarang</strong>: tidak akan ditampilkan lagi setelah dialog ditutup.
              </Alert>
              <p className="m-0">
                Email: <code className="text-foreground">{result.email}</code>
              </p>
              <p className="m-0 flex items-center gap-2">
                Kata sandi sementara: <code className="text-foreground">{result.tempPassword}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(result.tempPassword)}>
                  Salin
                </Button>
              </p>
            </>
          ) : (
            <>
              {error ? <Alert variant="destructive">{error}</Alert> : null}
              <label className="flex flex-col gap-1">
                <span>
                  Ketik email akun <strong>{email}</strong> untuk melanjutkan:
                </span>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Konfirmasi email akun" autoComplete="off" />
              </label>
            </>
          )}
        </div>
        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Selesai
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="button" disabled={!canApply} onClick={apply}>
                {saving ? "Mereset…" : "Reset kata sandi"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
