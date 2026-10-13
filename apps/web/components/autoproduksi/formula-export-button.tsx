"use client";

import { useId, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadFormulaExport, formulaExportErrorMessage, formulaExportUrl, type FormulaExportResult } from "@/lib/formula-export";

// § Fase 193 — Export Excel List Formula (format = template Import Formula; bisa diimpor balik). Default hanya Formula aktif; centang untuk menyertakan nonaktif
// (kolom Status ikut diekspor dan dibaca Import, jadi tetap nonaktif setelah diimpor balik). `baseUrl`/`getHeaders` dioper dari halaman (komponen ini sengaja TIDAK
// mengimpor `@/lib/api-client`: mock modul itu di tes lain bocor lintas file dan membuat impor bernama gagal), `download` bisa disuntik untuk tes.
export function FormulaExportButton({
  baseUrl = "",
  getHeaders,
  download,
}: {
  baseUrl?: string;
  getHeaders?: () => Record<string, string> | undefined;
  download?: (url: string) => Promise<FormulaExportResult>;
}) {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const checkboxId = useId();

  async function handleClick() {
    setBusy(true);
    const url = formulaExportUrl(baseUrl, includeInactive);
    const result = await (download ? download(url) : downloadFormulaExport(url, { headers: getHeaders?.() }));
    setBusy(false);
    if (!result.ok) {
      toast.error(formulaExportErrorMessage(result));
      return;
    }
    toast.success("Formula diekspor. File ini bisa diimpor kembali lewat Import Formula.");
  }

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox id={checkboxId} checked={includeInactive} onCheckedChange={(v) => setIncludeInactive(v === true)} disabled={busy} />
        Sertakan Formula nonaktif
      </label>
      <Button type="button" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={handleClick}>
        <Download className="h-4 w-4" />
        {busy ? "Mengunduh…" : "Export Excel"}
      </Button>
    </div>
  );
}
