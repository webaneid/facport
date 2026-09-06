"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// § Fase 51 — grid editable ala Excel, dipakai LINTAS 6 modul import
// (Purchase Invoice, Sales Invoice, Purchase Payment, Sales Receipt,
// Journal Voucher, Vendor Payable Account). BEDA dari
// `edit-row-dialog.tsx` (1 komponen per modul, form 1 baris) — komponen
// ini GENERIC (module-agnostic, semua pengetahuan spesifik-modul
// dioper via props oleh halaman pemanggil), karena kompleksitas grid
// editable tidak masuk akal diduplikasi 6x seperti dialog form
// sederhana. Opsi TAMBAHAN, BUKAN pengganti dialog per-baris — dipakai
// untuk kasus banyak baris gagal sekaligus (dialog per-baris tetap ada
// untuk perbaikan cepat 1 baris).
export type EditableGridRow = {
  id: string;
  rowNumber: number;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

export type BulkSaveResult = {
  updated: string[];
  errors: { rowId: string; rowNumber: number; fields: string[] }[];
};

// § replikasi PERSIS `toDisplayDate` di tiap `edit-row-dialog.tsx` (6
// file, identik) — SENGAJA tidak di-refactor jadi 1 helper bersama yang
// dipakai dialog LAMA juga (di luar scope Fase 51, risiko regresi ke
// komponen yang sudah stabil tanpa manfaat langsung untuk fitur ini).
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
function toDisplayDate(value: unknown): string {
  if (typeof value === "number") {
    const date = new Date(EXCEL_EPOCH_UTC_MS + value * 86400000);
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${date.getUTCFullYear()}`;
  }
  if (typeof value === "string") {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    return value;
  }
  return value == null ? "" : String(value);
}

export function EditableGrid({
  rows,
  columnMapping,
  requiredInternalFields,
  dateInternalFields,
  onSave,
  onSaved,
}: {
  rows: EditableGridRow[];
  columnMapping: Record<string, string>;
  requiredInternalFields: Set<string>;
  dateInternalFields: Set<string>;
  onSave: (rows: { id: string; rawData: Record<string, string> }[]) => Promise<BulkSaveResult | null>;
  onSaved: () => void;
}) {
  const columns = Object.keys(columnMapping);
  const dateColumns = new Set(columns.filter((col) => dateInternalFields.has(columnMapping[col]!)));
  const requiredColumns = new Set(columns.filter((col) => requiredInternalFields.has(columnMapping[col]!)));

  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, Set<string>>>({});
  const [rowErrorMessages, setRowErrorMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  // § seed nilai dari `rawData` tiap kali daftar baris gagal berubah
  // (mis. setelah retry sebagian sukses, baris yang tersisa beda) —
  // baris yang SUDAH pernah diedit user di sesi ini (masih ada di
  // `values`) TIDAK di-reset supaya perubahan yang belum disimpan tidak
  // hilang percuma kalau polling parent kebetulan jalan bareng.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed dari props `rows` (sumber eksternal), merge dengan draft lokal yang sudah ada
    setValues((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (next[row.id]) continue;
        next[row.id] = Object.fromEntries(
          columns.map((col) => [col, dateColumns.has(col) ? toDisplayDate(row.rawData[col]) : String(row.rawData[col] ?? "")]),
        );
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function updateCell(rowId: string, col: string, next: string) {
    setValues((v) => ({ ...v, [rowId]: { ...v[rowId], [col]: next } }));
    setCellErrors((prev) => {
      if (!prev[rowId]?.has(col)) return prev;
      const nextSet = new Set(prev[rowId]);
      nextSet.delete(col);
      return { ...prev, [rowId]: nextSet };
    });
  }

  async function handleSaveAll() {
    setSummary(null);
    // § cek wajib di klien DULU (feedback instan), server tetap jadi
    // sumber kebenaran (dicek ulang di `onSave`, hasilnya di-apply lagi
    // di bawah — dua-duanya bisa nunjuk kolom yang sama).
    const clientErrors: Record<string, Set<string>> = {};
    for (const row of rows) {
      const rowValues = values[row.id] ?? {};
      const missing = new Set([...requiredColumns].filter((col) => (rowValues[col] ?? "").trim() === ""));
      if (missing.size > 0) clientErrors[row.id] = missing;
    }
    if (Object.keys(clientErrors).length > 0) {
      setCellErrors(clientErrors);
      setSummary(`${Object.keys(clientErrors).length} baris masih ada kolom wajib kosong — lihat sel merah di bawah.`);
      return;
    }

    setSaving(true);
    const payload = rows.map((row) => ({ id: row.id, rawData: values[row.id] ?? {} }));
    const result = await onSave(payload);
    setSaving(false);

    if (!result) {
      setSummary("Gagal menyimpan perubahan — coba lagi.");
      return;
    }

    const nextCellErrors: Record<string, Set<string>> = {};
    const nextRowErrorMessages: Record<string, string> = {};
    for (const err of result.errors) {
      if (err.fields[0] === "ROW_NOT_FOUND" || err.fields[0] === "ROW_NOT_EDITABLE") {
        nextRowErrorMessages[err.rowId] = err.fields[0] === "ROW_NOT_EDITABLE" ? "Baris ini sudah tidak berstatus gagal (mungkin baru saja di-retry di tempat lain)." : "Baris tidak ditemukan.";
        continue;
      }
      const fieldToColumn = Object.fromEntries(columns.map((col) => [columnMapping[col], col]));
      nextCellErrors[err.rowId] = new Set(err.fields.map((f) => fieldToColumn[f] ?? f));
    }
    setCellErrors(nextCellErrors);
    setRowErrorMessages(nextRowErrorMessages);

    if (result.updated.length > 0) toast.success(`${result.updated.length} baris tersimpan — klik "Retry baris gagal" untuk coba lagi.`);
    setSummary(
      result.errors.length > 0
        ? `${result.updated.length} baris tersimpan, ${result.errors.length} baris masih ada masalah — lihat highlight merah di bawah.`
        : `Semua ${result.updated.length} baris tersimpan.`,
    );
    onSaved();
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {summary && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p>{summary}</p>
        </div>
      )}
      {/* § WAJIB overflow-x-auto — banyak kolom + layar sempit HARUS bisa
          digeser horizontal TANPA body halaman ikut ke-scroll (§ diminta
          user eksplisit, konsisten pola `components/ui/table.tsx`). */}
      <div className="w-full overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="whitespace-nowrap border-b border-r border-border px-3 py-2 text-left font-medium text-muted-foreground">Baris</th>
              <th className="min-w-[200px] whitespace-nowrap border-b border-r border-border px-3 py-2 text-left font-medium text-muted-foreground">
                Error Terakhir
              </th>
              {columns.map((col) => (
                <th key={col} className="min-w-[140px] whitespace-nowrap border-b border-r border-border px-3 py-2 text-left font-medium text-muted-foreground last:border-r-0">
                  {col}
                  {requiredColumns.has(col) && (
                    <span className="ml-0.5 text-destructive" aria-label="wajib diisi">
                      *
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="odd:bg-background even:bg-muted/20">
                <td className="whitespace-nowrap border-b border-r border-border px-3 py-1.5 text-muted-foreground">{row.rowNumber}</td>
                <td className="max-w-[240px] truncate border-b border-r border-border px-3 py-1.5 text-muted-foreground" title={rowErrorMessages[row.id] ?? row.errorMessage ?? ""}>
                  {rowErrorMessages[row.id] ?? row.errorMessage ?? "-"}
                </td>
                {columns.map((col) => {
                  const isMissing = cellErrors[row.id]?.has(col) ?? false;
                  return (
                    <td key={col} className="border-b border-r border-border p-0 last:border-r-0">
                      <input
                        value={values[row.id]?.[col] ?? ""}
                        onChange={(e) => updateCell(row.id, col, e.target.value)}
                        placeholder={dateColumns.has(col) ? "DD/MM/YYYY" : undefined}
                        aria-invalid={isMissing}
                        className={cn(
                          "h-full w-full border-0 bg-transparent px-3 py-1.5 outline-none focus:bg-primary-500/5 focus:ring-2 focus:ring-inset focus:ring-primary-500/30",
                          isMissing && "bg-destructive-bg/40",
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={handleSaveAll} disabled={saving} className="self-start">
        {saving ? "Menyimpan..." : `Simpan Semua Perubahan (${rows.length} baris)`}
      </Button>
    </div>
  );
}
