"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § grouping 2-level (§ manufacture-slip-shared.ts): create-only, DEFAULT ADR-0011 by "Trans No" (opsional).
type EditableRow = {
  id: string;
  rowNumber: number;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

// § HARUS SINKRON dengan `materialSlipMapping` di `apps/api/src/lib/import-mapping/material-slip.mapping.ts`.
export const DATE_INTERNAL_FIELDS = new Set(["transDate", "serialExpDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
// § KOSONG SENGAJA: header dokumen (tanggal, Work Order No, tipe) boleh hanya diisi di baris PERTAMA grup, dan baris
// "lanjutan" nomor seri tidak punya itemNo/quantity sendiri — jadi tidak ada kolom yang wajib di SEMUA baris. Yang
// divalidasi server per baris item: itemNo wajib, tipe dikenali bila kolomnya terisi (`materialSlipRowError`);
// kelengkapan header dicek per grup saat import berjalan.
export const REQUIRED_INTERNAL_FIELDS = new Set<string>();

const FIELD_HINTS: Record<string, string> = {
  materialSlipType: "Pengambilan (ITEM_PICK) atau Pengembalian (ITEM_RETURN)",
  workOrderNumber: "Nomor Work Order yang sudah ada di Accurate",
  itemNo: "Kode bahan baku di Accurate — TIDAK dibuatkan otomatis. Wajib kecuali baris ini hanya lanjutan Serial No",
  branchName: "Nama cabang — opsional, tidak perlu sama persis ID (tidak di-lookup)",
  warehouseName: "Nama gudang — opsional, tidak di-lookup",
};

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

export function EditRowDialog({
  batchId,
  row,
  columnMapping,
  onSaved,
}: {
  batchId: string;
  row: EditableRow;
  columnMapping: Record<string, string>;
  onSaved: () => void;
}) {
  const columns = Object.keys(columnMapping);
  const dateColumns = new Set(columns.filter((col) => DATE_INTERNAL_FIELDS.has(columnMapping[col]!)));
  const requiredColumns = new Set(columns.filter((col) => REQUIRED_INTERNAL_FIELDS.has(columnMapping[col]!)));
  const fieldToColumn = Object.fromEntries(columns.map((col) => [columnMapping[col], col]));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingColumns, setMissingColumns] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);

  function validateRequired(vals: Record<string, string>): Set<string> {
    return new Set([...requiredColumns].filter((col) => (vals[col] ?? "").trim() === ""));
  }

  function openDialog() {
    setValues(
      Object.fromEntries(
        columns.map((col) => [col, dateColumns.has(col) ? toDisplayDate(row.rawData[col]) : String(row.rawData[col] ?? "")]),
      ),
    );
    setError(null);
    setMissingColumns(new Set());
    setOpen(true);
  }

  function updateValue(col: string, next: string) {
    setValues((v) => ({ ...v, [col]: next }));
    if (missingColumns.has(col) && next.trim() !== "") {
      setMissingColumns((prev) => {
        const next2 = new Set(prev);
        next2.delete(col);
        return next2;
      });
    }
  }

  async function handleSave() {
    setError(null);
    const clientMissing = validateRequired(values);
    if (clientMissing.size > 0) {
      setMissingColumns(clientMissing);
      setError(`${clientMissing.size} kolom belum lengkap atau tidak valid — lihat tanda merah di bawah.`);
      return;
    }

    setSubmitting(true);
    const res = await api["material-slip"].import({ batchId }).rows({ rowId: row.id }).put({ rawData: values });
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string; fields?: string[] } | undefined;
      if (value?.code === "MISSING_REQUIRED_VALUES") {
        const cols = (value.fields ?? []).map((f) => fieldToColumn[f] ?? f);
        setMissingColumns(new Set(cols));
        setError(`${cols.length} kolom belum lengkap atau tidak valid — lihat tanda merah di bawah.`);
      } else {
        setMissingColumns(new Set());
        setError("Gagal menyimpan perubahan — coba lagi. Kalau berulang, kemungkinan masalahnya bukan di form ini (cek koneksi atau hubungi admin).");
      }
      return;
    }
    setMissingColumns(new Set());
    toast.success(`Baris ${row.rowNumber} diperbarui — klik "Retry baris gagal" untuk coba lagi.`);
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={openDialog}
        title="Edit"
        aria-label={`Edit baris ${row.rowNumber}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0")}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <DialogContent className="max-w-lg">
        <DialogTitle>Edit Baris {row.rowNumber}</DialogTitle>
        <div ref={scrollRef} className="mt-3 flex max-h-[70vh] flex-col gap-3 overflow-y-auto text-sm">
          {row.errorMessage && (
            <p className="rounded-md bg-destructive-bg px-3 py-2 text-destructive">
              <strong>Error terakhir dari Accurate:</strong> {row.errorMessage}
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive-bg px-3 py-2 font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{error}</p>
                {missingColumns.size > 0 && (
                  <ul className="mt-1 list-disc pl-4 font-normal">
                    {[...missingColumns].map((col) => (
                      <li key={col}>{col}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {columns.map((col) => {
            const isRequired = requiredColumns.has(col);
            const isMissing = missingColumns.has(col);
            const internalField = columnMapping[col]!;
            return (
              <label key={col} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">
                  {col}
                  {isRequired && (
                    <span className="ml-0.5 text-destructive" aria-label="wajib diisi">
                      *
                    </span>
                  )}
                </span>
                <Input
                  value={values[col] ?? ""}
                  onChange={(e) => updateValue(col, e.target.value)}
                  placeholder={dateColumns.has(col) ? "DD/MM/YYYY" : FIELD_HINTS[internalField]}
                  aria-invalid={isMissing}
                  className={
                    isMissing
                      ? "border-destructive bg-destructive-bg/40 focus:border-destructive focus:ring-destructive/10"
                      : isRequired
                        ? "border-foreground/25"
                        : undefined
                  }
                />
                {isMissing && <span className="text-xs text-destructive">Belum lengkap atau tidak valid.</span>}
              </label>
            );
          })}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
