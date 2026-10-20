"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatStagedEstimate, type StagedPlanView } from "@/lib/staged-plan";

// § Fase 205, ADR-0051 — popup persetujuan: dokumen besar dikirim BERTAHAP ke dokumen Accurate yang SAMA. Facport tidak mengubah dokumen pelanggan
// (nomor & isi identik dengan Excel) — hanya cara mengirimnya yang dicicil, karena Accurate memproses dokumen besar makin lambat secara kuadrat.
const MAX_LISTED = 5;

export function StagedApprovalDialog({
  plan,
  busy,
  onApprove,
  onCancel,
}: {
  plan: StagedPlanView | null;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent hideClose>
        <DialogTitle>Dokumen besar akan dikirim bertahap</DialogTitle>
        {plan && (
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <ul className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3">
              {plan.items.slice(0, MAX_LISTED).map((item) => (
                <li key={item.number} className="flex justify-between gap-3">
                  <span className="font-medium break-all">{item.number}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {item.rows.toLocaleString("id-ID")} baris · {item.steps} kiriman
                  </span>
                </li>
              ))}
              {plan.items.length > MAX_LISTED && (
                <li className="text-muted-foreground">dan {plan.items.length - MAX_LISTED} dokumen lainnya</li>
              )}
            </ul>
            <p>
              Accurate memproses sebuah dokumen besar <strong>makin lambat secara kuadrat</strong> (jumlah baris dua kali lipat ≈ empat kali lebih lama), sehingga
              mengirim ribuan baris sekaligus sering kehabisan waktu. Facport akan mengirimnya <strong>bertahap</strong> (±{plan.chunkEntries.toLocaleString("id-ID")} faktur
              per kiriman) ke <strong>dokumen yang sama</strong>.
            </p>
            <p>
              <strong>Nomor dan isi dokumen Anda tidak berubah</strong> — hasil akhir di Accurate persis seperti di Excel. Konsekuensinya prosesnya lebih lama:{" "}
              <strong>{formatStagedEstimate(plan.estimatedSeconds)}</strong>. Selama proses, dokumen di Accurate terisi sedikit demi sedikit.
            </p>
            {plan.skippedForTax && plan.skippedForTax.length > 0 && (
              <p className="text-muted-foreground">
                Catatan: dokumen yang memuat PPh ({plan.skippedForTax.slice(0, 3).join(", ")}
                {plan.skippedForTax.length > 3 ? ", …" : ""}) tetap dikirim sekaligus seperti biasa — pengiriman bertahap belum mendukung PPh.
              </p>
            )}
            {plan.skippedTooLarge && plan.skippedTooLarge.length > 0 && (
              <p className="text-muted-foreground">
                Catatan: dokumen {plan.skippedTooLarge.slice(0, 3).map((d) => `${d.number} (${d.rows.toLocaleString("id-ID")} baris)`).join(", ")}
                {plan.skippedTooLarge.length > 3 ? ", …" : ""} terlalu besar untuk dikirim bertahap dalam waktu wajar (perkiraan {formatStagedEstimate(plan.skippedTooLarge[0]!.estimatedSeconds)} atau lebih), sehingga dikirim
                sekaligus seperti biasa dan kemungkinan besar tidak selesai — pertimbangkan membaginya sendiri di Excel.
              </p>
            )}
            <p className="text-muted-foreground">
              Anda boleh menutup halaman ini; proses berjalan di server dan dilanjutkan otomatis bila terputus. Kemajuan terlihat di halaman hasil import.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                Batal
              </Button>
              <Button onClick={onApprove} disabled={busy}>
                {busy ? "Memulai..." : "Setuju, Mulai Kirim"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
