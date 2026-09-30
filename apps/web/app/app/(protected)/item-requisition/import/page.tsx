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
import { AccurateRequiredNotice } from "@/components/accurate/accurate-gate-provider";

// § architecture-item-requisition.md, Fase 164 — REBUILD TOTAL. Modul
// ini panggil `/api/purchase-requisition/save.do` (Permintaan Barang),
// BUKAN lagi kembaran "Item Transfer" — draft client yang dipakai
// sebelumnya salah. TIDAK auto-create item (dikirim apa adanya).
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Transaction Date (wajib)" },
  { value: "number", label: "Transaction No (wajib — kunci gabung baris)" },
  { value: "requisitionType", label: "Requisition Type (wajib — PURCHASE atau TRANSFER)" },
  { value: "saveAsStatusType", label: "Save as Status Type (wajib — APPROVED atau DRAFT)" },
  { value: "branchName", label: "Branch Name" },
  { value: "warehouseName", label: "Warehouse" },
  { value: "description", label: "Description" },
  { value: "itemNo", label: "Item No (wajib)" },
  { value: "itemName", label: "Item Name" },
  { value: "unitPrice", label: "Item Price (kosong = 0)" },
  { value: "quantity", label: "Qty (wajib)" },
  { value: "itemUnitName", label: "Item Unit Name" },
  { value: "itemDetailNotes", label: "Item Detail Notes" },
  { value: "requiredDate", label: "Item Req Date (kosong = pakai Transaction Date)" },
  { value: "itemCashDisc", label: "Item Cash Disc" },
  { value: "itemCashDiscPercent", label: "Item Cash Disc Percent" },
  { value: "departmentName", label: "Department Name" },
  { value: "projectNo", label: "Project No" },
  { value: "ppn", label: "PPN (isi \"Y\" kalau kena)" },
  { value: "ppnbm", label: "PPnBM (isi \"Y\" kalau kena)" },
  { value: "pph", label: "PPH (isi \"Y\" kalau kena)" },
  { value: "attribut1", label: "Item CLS1" },
  { value: "attribut2", label: "Item CLS2" },
  { value: "attribut3", label: "Item CLS3" },
  { value: "attributTambahan1", label: "Atribut Tambahan 1 (Karakter)" },
  { value: "attributTambahan2", label: "Atribut Tambahan 2 (Karakter)" },
  { value: "attributTambahan3", label: "Atribut Tambahan 3 (Karakter)" },
  { value: "attributTambahan4", label: "Atribut Tambahan 4 (Karakter)" },
  { value: "attributTambahan5", label: "Atribut Tambahan 5 (Karakter)" },
  { value: "attributTambahan6", label: "Atribut Tambahan 6 (Karakter)" },
  { value: "attributTambahan7", label: "Atribut Tambahan 7 (Karakter)" },
  { value: "attributTambahan8", label: "Atribut Tambahan 8 (Karakter)" },
  { value: "attributTambahan9", label: "Atribut Tambahan 9 (Karakter)" },
  { value: "attributTambahan10", label: "Atribut Tambahan 10 (Karakter)" },
  { value: "attributNumber1", label: "Atribut Number 1 (Angka)" },
  { value: "attributNumber2", label: "Atribut Number 2 (Angka)" },
  { value: "attributNumber3", label: "Atribut Number 3 (Angka)" },
  { value: "attributNumber4", label: "Atribut Number 4 (Angka)" },
  { value: "attributNumber5", label: "Atribut Number 5 (Angka)" },
  { value: "attributNumber6", label: "Atribut Number 6 (Angka)" },
  { value: "attributNumber7", label: "Atribut Number 7 (Angka)" },
  { value: "attributNumber8", label: "Atribut Number 8 (Angka)" },
  { value: "attributNumber9", label: "Atribut Number 9 (Angka)" },
  { value: "attributNumber10", label: "Atribut Number 10 (Angka)" },
  { value: "attributTanggal1", label: "Atribut Tanggal 1" },
  { value: "attributTanggal2", label: "Atribut Tanggal 2" },
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

export default function ItemRequisitionImportPage() {
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
    const res = await api["item-requisition"].import.upload.post({ file });
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

    const res = await api["item-requisition"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
    setConfirming(false);
    if (res.error) {
      const value = res.error.value as ImportActionErrorValue | undefined;
      setError(describeImportActionError(value, "Gagal konfirmasi mapping."));
      return;
    }
    router.push(`/item-requisition/import/${result.batchId}`);
  }

  const mappedCount = result ? result.excelColumns.filter((col) => result.suggestedMapping[col]).length : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AccurateRequiredNotice />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Item Requisition</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Permintaan Barang. Barang TIDAK dibuatkan otomatis — pastikan sudah terdaftar di
          Accurate sebelum import.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/item-requisition/import/template`}
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
