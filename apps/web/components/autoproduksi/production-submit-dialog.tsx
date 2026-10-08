"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

// § Fase 185 — popup 3 tahap Input Produksi: (1) Periksa dulu → Kirim/Batal, (2) Progres (Menghubungi Accurate → Mengirim → selesai; tombol tidak bisa diklik ulang),
// (3) Hasil (berhasil/gagal) dengan "Lihat riwayat" / "Input produksi baru". Progres JUJUR: dibaca dari status entri di server (pending = antre + menghubungi Accurate,
// processing = sedang mengirim), bukan animasi karangan. Induk me-mount komponen ini hanya saat dibuka (state selalu segar).
export type ProductionSummary = { formulaLabel: string; qtyText: string; dateText: string; context: { label: string; value: string }[] };
export type SubmitOutcome = { ok: true; entryId: string } | { ok: false; message: string };
type Stage = "review" | "sending" | "done";
type EntryStatus = "pending" | "processing" | "success" | "failed";
type Result = { status: "success" | "failed"; message: string | null; transactionNumber: string | null };

const DEFAULT_POLL_MS = 1000;
const DEFAULT_SLOW_AFTER_MS = 60_000;

export function ProductionSubmitDialog({
  summary,
  duplicateWarning,
  onSubmit,
  onCancel,
  onNewInput,
  riwayatHref = "/autoproduksi/riwayat",
  pollMs = DEFAULT_POLL_MS,
  slowAfterMs = DEFAULT_SLOW_AFTER_MS,
}: {
  summary: ProductionSummary;
  /** Banner kuning di tahap Periksa — entri serupa baru saja dikirim. */
  duplicateWarning?: string | null;
  onSubmit: () => Promise<SubmitOutcome>;
  onCancel: () => void;
  onNewInput: () => void;
  riwayatHref?: string;
  /** Hanya untuk tes. */
  pollMs?: number;
  slowAfterMs?: number;
}) {
  const [stage, setStage] = useState<Stage>("review");
  const [status, setStatus] = useState<EntryStatus>("pending");
  const [result, setResult] = useState<Result | null>(null);
  const [slow, setSlow] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);
  const startedAt = useRef(0);
  const submitting = useRef(false);

  async function handleSend() {
    if (submitting.current) return; // pengaman klik ganda
    submitting.current = true;
    setStage("sending");
    startedAt.current = Date.now();
    const outcome = await onSubmit();
    if (!outcome.ok) {
      setResult({ status: "failed", message: outcome.message, transactionNumber: null });
      setStage("done");
      return;
    }
    setEntryId(outcome.entryId);
  }

  useEffect(() => {
    if (stage !== "sending") return;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > slowAfterMs) setSlow(true);
      if (!entryId) return;
      const res = await api.autoproduksi["production-entries"]({ id: entryId }).get();
      const entry = (res.data as unknown as { entry?: { status: EntryStatus; errorMessage: string | null; accurateTransactionNumber: string | null } } | null)?.entry;
      if (!entry) return;
      if (entry.status === "success" || entry.status === "failed") {
        setResult({ status: entry.status, message: entry.errorMessage, transactionNumber: entry.accurateTransactionNumber });
        setStage("done");
      } else {
        setStatus(entry.status);
      }
    }, pollMs);
    return () => clearInterval(timer);
  }, [stage, entryId, pollMs, slowAfterMs]);

  const percent = stage === "review" ? 0 : stage === "done" ? 100 : status === "processing" ? 80 : entryId ? 50 : 25;
  const steps = [
    { label: "Menyimpan input produksi", done: percent >= 50 },
    { label: "Menghubungi Accurate", done: percent >= 80 },
    { label: "Mengirim ke Accurate", done: percent >= 100 },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <Dialog open onOpenChange={(open) => !open && stage !== "sending" && (stage === "review" ? onCancel() : onNewInput())}>
      <DialogContent hideClose={stage === "sending"} onInteractOutside={(e) => stage === "sending" && e.preventDefault()} onEscapeKeyDown={(e) => stage === "sending" && e.preventDefault()}>
        {stage === "review" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Periksa dulu sebelum dikirim</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">Apakah input produksi sudah lengkap dan benar? Data ini akan langsung masuk ke Accurate.</DialogDescription>
            </DialogHeader>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Formula</dt>
              <dd className="font-medium text-foreground">{summary.formulaLabel}</dd>
              <dt className="text-muted-foreground">Qty produksi</dt>
              <dd className="font-medium text-foreground">{summary.qtyText}</dd>
              <dt className="text-muted-foreground">Tanggal</dt>
              <dd className="font-medium text-foreground">{summary.dateText}</dd>
              {summary.context.map((c) => (
                <div key={c.label} className="contents">
                  <dt className="text-muted-foreground">{c.label}</dt>
                  <dd className="text-foreground">{c.value}</dd>
                </div>
              ))}
            </dl>
            {duplicateWarning && (
              <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{duplicateWarning}</span>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>
                Batal
              </Button>
              <Button onClick={handleSend}>Kirim</Button>
            </div>
          </>
        )}

        {stage === "sending" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Mengirim input produksi…</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">Jangan tutup halaman ini sampai selesai.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary-600 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-sm" aria-live="polite">
              {steps.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2">
                  {s.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : i === activeIndex ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  <span className={s.done || i === activeIndex ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                </li>
              ))}
            </ul>
            {slow && (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="text-foreground">Masih diproses… Antrean atau Accurate sedang lambat. Input kamu aman dan tetap berjalan di latar belakang.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <Link href={riwayatHref} className={buttonVariants("outline")}>
                    Lihat riwayat
                  </Link>
                  <Button onClick={onNewInput}>Input produksi baru</Button>
                </div>
              </div>
            )}
          </>
        )}

        {stage === "done" && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                {result.status === "success" ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                {result.status === "success" ? "Input Produksi Terkirim" : "Gagal terkirim"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {result.status === "success"
                  ? result.transactionNumber
                    ? `Tercatat di Accurate dengan nomor ${result.transactionNumber}.`
                    : "Tercatat di Accurate."
                  : "Cek status di laman Riwayat."}
              </DialogDescription>
            </DialogHeader>
            {result.status === "failed" && result.message && <p className="mt-3 rounded-lg bg-destructive-bg p-3 text-sm text-foreground">{result.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Link href={riwayatHref} className={buttonVariants("outline")}>
                Lihat riwayat
              </Link>
              <Button onClick={onNewInput}>Input produksi baru</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
