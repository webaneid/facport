"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § dibahas 2026-08-28 — edit baris GAGAL langsung di aplikasi, tanpa
// upload ulang seluruh file: perbaiki nilai lalu pakai tombol "Retry
// baris gagal" yang sudah ada. Cuma dipasang di baris `status: "failed"`
// (§ [batchId]/page.tsx). Semua kolom yang ter-mapping ditampilkan
// (bukan cuma yang "sepertinya" jadi penyebab error) — pesan error
// Accurate teks bebas, tidak bisa diandalkan buat nebak kolom mana yang
// salah, jadi user butuh lihat & bisa ubah semuanya.
type EditableRow = {
  id: string;
  rowNumber: number;
  errorMessage: string | null;
  rawData: Record<string, unknown>;
};

export function EditRowDialog({
  batchId,
  row,
  columnMapping,
  siblingRowNumbers,
  onSaved,
}: {
  batchId: string;
  row: EditableRow;
  columnMapping: Record<string, string>;
  siblingRowNumbers: number[];
  onSaved: () => void;
}) {
  const columns = Object.keys(columnMapping);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setValues(Object.fromEntries(columns.map((col) => [col, String(row.rawData[col] ?? "")])));
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const res = await api["purchase-invoice"].import({ batchId }).rows({ rowId: row.id }).put({ rawData: values });
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string; fields?: string[] } | undefined;
      setError(
        value?.code === "MISSING_REQUIRED_VALUES"
          ? `Field wajib belum diisi: ${value.fields?.join(", ")}`
          : "Gagal menyimpan perubahan — coba lagi.",
      );
      return;
    }
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
        <div className="mt-3 flex max-h-[70vh] flex-col gap-3 overflow-y-auto text-sm">
          {row.errorMessage && (
            <p className="rounded-md bg-destructive-bg px-3 py-2 text-destructive">
              <strong>Error terakhir:</strong> {row.errorMessage}
            </p>
          )}
          {siblingRowNumbers.length > 0 && (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-warning">
              Baris ini satu faktur dengan baris {siblingRowNumbers.join(", ")} (Bill No sama) — Nomor Pemasok wajib
              sama persis dengan baris-baris itu, kalau tidak seluruh faktur ikut gagal.
            </p>
          )}
          {error && <p className="text-destructive">{error}</p>}
          {columns.map((col) => (
            <label key={col} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">{col}</span>
              <Input value={values[col] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [col]: e.target.value }))} />
            </label>
          ))}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
