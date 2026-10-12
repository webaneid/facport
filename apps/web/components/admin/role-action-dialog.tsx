"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { currencyFormatter } from "@/lib/utils";
import { ROLE_ACTION_TEXT, roleActionError, type RoleAction } from "@/lib/role-actions";

// § Fase 189H, D17 — aksi peran dua arah (Super Admin). Pratinjau dampak dulu, lalu konfirmasi ketik email akun (dicek ulang di server). Kenaikan hak akses = risiko eskalasi.
type Impact = { paidInvoiceCount: number; paidTotal: number; unpaidInvoices: number; activePaidSubscriptions: number; scheduledRenewals: number };
type Preview = { noop: boolean; rolesBefore: string[]; rolesAfter: string[]; becomesInternal: boolean; becomesCommercial: boolean; impact: Impact; user: { email: string; name: string } };

export function RoleActionDialog({ open, onOpenChange, userId, action, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; userId: string; action: RoleAction; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const text = ROLE_ACTION_TEXT[action];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka, sebelum memuat pratinjau (pola standar)
    setPreview(null);
    setError(null);
    setConfirm("");
    api.admin.users({ id: userId }).roles.preview.post({ action }).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError(roleActionError((res.error?.value as { code?: string } | undefined)?.code));
      else setPreview(res.data as unknown as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId, action]);

  const impact = preview?.impact;
  const hasImpact = !!impact && (impact.paidInvoiceCount > 0 || impact.activePaidSubscriptions > 0 || impact.scheduledRenewals > 0 || impact.unpaidInvoices > 0);
  const canApply = !!preview && !preview.noop && confirm.trim().toLowerCase() === preview.user.email.toLowerCase() && !saving;

  async function apply() {
    setSaving(true);
    const res = await api.admin.users({ id: userId }).roles.post({ action, confirm });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(roleActionError((res.error?.value as { code?: string } | undefined)?.code));
      return;
    }
    toast.success(text.success);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{text.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{text.description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {!preview && !error ? <Skeleton className="h-24 w-full" /> : null}
          {preview ? (
            <>
              {preview.noop ? <Alert variant="default">Tidak ada yang berubah: akun ini sudah dalam keadaan tersebut.</Alert> : null}
              <p className="m-0">
                Role sekarang: <strong>{preview.rolesBefore.join(", ")}</strong> → sesudah: <strong>{preview.rolesAfter.join(", ")}</strong>.
              </p>
              {preview.becomesInternal ? <p className="m-0">Akun akan dihitung <strong>internal</strong> otomatis (tidak masuk laporan uang, tidak ditagih).</p> : null}
              {preview.becomesCommercial ? <p className="m-0">Akun akan kembali <strong>komersil</strong> (masuk laporan uang, dapat ditagih).</p> : null}
              {hasImpact && impact ? (
                <Alert variant="warning">
                  <ul className="m-0 list-disc pl-5">
                    {impact.paidInvoiceCount > 0 ? <li>{impact.paidInvoiceCount} invoice lunas ({currencyFormatter.format(impact.paidTotal)}) berpindah dari/ke laporan uang.</li> : null}
                    {impact.activePaidSubscriptions > 0 ? <li>{impact.activePaidSubscriptions} langganan berbayar aktif.</li> : null}
                    {impact.scheduledRenewals > 0 ? <li>{impact.scheduledRenewals} perpanjangan terjadwal akan berhenti/berlanjut ditagih.</li> : null}
                    {impact.unpaidInvoices > 0 ? <li>{impact.unpaidInvoices} invoice belum dibayar tetap ada.</li> : null}
                  </ul>
                </Alert>
              ) : null}
              {!preview.noop ? (
                <label className="flex flex-col gap-1">
                  <span>
                    Ketik email akun <strong>{preview.user.email}</strong> untuk melanjutkan:
                  </span>
                  <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Konfirmasi email akun" autoComplete="off" />
                </label>
              ) : null}
              <p className="m-0 text-xs text-muted-foreground">Sesi akun ini akan dikeluarkan dan pemilik akun diberi tahu lewat email.</p>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" disabled={!canApply} onClick={apply}>
            {saving ? "Menyimpan…" : text.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
