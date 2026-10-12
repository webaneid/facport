"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { currencyFormatter } from "@/lib/utils";

// § Fase 189G, ADR-0044 — tandai / cabut tanda INTERNAL untuk 1..100 akun. Dua langkah: pratinjau dampak (tanpa mengubah apa pun) lalu terapkan.
// Reversibel dan tidak menghapus data: invoice lama tetap ada, hanya keluar dari / masuk kembali ke laporan uang. Bila ada uang lunas atau tagihan
// perpanjangan terjadwal yang terdampak, Super Admin wajib mencentang persetujuan sebelum tombol terapkan aktif.
type Impact = { paidInvoiceCount: number; paidTotal: number; unpaidInvoices: number; activePaidSubscriptions: number; scheduledRenewals: number; activeInternalGrants?: number };
type Preview = {
  requested: number;
  found: number;
  notFound: number;
  flagChanges: number;
  becomeInternal: number;
  becomeCommercial: number;
  alreadyInState: number;
  internalByRole: number;
  impact: Impact;
};

export function InternalAccountsDialog({
  open,
  onOpenChange,
  userIds,
  isInternal,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userIds: string[];
  /** true = tandai internal; false = cabut tanda internal (kembali komersil). */
  isInternal: boolean;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka, sebelum memuat pratinjau (pola standar)
    setPreview(null);
    setError(null);
    setAcknowledged(false);
    api.admin.users.internal.preview.post({ userIds, isInternal }).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError("Gagal memuat pratinjau dampak. Coba lagi.");
      else setPreview(res.data as unknown as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userIds, isInternal]);

  const impact = preview?.impact;
  const needsAck = isInternal && !!impact && (impact.paidInvoiceCount > 0 || impact.scheduledRenewals > 0);
  const nothingToDo = !!preview && preview.flagChanges === 0;

  async function apply() {
    setSaving(true);
    const res = await api.admin.users.internal.post({ userIds, isInternal });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error("Gagal menyimpan perubahan. Coba lagi.");
      return;
    }
    const { changed } = res.data as unknown as { changed: number };
    toast.success(isInternal ? `${changed} akun ditandai internal.` : `Tanda internal dicabut dari ${changed} akun.`);
    onOpenChange(false);
    onDone();
  }

  const title = isInternal ? "Tandai sebagai akun internal" : "Cabut tanda internal";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isInternal
              ? "Akun internal (trainer, karyawan, mitra) tidak ditagih dan tidak dihitung di laporan uang. Dapat dibatalkan kapan saja."
              : "Akun kembali menjadi komersil: dapat ditagih dan dihitung di laporan uang."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
          {!preview && !error && <Skeleton className="h-24 w-full" />}
          {preview && (
            <>
              <ul className="flex flex-col gap-1 text-foreground">
                <li>
                  <strong>{preview.found}</strong> akun dipilih
                  {preview.notFound > 0 ? ` (${preview.notFound} tidak ditemukan)` : ""}.
                </li>
                {isInternal ? (
                  <li>
                    <strong>{preview.becomeInternal}</strong> akun komersil akan menjadi internal.
                  </li>
                ) : (
                  <li>
                    <strong>{preview.becomeCommercial}</strong> akun internal akan kembali komersil.
                  </li>
                )}
                {preview.alreadyInState > 0 && <li className="text-muted-foreground">{preview.alreadyInState} akun sudah dalam status ini (dilewati).</li>}
                {preview.internalByRole > 0 && (
                  <li className="text-muted-foreground">
                    {preview.internalByRole} akun tetap internal karena memegang role Admin/Super Admin (tidak bisa diubah lewat tanda).
                  </li>
                )}
              </ul>

              {impact && (impact.paidInvoiceCount > 0 || impact.unpaidInvoices > 0 || impact.activePaidSubscriptions > 0 || impact.scheduledRenewals > 0 || (impact.activeInternalGrants ?? 0) > 0) && (
                <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <p className="font-medium">Dampak pada akun yang berubah status:</p>
                  <ul className="list-disc pl-5">
                    {impact.paidInvoiceCount > 0 && (
                      <li>
                        {impact.paidInvoiceCount} invoice lunas ({currencyFormatter.format(impact.paidTotal)}) {isInternal ? "akan KELUAR dari" : "akan MASUK kembali ke"} laporan uang.
                      </li>
                    )}
                    {impact.activePaidSubscriptions > 0 && <li>{impact.activePaidSubscriptions} langganan berbayar aktif (tetap berjalan sampai berakhir).</li>}
                    {impact.scheduledRenewals > 0 && (
                      <li>
                        {impact.scheduledRenewals} langganan terjadwal perpanjangan {isInternal ? "tidak akan ditagih lagi" : "akan kembali ditagih otomatis"}.
                      </li>
                    )}
                    {!isInternal && (impact.activeInternalGrants ?? 0) > 0 && <li>{impact.activeInternalGrants} hibah akses internal (tanpa tanggal akhir) akan DICABUT.</li>}
                    {impact.unpaidInvoices > 0 && <li>{impact.unpaidInvoices} invoice belum dibayar tetap ada (tidak dibatalkan otomatis).</li>}
                  </ul>
                </div>
              )}

              {needsAck && (
                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox checked={acknowledged} onCheckedChange={(c) => setAcknowledged(c === true)} aria-label="Saya memahami dampak ini" className="mt-0.5" />
                  <span className="text-foreground">Saya memahami dampak di atas terhadap laporan uang dan tagihan.</span>
                </label>
              )}
              {nothingToDo && <p className="text-muted-foreground">Tidak ada perubahan yang perlu disimpan.</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button type="button" onClick={apply} loading={saving} disabled={!preview || nothingToDo || (needsAck && !acknowledged)}>
            {isInternal ? "Tandai internal" : "Cabut tanda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
