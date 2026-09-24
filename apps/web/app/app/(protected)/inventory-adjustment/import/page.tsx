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
import { getProdApiOrigin } from "@/lib/get-prod-api-origin";
import { AccurateRequiredNotice } from "@/components/accurate/accurate-gate-provider";

// § architecture-inventory-adjustment.md, Fase 138 — Penyesuaian
// Persediaan. TIDAK auto-create item (dikirim apa adanya). "Tipe Adj"
// diterima dalam istilah Indonesia umum (Tambah/Kurang/Stok Opname dst)
// — dictionary lengkap di `inventory-adjustment.mapping.ts`.
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Tanggal (wajib)" },
  { value: "number", label: "No. Item Adjustment (kunci gabung baris)" },
  { value: "adjustmentAccountNo", label: "Adj Account No" },
  { value: "description", label: "Keterangan" },
  { value: "branchName", label: "Cabang (wajib)" },
  { value: "itemNo", label: "Item No (wajib)" },
  { value: "quantity", label: "Qty (wajib)" },
  { value: "itemUnitName", label: "Unit" },
  { value: "unitCost", label: "Unit Price" },
  { value: "warehouseName", label: "Gudang" },
  { value: "itemAdjustmentType", label: "Tipe Adj (wajib — Tambah/Kurang/Stok Opname)" },
  { value: "detailNotes", label: "Note Penting" },
  { value: "serialNo", label: "Serial No" },
  { value: "serialQty", label: "Serial Qty" },
  { value: "serialExpDate", label: "Serial ExpDate" },
  { value: "attributTambahan1", label: "Atribut Tambahan 1" },
  { value: "attributTambahan2", label: "Atribut Tambahan 2" },
  { value: "attributTambahan3", label: "Atribut Tambahan 3" },
  { value: "attributTambahan4", label: "Atribut Tambahan 4" },
  { value: "attributTambahan5", label: "Atribut Tambahan 5" },
  { value: "attributTambahan6", label: "Atribut Tambahan 6" },
  { value: "attributTambahan7", label: "Atribut Tambahan 7" },
  { value: "attributTambahan8", label: "Atribut Tambahan 8" },
  { value: "attributTambahan9", label: "Atribut Tambahan 9" },
  { value: "attributTambahan10", label: "Atribut Tambahan 10" },
  { value: "attributNumber1", label: "Atribut Number 1" },
  { value: "attributNumber2", label: "Atribut Number 2" },
  { value: "attributNumber3", label: "Atribut Number 3" },
  { value: "attributNumber4", label: "Atribut Number 4" },
  { value: "attributNumber5", label: "Atribut Number 5" },
  { value: "attributNumber6", label: "Atribut Number 6" },
  { value: "attributNumber7", label: "Atribut Number 7" },
  { value: "attributNumber8", label: "Atribut Number 8" },
  { value: "attributNumber9", label: "Atribut Number 9" },
  { value: "attributNumber10", label: "Atribut Number 10" },
  { value: "attributTanggal1", label: "Atribut Date 1" },
  { value: "attributTanggal2", label: "Atribut Date 2" },
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

export default function InventoryAdjustmentImportPage() {
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
    const res = await api["inventory-adjustment"].import.upload.post({ file });
    if (res.error || !res.data) {
      // § diminta client 2026-09-23 — SEBELUM ini cuma bedakan EMPTY_FILE, kode LAIN (termasuk TOO_MANY_ROWS,
      // ditemukan client upload file besar kena batas baris) jatuh ke pesan generik yang menyesatkan ("cek format
      // file", padahal file-nya valid). Tiap kode server (§ {module}-import.route.ts) sekarang punya pesan sendiri.
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
    // § diminta user 2026-09-24 — accordion "Cocokkan Kolom" TERTUTUP by default (rollout dari purchase-invoice,
    // § lessons-learned.md). WAJIB seed di sini (bukan cuma `defaultValue` per `Controller`) — accordion Radix
    // UNMOUNT isinya saat tertutup, jadi `Controller` yang defaultValue-nya bergantung pada dia ke-mount TIDAK
    // PERNAH register kalau user tidak pernah buka accordion-nya, dan submit akan kirim mapping KOSONG.
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

    const res = await api["inventory-adjustment"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
    setConfirming(false);
    if (res.error) {
      const value = res.error.value as { code?: string; fields?: string[]; remaining?: number; max?: number } | undefined;
      setError(
        value?.code === "MISSING_REQUIRED_FIELDS"
          ? `Field wajib belum dipetakan: ${value.fields?.join(", ")}`
          : value?.code === "TRIAL_ROW_LIMIT_EXCEEDED"
            ? `Kuota trial tidak cukup — sisa ${value.remaining} dari ${value.max} baris. Kurangi jumlah baris di file atau upgrade ke paket berbayar.`
            : "Gagal konfirmasi mapping.",
      );
      return;
    }
    router.push(`/inventory-adjustment/import/${result.batchId}`);
  }

  const mappedCount = result ? result.excelColumns.filter((col) => result.suggestedMapping[col]).length : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AccurateRequiredNotice />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Inventory Adjustment</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Penyesuaian Persediaan. Barang TIDAK dibuatkan otomatis — pastikan sudah
          terdaftar di Accurate sebelum import.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/inventory-adjustment/import/template`}
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
                  <FileDropzone
                    value={field.value}
                    onChange={field.onChange}
                    accept=".xlsx,.xls"
                    hint="Format .xlsx atau .xls, maks 10MB"
                    error={!!uploadErrors.file}
                  />
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
                          <TableHead className="w-[65%]">Field Accurate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.excelColumns.map((col) => (
                          <TableRow key={col}>
                            <TableCell className="font-medium text-foreground"><TruncateText>{col}</TruncateText></TableCell>
                            <TableCell>
                              <Controller
                                control={mappingControl}
                                name={col}
                                defaultValue={result.suggestedMapping[col] ?? ""}
                                render={({ field }) => (
                                  <Combobox
                                    options={[...ACCURATE_FIELDS]}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="(tidak dipetakan)"
                                  />
                                )}
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
                {confirming ? "Memulai import..." : "Mulai Import"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
