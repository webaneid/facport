"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § mirror `components/purchase-invoice/edit-row-dialog.tsx`, DISEDERHANAKAN
// — TIDAK ada prop/peringatan "siblingRowNumbers" seperti versi Purchase
// Invoice/Sales Invoice, TAPI itu soal BEDA konteks "grouping": PI/SI
// warning-nya untuk BARIS ITEM dalam 1 FAKTUR yang sama (Bill No/Trans
// No sama). Modul ini (§ Fase 50) PUNYA grouping juga, tapi levelnya
// beda — banyak FAKTUR BEDA digabung jadi 1 PEMBAYARAN (`paymentNumber`,
// § `purchase-payment.mapping.ts`) — dialog ini SENGAJA belum kasih
// peringatan serupa untuk itu (kalau vendorNo diedit tidak konsisten
// dengan baris lain 1 grup pembayaran, baru ketahuan lewat error server
// `validateGroupVendorConsistencyForPayment` saat retry, bukan proaktif
// di dialog ini) — gap UX kecil, dicatat, bukan bug yang mengubah data.
type EditableRow = {
  id: string;
  rowNumber: number;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

// § HARUS SINKRON dengan `purchasePaymentMapping` di
// `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts`.
// § Fase 89 (2026-09-10) — "chequeDate" ditambahkan ke DATE_INTERNAL_FIELDS.
export const DATE_INTERNAL_FIELDS = new Set(["transDate", "chequeDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
// § Fase 90 (2026-09-10) — "branchName" DIJADIKAN WAJIB, dikonfirmasi
// test call nyata ke Accurate (company multi-cabang menolak transaksi
// tanpa branch eksplisit).
export const REQUIRED_INTERNAL_FIELDS = new Set(["vendorNo", "bankNo", "chequeAmount", "transDate", "invoiceNo", "branchName"]);

const FIELD_HINTS: Record<string, string> = {
  vendorNo: "Kode Pemasok di Accurate, contoh: V.00001",
  bankNo: "Kode Akun Bank/Kas (COA) di Accurate, contoh: 1-10200",
  chequeAmount: "Contoh: 5000000 (angka saja, tanpa titik/koma)",
  invoiceNo: "Nomor Faktur Pembelian yang SUDAH ADA di Accurate",
  paymentMethod: "Tunai/Cek-Giro/Transfer Bank/EDC/Kartu Debit/Kartu Kredit/QRIS/Payment Link/Virtual Account/Dompet Digital/Non Tunai Lainnya",
  paidPph: "Isi \"Y\" atau kosongkan",
  taxId: "Nama pajak PERSIS seperti di Accurate, contoh: Jasa Kebersihan (opsional, divalidasi ke Accurate)",
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
    const res = await api["purchase-payment"].import({ batchId }).rows({ rowId: row.id }).put({ rawData: values });
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
