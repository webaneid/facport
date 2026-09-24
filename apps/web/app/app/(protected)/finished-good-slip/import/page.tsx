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

// § architecture-finished-good-slip.md, Fase 149 — Finished Good Slip (realisasi barang jadi dari Work Order). Grouping
// 2-level: 1 dokumen ("Trans No") bisa punya beberapa barang, dan 1 barang bisa punya beberapa nomor seri di baris
// terpisah (baris "lanjutan": Item No sama, kolom Qty/Portion dikosongkan) — § `manufacture-slip-shared.ts`.
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Trans Date (wajib)" },
  { value: "number", label: "Trans No (kunci gabung baris)" },
  { value: "workOrderNumber", label: "Work Order No (wajib)" },
  { value: "description", label: "Description" },
  { value: "branchName", label: "Branch Name (wajib — di-lookup ke Accurate)" },
  { value: "itemNo", label: "Item No (wajib per barang)" },
  { value: "itemName", label: "Item Name" },
  { value: "quantity", label: "Qty (wajib per barang)" },
  { value: "portion", label: "Portion (wajib per barang, persen 0-100)" },
  { value: "itemUnitName", label: "Unit Name" },
  { value: "itemNotes", label: "Item Note" },
  { value: "projectNo", label: "Project No" },
  { value: "departmentName", label: "Dept Name" },
  { value: "warehouseName", label: "Warehouse Name (wajib — di-lookup ke Accurate)" },
  { value: "kategoriKeuangan1", label: "CLS1" },
  { value: "kategoriKeuangan2", label: "CLS2" },
  { value: "kategoriKeuangan3", label: "CLS3" },
  { value: "kategoriKeuangan4", label: "CLS4" },
  { value: "kategoriKeuangan5", label: "CLS5" },
  { value: "serialNo", label: "Serial No" },
  { value: "serialQty", label: "Qty (Serial Number)" },
  { value: "serialExpDate", label: "Expired Date" },
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

export default function FinishedGoodSlipImportPage() {
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
    const res = await api["finished-good-slip"].import.upload.post({ file });
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

    const res = await api["finished-good-slip"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/finished-good-slip/import/${result.batchId}`);
  }

  const mappedCount = result ? result.excelColumns.filter((col) => result.suggestedMapping[col]).length : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AccurateRequiredNotice />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Finished Good Slip</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Finished Good Slip (realisasi pengambilan/pengembalian bahan baku dari Work Order). Barang dan
          Work Order TIDAK dibuatkan otomatis — pastikan sudah ada di Accurate sebelum import. 1 barang boleh punya
          beberapa nomor seri: isi baris tambahan dengan Trans No & Item No yang sama, kosongkan kolom Qty barang.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/finished-good-slip/import/template`}
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
