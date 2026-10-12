"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

// § Fase 189H (bagian 2), ADR-0027/0045 — nonaktifkan/aktifkan MASSAL (Super Admin). Pratinjau dulu (tanpa mengubah), lalu terapkan. Server menegakkan aturan: diri sendiri
// dan Super Admin aktif terakhir dilewati; sesi akun yang dinonaktifkan dicabut; pemilik akun diberi tahu lewat email.
type Preview = { requested: number; found: number; willChange: number; notFound: number; alreadyInState: number; blockedSelf: number; blockedLastSuperAdmin: number };

export function BulkStatusDialog({ open, onOpenChange, userIds, disabled, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; userIds: string[]; disabled: boolean; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka, sebelum memuat pratinjau (pola standar)
    setPreview(null);
    setError(null);
    api.admin.users.status.preview.post({ userIds, disabled }).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError("Gagal memuat pratinjau. Coba lagi.");
      else setPreview(res.data as unknown as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userIds, disabled]);

  async function apply() {
    setSaving(true);
    const res = await api.admin.users.status.post({ userIds, disabled });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error("Gagal menyimpan perubahan. Coba lagi.");
      return;
    }
    const { changed } = res.data as unknown as { changed: number };
    toast.success(disabled ? `${changed} akun dinonaktifkan.` : `${changed} akun diaktifkan kembali.`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{disabled ? "Nonaktifkan akun" : "Aktifkan kembali akun"}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {disabled ? "Akun tidak bisa login dan semua sesinya dikeluarkan. Data tetap utuh; dapat diaktifkan kembali kapan saja." : "Akun dapat login kembali."} Pemilik akun diberi tahu lewat email.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {!preview && !error ? <Skeleton className="h-20 w-full" /> : null}
          {preview ? (
            <ul className="m-0 flex flex-col gap-1 pl-4">
              <li>
                <strong>{preview.willChange}</strong> akun akan {disabled ? "dinonaktifkan" : "diaktifkan"}.
              </li>
              {preview.alreadyInState > 0 ? <li className="text-muted-foreground">{preview.alreadyInState} akun sudah dalam status ini (dilewati).</li> : null}
              {preview.notFound > 0 ? <li className="text-muted-foreground">{preview.notFound} akun tidak ditemukan.</li> : null}
              {preview.blockedSelf > 0 ? <li className="text-amber-700">Akun Anda sendiri tidak dapat dinonaktifkan (dilewati).</li> : null}
              {preview.blockedLastSuperAdmin > 0 ? <li className="text-amber-700">{preview.blockedLastSuperAdmin} Super Admin aktif terakhir tidak dapat dinonaktifkan (dilewati).</li> : null}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" variant={disabled ? "destructive" : "default"} disabled={!preview || preview.willChange === 0 || saving} onClick={apply}>
            {saving ? "Menyimpan…" : disabled ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
