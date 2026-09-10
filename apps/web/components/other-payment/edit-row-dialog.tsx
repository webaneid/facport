"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § mirror `components/journal-voucher/edit-row-dialog.tsx`, TANPA XOR
// (modul ini tidak punya field debit/kredit semacam itu — semua
// requiredFields dicek apa adanya, "wajib berisi", bukan "wajib salah
// satu").
type EditableRow = {
  id: string;
  rowNumber: number;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

// § HARUS SINKRON dengan `otherPaymentMapping` di
// `apps/api/src/lib/import-mapping/other-payment.mapping.ts`.
export const DATE_INTERNAL_FIELDS = new Set(["transDate", "attributTanggal1", "attributTanggal2"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
export const REQUIRED_INTERNAL_FIELDS = new Set([
  "transDate",
  "transNo",
  "branchName",
  "bankNo",
  "payee",
  "lineAccountNo",
  "lineAmount",
  "lineExpenseName",
]);

const FIELD_HINTS: Record<string, string> = {
  transNo: "Nomor transaksi — kunci pengelompokan baris dalam 1 pembayaran, contoh: OP-001",
  branchName: "Nama cabang, contoh: JAKARTA",
  bankNo: "Kode Akun (COA) kas/bank sumber dana, contoh: 1-10200",
  payee: "Informasi penerima pembayaran, contoh: PLN",
  chequeNo: "Nomor cek/giro — kalau ada",
  description: "Catatan bebas untuk transaksi ini",
  rate: "Nilai tukar mata uang — isi kalau transaksi pakai mata uang asing",
  lineAccountNo: "Kode Akun (COA) beban baris ini, contoh: 6-30100",
  lineAmount: "Nominal beban baris ini — angka saja, tanpa titik/koma",
  lineExpenseName: "Nama/keterangan beban baris ini (\"Paid to\"), contoh: Pembayaran listrik",
  lineMemo: "Catatan bebas untuk baris ini",
  lineDepartmentName: "Nama departemen, harus PERSIS terdaftar di Accurate",
  lineProjectNo: "Kode proyek, harus PERSIS terdaftar di Accurate",
  attributTambahan1: "Atribut tambahan 1 (teks bebas) level transaksi",
  attributTambahan2: "Atribut tambahan 2, sama catatan di atas",
  attributTambahan3: "Atribut tambahan 3, sama catatan di atas",
  attributTambahan4: "Atribut tambahan 4, sama catatan di atas",
  attributTambahan5: "Atribut tambahan 5, sama catatan di atas",
  attributTambahan6: "Atribut tambahan 6, sama catatan di atas",
  attributTambahan7: "Atribut tambahan 7, sama catatan di atas",
  attributTambahan8: "Atribut tambahan 8, sama catatan di atas",
  attributTambahan9: "Atribut tambahan 9, sama catatan di atas",
  attributTambahan10: "Atribut tambahan 10, sama catatan di atas",
  attributNumber1: "Atribut angka 1 level transaksi",
  attributNumber2: "Atribut angka 2, sama catatan di atas",
  attributNumber3: "Atribut angka 3, sama catatan di atas",
  attributNumber4: "Atribut angka 4, sama catatan di atas",
  attributNumber5: "Atribut angka 5, sama catatan di atas",
  attributNumber6: "Atribut angka 6, sama catatan di atas",
  attributNumber7: "Atribut angka 7, sama catatan di atas",
  attributNumber8: "Atribut angka 8, sama catatan di atas",
  attributNumber9: "Atribut angka 9, sama catatan di atas",
  attributNumber10: "Atribut angka 10, sama catatan di atas",
  attribut1: "Kategori Keuangan 1 (Data Classification), harus PERSIS terdaftar di Accurate",
  attribut2: "Kategori Keuangan 2, harus PERSIS terdaftar di Accurate",
  attribut3: "Kategori Keuangan 3, harus PERSIS terdaftar di Accurate",
  attribut4: "Kategori Keuangan 4, harus PERSIS terdaftar di Accurate",
  attribut5: "Kategori Keuangan 5, harus PERSIS terdaftar di Accurate",
  attribut6: "Kategori Keuangan 6, harus PERSIS terdaftar di Accurate",
  attribut7: "Kategori Keuangan 7, harus PERSIS terdaftar di Accurate",
  attribut8: "Kategori Keuangan 8, harus PERSIS terdaftar di Accurate",
  attribut9: "Kategori Keuangan 9, harus PERSIS terdaftar di Accurate",
  attribut10: "Kategori Keuangan 10, harus PERSIS terdaftar di Accurate",
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
      setError(`${clientMissing.size} kolom wajib belum diisi — lihat tanda merah di bawah.`);
      return;
    }

    setSubmitting(true);
    const res = await api["other-payment"].import({ batchId }).rows({ rowId: row.id }).put({ rawData: values });
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string; fields?: string[] } | undefined;
      if (value?.code === "MISSING_REQUIRED_VALUES") {
        const cols = (value.fields ?? []).map((f) => fieldToColumn[f] ?? f);
        setMissingColumns(new Set(cols));
        setError(`${cols.length} kolom wajib belum diisi — lihat tanda merah di bawah.`);
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
              <strong>Error terakhir:</strong> {row.errorMessage}
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
                {isMissing && <span className="text-xs text-destructive">Wajib diisi.</span>}
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
