"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TruncateText } from "@/components/ui/truncate-text";
import { api } from "@/lib/api-client";
import { describeImportActionError, type ImportActionErrorValue } from "@/lib/import-error-message";
import { getProdApiOrigin } from "@/lib/get-prod-api-origin";

// § architecture-autoproduksi.md — Import Formula (Excel). TIDAK
// memanggil Accurate, diproses SYNCHRONOUS — begitu confirm selesai,
// batch SUDAH `completed`/`completed_with_errors` (bukan `processing`).
// Duplikat Nama Resep/Formula DIBOLEHKAN (keputusan eksplisit user) —
// setiap grup valid SELALU bikin Formula baru.
// § Fase 168 (diminta client) — Cabang/Gudang/Nomor Project/Departemen
// DIHAPUS dari modul ini (pindah ke Import Produksi) — Formula sekarang
// murni resep, dipakai lintas cabang/gudang.
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "formulaName", label: "Nama Resep/Formula (wajib)" },
  { value: "adjustmentAccountNo", label: "Akun Perantara (wajib)" },
  { value: "itemType", label: "Tipe Barang: BB/BJ (wajib)" },
  { value: "itemNo", label: "Nomor Item (wajib)" },
  { value: "itemName", label: "Nama Item" },
  { value: "quantity", label: "Jumlah (wajib untuk baris BB)" },
  { value: "itemUnitName", label: "Nama Unit (wajib)" },
  { value: "unitCost", label: "Unit Cost (hanya baris BJ)" },
] as const;

const uploadSchema = z.object({
  file: z.custom<File | undefined>().refine((file) => file instanceof File, "Pilih 1 file Excel (.xlsx) dulu"),
});
type UploadValues = z.infer<typeof uploadSchema>;

type UploadResult = {
  batchId: string;
  totalRows: number;
  excelColumns: string[];
  previewRows: Record<string, unknown>[];
  suggestedMapping: Record<string, string>;
};

export default function AutoproduksiFormulaImportPage() {
  const router = useRouter();
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const {
    control: uploadControl,
    handleSubmit: handleUploadSubmit,
    formState: { isSubmitting: uploading, errors: uploadErrors },
  } = useForm<UploadValues>({ resolver: zodResolver(uploadSchema) });

  const {
    control: mappingControl,
    handleSubmit: handleMappingSubmit,
    getValues,
    reset: resetMapping,
  } = useForm<Record<string, string>>();

  async function onUpload(values: UploadValues) {
    setError(null);
    const file = values.file!;
    const res = await api.autoproduksi["import-formula"].upload.post({ file });
    if (res.error || !res.data) {
      const value = res.error?.value as { code?: string; maxRows?: number } | undefined;
      setError(
        value?.code === "EMPTY_FILE"
          ? "File Excel kosong — tidak ada baris data."
          : value?.code === "TOO_MANY_ROWS"
            ? `File terlalu banyak baris — maksimal ${value.maxRows ?? 10000} baris per upload. Pecah file jadi beberapa batch.`
            : value?.code === "INVALID_EXCEL_FILE"
              ? "File tidak bisa dibaca sebagai Excel — pastikan formatnya .xlsx/.xls dan tidak korup."
              : "Upload gagal, cek format file.",
      );
      return;
    }
    const uploadResult = res.data as unknown as UploadResult;
    setResult(uploadResult);
    // § WAJIB — accordion "Cocokkan Kolom" tertutup by default, Radix unmount isinya saat tertutup (§ purchase-order/import/page.tsx).
    resetMapping(uploadResult.suggestedMapping);
  }

  async function onConfirmMapping() {
    if (!result) return;
    setConfirming(true);
    setError(null);
    const columnMapping: Record<string, string> = {};
    for (const col of result.excelColumns) {
      const field = getValues(col);
      if (field) columnMapping[col] = field;
    }

    const res = await api.autoproduksi["import-formula"]({ batchId: result.batchId }).confirm.post({ columnMapping });
    setConfirming(false);
    if (res.error) {
      const value = res.error.value as ImportActionErrorValue | undefined;
      setError(describeImportActionError(value, "Gagal konfirmasi mapping."));
      return;
    }
    router.push(`/autoproduksi/import-formula/${result.batchId}`);
  }

  const mappedCount = result ? result.excelColumns.filter((col) => result.suggestedMapping[col]).length : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Formula dari Excel</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi daftar Formula (resep). Baris dengan Nama Resep/Formula yang sama digabung jadi 1
          Formula. Nama Formula harus unik: nama yang sudah dipakai Formula lain (tak peka huruf besar/kecil) ditolak — setiap Formula wajib tepat 1 baris Tipe Barang=BJ (Barang Jadi) dan minimal 1 baris Tipe
          Barang=BB (Bahan Baku). Tidak ada panggilan ke Accurate di langkah ini — Formula tersimpan lokal dulu,
          divalidasi ke Accurate nanti saat Input Produksi.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/autoproduksi/import-formula/template`}
                className="text-primary-600 underline hover:text-primary-700"
              >
                Download template Excel
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUploadSubmit(onUpload)} className="flex flex-col gap-3">
              <Controller
                control={uploadControl}
                name="file"
                render={({ field }) => (
                  <FileDropzone value={field.value} onChange={field.onChange} accept=".xlsx,.xls" hint="Format .xlsx atau .xls, maks 10MB" error={!!uploadErrors.file} />
                )}
              />
              {uploadErrors.file && <p className="text-sm text-destructive">{uploadErrors.file.message}</p>}
              <Button type="submit" disabled={uploading} className="self-start">
                {uploading ? "Mengunggah..." : "Upload"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>2. Cocokkan Kolom</CardTitle>
            <CardDescription>{result.totalRows} baris terdeteksi dari file Excel.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMappingSubmit(onConfirmMapping)} className="flex flex-col gap-4">
              <Accordion type="single" collapsible>
                <AccordionItem value="mapping" className="border-none">
                  <AccordionTrigger className="rounded-lg border border-border/60 px-4 py-3 hover:no-underline">
                    <span className="flex flex-col items-start gap-0.5 text-left">
                      <span>Cocokkan Kolom Manual (opsional)</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {mappedCount} dari {result.excelColumns.length} kolom sudah otomatis terpetakan — buka kalau mau cek/ubah.
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0 pt-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[35%]">Kolom Excel</TableHead>
                          <TableHead className="w-[65%]">Field</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.excelColumns.map((col) => (
                          <TableRow key={col}>
                            <TableCell className="font-medium text-foreground">
                              <TruncateText>{col}</TruncateText>
                            </TableCell>
                            <TableCell>
                              <Controller
                                control={mappingControl}
                                name={col}
                                defaultValue={result.suggestedMapping[col] ?? ""}
                                render={({ field }) => <Combobox options={[...ACCURATE_FIELDS]} value={field.value} onChange={field.onChange} placeholder="(tidak dipetakan)" />}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <Button type="submit" disabled={confirming} className="self-start">
                {confirming ? "Memproses..." : "Proses Import"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
