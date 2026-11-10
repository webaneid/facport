"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { trialClaimReleaseError } from "@/lib/trial-claims";

// § Fase 217, ADR-0054 — lepas klaim trial (Super Admin). Alasan wajib (dicek ulang di server, diaudit). Klaim tidak dihapus, hanya ditandai dilepas; setelah itu database
// Accurate tersebut boleh dicoba lagi untuk modul yang sama.
export function TrialClaimReleaseDialog({
  open,
  onOpenChange,
  claimId,
  accurateDbId,
  moduleName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string;
  accurateDbId: string;
  moduleName: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka (pola standar)
    setReason("");
    setError(null);
  }, [open, claimId]);

  const canApply = reason.trim().length >= 3 && !saving;

  async function apply() {
    setSaving(true);
    setError(null);
    const res = await api.admin["trial-claims"]({ id: claimId }).release.post({ reason: reason.trim() });
    setSaving(false);
    if (res.error) {
      setError(trialClaimReleaseError((res.error.value as { code?: string } | undefined)?.code));
      return;
    }
    toast.success("Klaim trial dilepas.");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Lepas klaim trial</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Database Accurate <code className="text-foreground">{accurateDbId}</code> untuk <strong>{moduleName}</strong> bisa dicoba gratis lagi oleh langganan trial mana pun. Tindakan ini dicatat di audit.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <label className="flex flex-col gap-1">
            <span>Alasan (wajib)</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan melepas klaim" maxLength={500} rows={3} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" disabled={!canApply} onClick={apply}>
            {saving ? "Melepas…" : "Lepas klaim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
