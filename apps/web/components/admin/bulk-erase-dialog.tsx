"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TruncateText } from "@/components/ui/truncate-text";
import { api } from "@/lib/api-client";
import { ERASE_TEXT, eraseReasonText, type EraseKind, type EraseReasonInfo } from "@/lib/role-actions";

// § Fase 189H, ADR-0045 — hapus permanen / anonimisasi MASSAL (hanya Super Admin). Pratinjau kelayakan per akun, alasan wajib, konfirmasi ketik kata (dicek ulang di server). Tidak dapat dibatalkan.
type Impact = { activeSubscriptions: number; activeSeats: number; accurateConnections: number };
type Preview = { requested: number; eligible: number; missing: number; confirmWord: string; impact?: Impact | null; blocked: { id: string; name: string; email: string; reasons: EraseReasonInfo[] }[] };

export function BulkEraseDialog({ open, onOpenChange, userIds, kind, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; userIds: string[]; kind: EraseKind; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const text = ERASE_TEXT[kind];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka, sebelum memuat pratinjau (pola standar)
    setPreview(null);
    setError(null);
    setReason("");
    setConfirm("");
    api.admin.users.erase.preview.post({ kind, userIds }).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError("Gagal memuat pratinjau. Coba lagi.");
      else setPreview(res.data as unknown as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userIds, kind]);

  const canApply = !!preview && preview.eligible > 0 && confirm.trim() === text.word && reason.trim().length >= 3 && !saving;

  async function apply() {
    setSaving(true);
    const res = await api.admin.users.erase.post({ kind, userIds, confirm, reason: reason.trim() });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error("Gagal memproses. Tidak ada data yang diubah atau sebagian dilewati — muat ulang lalu coba lagi.");
      return;
    }
    const { done } = res.data as unknown as { done: number };
    toast.success(text.done(done));
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
              <p className="m-0">
                <strong>{preview.eligible}</strong> dari {preview.requested} akun akan {kind === "delete" ? "dihapus permanen" : "dianonimkan"}.
              </p>
              {preview.blocked.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <p className="m-0 font-medium">{preview.blocked.length} akun dilewati:</p>
                  <ul className="m-0 mt-1 list-disc pl-5">
                    {preview.blocked.map((b) => (
                      <li key={b.id}>
                        <TruncateText className="inline-block max-w-56 align-bottom font-medium">{b.name || b.email}</TruncateText> — {b.reasons.map(eraseReasonText).join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.impact && (preview.impact.activeSubscriptions > 0 || preview.impact.activeSeats > 0 || preview.impact.accurateConnections > 0) ? (
                <Alert variant="warning">
                  Dampak pada akun yang dianonimkan: {preview.impact.activeSubscriptions} langganan aktif tetap tercatat tetapi pemiliknya tidak bisa login lagi; {preview.impact.activeSeats} slot User Tambahan aktif kehilangan pemilik; {preview.impact.accurateConnections} koneksi Accurate akan DIPUTUS (token dibuang).
                </Alert>
              ) : null}
              <Alert variant="warning">Tindakan ini tidak dapat dibatalkan. Pastikan backup database terbaru tersedia sebelum melanjutkan.</Alert>
              <label className="flex flex-col gap-1">
                <span>Alasan (wajib, tercatat di audit — jangan menulis email atau nomor telepon):</span>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} aria-label="Alasan" />
              </label>
              <label className="flex flex-col gap-1">
                <span>
                  Ketik <strong>{text.word}</strong> untuk melanjutkan:
                </span>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Konfirmasi kata" autoComplete="off" />
              </label>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" variant="destructive" disabled={!canApply} onClick={apply}>
            {saving ? "Memproses…" : text.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
