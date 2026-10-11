"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiBaseUrl } from "@/lib/api-client";
import { downloadCsv, exportErrorMessage, exportUrl } from "@/lib/insights";

// § Fase 189D — tombol ekspor CSV. Unduhan lewat fetch BERKREDENSIAL → blob (tidak ada URL bertoken); galat 429/422 menjadi toast.
export function ExportButton({ name, params, label = "Ekspor CSV" }: { name: string; params?: Record<string, string | number | null | undefined>; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const res = await downloadCsv(exportUrl(apiBaseUrl, name, params));
    setBusy(false);
    if (!res.ok) {
      toast.error(exportErrorMessage(res.code));
      return;
    }
    toast.success(res.truncated ? `Diunduh ${res.rows.toLocaleString("id-ID")} baris (dipotong di batas maksimum).` : `Diunduh ${res.rows.toLocaleString("id-ID")} baris.`);
  }

  return (
    <Button type="button" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={handleClick}>
      <Download className="h-4 w-4" />
      {busy ? "Mengunduh…" : label}
    </Button>
  );
}
