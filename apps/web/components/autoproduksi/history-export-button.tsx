"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadFormulaExport, type FormulaExportResult } from "@/lib/formula-export";
import { historyExportErrorMessage, historyExportUrl, historyRangeError, MAX_HISTORY_EXPORT_DAYS } from "@/lib/history-export";

// § Fase 221 — Unduh Riwayat Input Produksi ke Excel: pelanggan memilih tanggal PRODUKSI, maksimal 2 hari. `baseUrl`/`getHeaders` dioper dari halaman
// (tanpa mengimpor `@/lib/api-client`, pola `FormulaExportButton`), `download` bisa disuntik untuk tes. Validasi rentang di UI hanya kemudahan — server memutuskan.
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HistoryExportButton({
  baseUrl = "",
  getHeaders,
  download,
  today = todayLocalIso,
}: {
  baseUrl?: string;
  getHeaders?: () => Record<string, string> | undefined;
  download?: (url: string) => Promise<FormulaExportResult>;
  today?: () => string;
}) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const rangeError = historyRangeError(from, to);

  async function handleClick() {
    if (rangeError) return;
    setBusy(true);
    const url = historyExportUrl(baseUrl, from, to);
    const result = await (download ? download(url) : downloadFormulaExport(url, { headers: getHeaders?.() }));
    setBusy(false);
    if (!result.ok) {
      toast.error(historyExportErrorMessage(result));
      return;
    }
    toast.success("Riwayat diunduh.");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Dari
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} className="h-9 w-40" aria-label="Tanggal produksi mulai" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Sampai
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} className="h-9 w-40" aria-label="Tanggal produksi akhir" />
        </label>
        <Button type="button" variant="outline" className="h-9 gap-1.5" disabled={busy || rangeError !== null} onClick={handleClick}>
          <Download className="h-4 w-4" />
          {busy ? "Mengunduh…" : "Unduh Excel"}
        </Button>
      </div>
      <p className={`text-xs ${rangeError && from && to ? "text-destructive" : "text-muted-foreground"}`}>
        {rangeError && from && to ? rangeError : `Berdasarkan tanggal produksi, maksimal ${MAX_HISTORY_EXPORT_DAYS} hari.`}
      </p>
    </div>
  );
}
