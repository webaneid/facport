"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { ARCHIVE_NOTE, DELETE_NOTE, blockerText, lifecycleError, type Blocker, type LifecycleMode } from "@/lib/data-usaha-lifecycle";

// § Fase 218, ADR-0055 — hapus (Data Usaha kosong) atau arsip (punya riwayat) oleh PEMILIK. Pratinjau dari server menentukan aksinya; konfirmasi ketik nama Data Usaha (dicek ulang server).
export function DataUsahaLifecycleDialog({
  open,
  onOpenChange,
  dataUsahaId,
  name,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataUsahaId: string;
  name: string;
  onDone: (action: "deleted" | "archived") => void;
}) {
  const [mode, setMode] = useState<LifecycleMode | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka (pola standar)
    setMode(null);
    setBlockers([]);
    setConfirm("");
    setError(null);
    setLoading(true);
    api.me["data-usaha"]({ id: dataUsahaId })
      .lifecycle.get()
      .then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.error || !res.data) {
          setError(lifecycleError((res.error?.value as { code?: string } | undefined)?.code));
          return;
        }
        const d = res.data as unknown as { mode: LifecycleMode; blockers: Blocker[] };
        setMode(d.mode);
        setBlockers(d.blockers);
      });
    return () => {
      cancelled = true;
    };
  }, [open, dataUsahaId]);

  const canApply = (mode === "delete" || mode === "archive") && confirm.trim().toLowerCase() === name.trim().toLowerCase() && !saving;

  async function apply() {
    if (mode !== "delete" && mode !== "archive") return;
    setSaving(true);
    setError(null);
    const target = api.me["data-usaha"]({ id: dataUsahaId });
    const res = mode === "delete" ? await target.delete.post({ confirm }) : await target.archive.post({ confirm });
    setSaving(false);
    if (res.error) {
      const v = res.error.value as { code?: string; blockers?: Blocker[] } | undefined;
      if (v?.blockers) setBlockers(v.blockers);
      setError(lifecycleError(v?.code));
      return;
    }
    toast.success(mode === "delete" ? "Data Usaha dihapus." : "Data Usaha diarsipkan. Bisa dipulihkan dalam 30 hari.");
    onOpenChange(false);
    onDone(mode === "delete" ? "deleted" : "archived");
  }

  const title = mode === "delete" ? "Hapus Data Usaha" : mode === "archive" ? "Arsipkan Data Usaha" : "Hapus / arsipkan Data Usaha";
  const action = mode === "delete" ? "Hapus permanen" : "Arsipkan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <strong className="text-foreground">{name}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {loading ? <p className="text-muted-foreground">Memeriksa…</p> : null}
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {mode === "blocked" || (blockers.length > 0 && mode !== "delete") ? (
            <Alert variant="warning">
              <p className="m-0 mb-1 font-medium">Belum bisa diarsipkan:</p>
              <ul className="m-0 list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b.code}>{blockerText(b)}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {mode === "delete" || mode === "archive" ? (
            <>
              <Alert variant="warning">{mode === "delete" ? DELETE_NOTE : ARCHIVE_NOTE}</Alert>
              <label className="flex flex-col gap-1">
                <span>
                  Ketik nama Data Usaha <strong>{name}</strong> untuk melanjutkan:
                </span>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Konfirmasi nama Data Usaha" autoComplete="off" />
              </label>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {mode === "blocked" ? "Tutup" : "Batal"}
          </Button>
          {mode === "delete" || mode === "archive" ? (
            <Button type="button" variant="destructive" disabled={!canApply} onClick={apply}>
              {saving ? "Memproses…" : action}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
