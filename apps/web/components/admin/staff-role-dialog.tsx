"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { TIER_LABEL, staffRoleError, type StaffTier } from "@/lib/staff-actions";

// § Fase 216, ADR-0053 — ubah tingkat akun staf (Admin ↔ Super Admin) sebagai SATU langkah. Pratinjau dulu (tanpa menulis), lalu konfirmasi ketik email (dicek ulang di server).
// Kenaikan hak akses = risiko eskalasi, jadi sengaja dua langkah. Aturan sebenarnya dipaksa server.
type Preview = { user: { id: string; name: string; email: string; disabled: boolean }; noop: boolean; rolesBefore: string[]; rolesAfter: string[]; promotes: boolean; demotes: boolean; activeSuperAdmins: number; blockedLastSuperAdmin: boolean };

export function StaffRoleDialog({ open, onOpenChange, staffId, targetRole, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; staffId: string; targetRole: StaffTier; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const label = TIER_LABEL[targetRole];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka, sebelum memuat pratinjau (pola standar)
    setPreview(null);
    setError(null);
    setConfirm("");
    api.admin.staff({ id: staffId }).role.preview.post({ role: targetRole }).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError(staffRoleError((res.error?.value as { code?: string } | undefined)?.code));
      else setPreview(res.data as unknown as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, staffId, targetRole]);

  const canApply = !!preview && !preview.noop && !preview.blockedLastSuperAdmin && confirm.trim().toLowerCase() === preview.user.email.toLowerCase() && !saving;

  async function apply() {
    setSaving(true);
    const res = await api.admin.staff({ id: staffId }).role.post({ role: targetRole, confirm });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(staffRoleError((res.error?.value as { code?: string } | undefined)?.code));
      return;
    }
    toast.success(`Akun kini berperan ${label}.`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Jadikan {label}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {targetRole === "admin" ? "Akun ini mendapat hak penuh Super Admin, termasuk mengelola akun tim. Pastikan benar-benar diperlukan." : "Akun ini kehilangan hak Super Admin dan menjadi Admin terbatas (tanpa tambah/ubah/nonaktifkan akun tim)."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {!preview && !error ? <Skeleton className="h-24 w-full" /> : null}
          {preview ? (
            <>
              {preview.noop ? <Alert variant="default">Tidak ada yang berubah: akun ini sudah berperan {label}.</Alert> : null}
              {preview.blockedLastSuperAdmin ? <Alert variant="destructive">Ini Super Admin aktif terakhir. Jadikan akun lain Super Admin dulu sebelum menurunkannya.</Alert> : null}
              {preview.user.disabled ? <Alert variant="warning">Akun ini sedang nonaktif.</Alert> : null}
              <p className="m-0">
                Role sekarang: <strong>{preview.rolesBefore.join(", ")}</strong> → sesudah: <strong>{preview.rolesAfter.join(", ")}</strong>.
              </p>
              {!preview.noop && !preview.blockedLastSuperAdmin ? (
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
            {saving ? "Menyimpan…" : `Jadikan ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
