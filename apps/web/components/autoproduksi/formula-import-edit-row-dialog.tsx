"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § mirror `components/roll-over/edit-row-dialog.tsx` — "quantity" wajib
// KONDISIONAL (cuma baris Tipe Barang=BB, § `autoproduksiFormulaRowError`)
// jadi TIDAK masuk `REQUIRED_INTERNAL_FIELDS` statis di sini — server yang
// menentukan via field hasil validasi dan ditandai dinamis.
type EditableRow = {
  id: string;
  rowNumber: number;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

export const DATE_INTERNAL_FIELDS = new Set<string>([]);
export const REQUIRED_INTERNAL_FIELDS = new Set(["formulaName", "branchName", "adjustmentAccountNo", "itemType", "itemNo", "itemUnitName"]);

const FIELD_HINTS: Record<string, string> = {
  formulaName: "Baris dengan nama sama digabung jadi 1 Formula",
  branchName: "Nama cabang PERSIS seperti di Accurate",
  warehouseName: "Untuk baris BB = Gudang Bahan Baku, untuk baris BJ = Gudang Barang Jadi",
  adjustmentAccountNo: "Kode Akun Perantara PERSIS seperti di Accurate",
  itemType: "BB = Bahan Baku, BJ = Barang Jadi (tepat 1 baris BJ per Formula)",
  itemNo: "Kode barang PERSIS seperti di Accurate",
  quantity: "WAJIB untuk baris BB (takaran per 1 unit Barang Jadi) — tidak dipakai untuk baris BJ",
  unitCost: "Hanya berlaku di baris BJ — biaya produksi per unit",
};

export function FormulaImportEditRowDialog({
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

  function openDialog() {
    setValues(Object.fromEntries(columns.map((col) => [col, String(row.rawData[col] ?? "")])));
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
    setSubmitting(true);
    const res = await api.autoproduksi["import-formula"]({ batchId }).rows({ rowId: row.id }).put({ rawData: values });
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string; fields?: string[] } | undefined;
      if (value?.code === "MISSING_REQUIRED_VALUES") {
        const cols = (value.fields ?? []).map((f) => fieldToColumn[f] ?? f);
        setMissingColumns(new Set(cols));
        setError(`${cols.length} kolom belum valid — lihat tanda merah di bawah.`);
      } else {
        setMissingColumns(new Set());
        setError("Gagal menyimpan perubahan — coba lagi.");
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
      <button type="button" onClick={openDialog} title="Edit" aria-label={`Edit baris ${row.rowNumber}`} className={buttonVariants("ghost", "h-8 w-8 p-0")}>
        <Pencil className="h-4 w-4" />
      </button>
      <DialogContent className="max-w-lg">
        <DialogTitle>Edit Baris {row.rowNumber}</DialogTitle>
        <div ref={scrollRef} className="mt-3 flex max-h-[70vh] flex-col gap-3 overflow-y-auto text-sm">
          {row.errorMessage && (
            <p className="rounded-md bg-destructive-bg px-3 py-2 text-destructive">
              <strong>Error terakhir:</strong> {row.errorMessage}
            </p>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive-bg px-3 py-2 font-medium text-destructive">
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
                  placeholder={FIELD_HINTS[internalField]}
                  aria-invalid={isMissing}
                  className={isMissing ? "border-destructive bg-destructive-bg/40 focus:border-destructive focus:ring-destructive/10" : isRequired ? "border-foreground/25" : undefined}
                />
                {isMissing && <span className="text-xs text-destructive">Belum valid.</span>}
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
