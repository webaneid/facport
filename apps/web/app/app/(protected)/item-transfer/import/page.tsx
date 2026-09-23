"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TruncateText } from "@/components/ui/truncate-text";
import { api } from "@/lib/api-client";
import { getProdApiOrigin } from "@/lib/get-prod-api-origin";
import { AccurateRequiredNotice } from "@/components/accurate/accurate-gate-provider";

// § architecture-item-transfer.md, Fase 134 — Pindah Gudang, panggil API
// yang SAMA dengan modul kembaran "Item Requisition". TIDAK auto-create
// item (dikirim apa adanya). "Item Requisition No"/"Note Penting" TIDAK
// PUNYA field Accurate sendiri — digabung otomatis ke "Keterangan".
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Tanggal (wajib)" },
  { value: "number", label: "No. Item Transfer (wajib — kunci gabung baris)" },
  { value: "itemTransferType", label: "Tipe Transfer (wajib — TRANSFER_IN atau TRANSFER_OUT)" },
  { value: "branchName", label: "Branch Name (wajib)" },
  { value: "description", label: "Keterangan" },
  { value: "differenceAccountNo", label: "Difference Item Transfer Acc No" },
  { value: "fromTransferNo", label: "From Item Transfer No" },
  { value: "saveAsStatus", label: "Save As Status" },
  { value: "warehouseName", label: "Gudang Asal" },
  { value: "referenceWarehouseName", label: "Gudang Tujuan" },
  { value: "itemNo", label: "Item No (wajib)" },
  { value: "itemName", label: "Item Name" },
  { value: "quantity", label: "Qty (wajib)" },
  { value: "itemUnitName", label: "Unit (wajib)" },
  { value: "itemNotes", label: "Item Notes" },
  { value: "departmentName", label: "Item Dept" },
  { value: "projectNo", label: "Item Project No" },
  { value: "salesOrderNumber", label: "Item Sales Order No" },
  { value: "requisitionNo", label: "Item Requisition No (digabung ke Keterangan)" },
  { value: "attribut1", label: "Item Cls1" },
  { value: "attribut2", label: "Item Cls2" },
  { value: "attribut3", label: "Item Cls3" },
  { value: "serialNo", label: "Serial No" },
  { value: "serialQty", label: "Serial Qty" },
  { value: "serialExpDate", label: "Serial ExpDate" },
  { value: "notePenting", label: "Note Penting (digabung ke Keterangan)" },
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

export default function ItemTransferImportPage() {
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
  } = useForm<Record<string, string>>();

  async function onUpload(values: UploadValues) {
    setError(null);
    const file = values.file!;
    const res = await api["item-transfer"].import.upload.post({ file });
    if (res.error || !res.data) {
      // § diminta client 2026-09-23 — SEBELUM ini cuma bedakan EMPTY_FILE, kode LAIN (termasuk TOO_MANY_ROWS,
      // ditemukan client upload file besar kena batas baris) jatuh ke pesan generik yang menyesatkan ("cek format
      // file", padahal file-nya valid). Tiap kode server (§ {module}-import.route.ts) sekarang punya pesan sendiri.
      const value = res.error?.value as { code?: string; maxRows?: number } | undefined;
      setError(
        value?.code === "EMPTY_FILE"
          ? "File Excel kosong — tidak ada baris data."
          : value?.code === "TOO_MANY_ROWS"
            ? `File terlalu banyak baris — maksimal ${value.maxRows ?? 5000} baris per upload. Pecah file jadi beberapa batch.`
            : value?.code === "INVALID_EXCEL_FILE"
              ? "File tidak bisa dibaca sebagai Excel — pastikan formatnya .xlsx/.xls dan tidak korup."
              : "Upload gagal, cek format file.",
      );
      return;
    }
    setResult(res.data as unknown as UploadResult);
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

    const res = await api["item-transfer"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/item-transfer/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AccurateRequiredNotice />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Item Transfer</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Pindah Gudang. Barang TIDAK dibuatkan otomatis — pastikan sudah terdaftar di
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
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/item-transfer/import/template`}
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
