// § Fase 193 — unduh Export Formula (xlsx) lewat fetch BERKREDENSIAL + header Data Usaha aktif → blob. Tidak ada URL bertoken; galat server dibaca dari JSON `code`.
export type FormulaExportResult = { ok: true; filename: string } | { ok: false; status: number; code: string };

export function formulaExportUrl(base: string, includeInactive: boolean): string {
  return `${base}/autoproduksi/formulas/export?includeInactive=${includeInactive ? "true" : "false"}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadFormulaExport(
  url: string,
  opts: { fetchImpl?: typeof fetch; save?: (blob: Blob, filename: string) => void; headers?: Record<string, string> } = {},
): Promise<FormulaExportResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const save = opts.save ?? saveBlob;
  let res: Response;
  try {
    res = await doFetch(url, { credentials: "include", headers: opts.headers });
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
  if (!res.ok) {
    let code = "UNKNOWN";
    try {
      const body = (await res.json()) as { code?: unknown };
      if (typeof body.code === "string") code = body.code;
    } catch {
      /* bukan JSON */
    }
    return { ok: false, status: res.status, code };
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "export-formula.xlsx";
  save(await res.blob(), filename);
  return { ok: true, filename };
}

export function formulaExportErrorMessage(result: Extract<FormulaExportResult, { ok: false }>): string {
  if (result.code === "NETWORK") return "Gagal mengekspor — periksa koneksi internet Anda lalu coba lagi.";
  if (result.code === "DATA_USAHA_REQUIRED" || result.code === "DATA_USAHA_FORBIDDEN") return "Pilih Data Usaha yang benar lewat menu \"Ganti Data Usaha\", lalu coba ekspor lagi.";
  if (result.status === 401) return "Sesi berakhir — silakan masuk lagi, lalu coba ekspor.";
  return "Gagal mengekspor Formula. Coba lagi sebentar.";
}
