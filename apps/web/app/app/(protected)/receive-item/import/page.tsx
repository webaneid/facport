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
import { api } from "@/lib/api-client";
import { getProdApiOrigin } from "@/lib/get-prod-api-origin";

// § architecture-receive-item.md, Fase 121 — dokumen LANJUTAN dalam
// rantai procurement (Purchase Order → Receive Item → Purchase Invoice
// → Purchase Payment), bukti FISIK barang diterima dari vendor. BEDA
// dari Purchase Order: TIDAK auto-create vendor/item (dikirim apa
// adanya), TIDAK ada Expense sama sekali. "Receive Number" (nomor surat
// jalan VENDOR) WAJIB — sekaligus kunci penggabungan baris, BUKAN "Trans
// Number" (nomor internal Accurate, opsional).
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Date (wajib)" },
  { value: "vendorNo", label: "Vendor No (wajib)" },
  { value: "receiveNumber", label: "Receive Number (wajib — kunci gabung baris, nomor surat jalan vendor)" },
  { value: "number", label: "Trans Number (nomor internal Accurate, opsional)" },
  { value: "currencyCode", label: "Currency Code" },
  { value: "description", label: "Description" },
  { value: "fobName", label: "FOB Name" },
  { value: "shipmentName", label: "Shipment Name" },
  { value: "shipDate", label: "Shipment Date" },
  { value: "toAddress", label: "To Address" },
  { value: "branchName", label: "Branch Name (wajib)" },
  { value: "attributHeaderKarakter1", label: "Custom Character 1" },
  { value: "attributHeaderKarakter2", label: "Custom Character 2" },
  { value: "attributHeaderKarakter3", label: "Custom Character 3" },
  { value: "attributHeaderKarakter4", label: "Custom Character 4" },
  { value: "attributHeaderKarakter5", label: "Custom Character 5" },
  { value: "attributHeaderKarakter6", label: "Custom Character 6" },
  { value: "attributHeaderKarakter7", label: "Custom Character 7" },
  { value: "attributHeaderKarakter8", label: "Custom Character 8" },
  { value: "attributHeaderKarakter9", label: "Custom Character 9" },
  { value: "attributHeaderKarakter10", label: "Custom Character 10" },
  { value: "attributHeaderAngka1", label: "Custom Number 1" },
  { value: "attributHeaderAngka2", label: "Custom Number 2" },
  { value: "attributHeaderAngka3", label: "Custom Number 3" },
  { value: "attributHeaderAngka4", label: "Custom Number 4" },
  { value: "attributHeaderAngka5", label: "Custom Number 5" },
  { value: "attributHeaderAngka6", label: "Custom Number 6" },
  { value: "attributHeaderAngka7", label: "Custom Number 7" },
  { value: "attributHeaderAngka8", label: "Custom Number 8" },
  { value: "attributHeaderAngka9", label: "Custom Number 9" },
  { value: "attributHeaderAngka10", label: "Custom Number 10" },
  { value: "attributHeaderTanggal1", label: "Custom Date 1" },
  { value: "attributHeaderTanggal2", label: "Custom Date 2" },
  { value: "itemNo", label: "Item No (wajib)" },
  { value: "itemName", label: "Item Name" },
  { value: "quantity", label: "Quantity (wajib)" },
  { value: "itemUnitName", label: "Unit Name (wajib)" },
  { value: "unitPrice", label: "Item Price (wajib)" },
  { value: "warehouseName", label: "Item Warehouse" },
  { value: "departmentName", label: "ITEM: Department" },
  { value: "projectNo", label: "ITEM: Project No" },
  { value: "itemNotes", label: "ITEM: Description (catatan, BUKAN nama barang)" },
  { value: "purchaseOrderNumber", label: "ITEM: Purchase Order No (opsional, link ke PO terkait)" },
  { value: "attribut1", label: "ITEM: Finance Category 1" },
  { value: "attribut2", label: "ITEM: Finance Category 2" },
  { value: "attribut3", label: "ITEM: Finance Category 3" },
  { value: "attribut4", label: "ITEM: Finance Category 4" },
  { value: "attribut5", label: "ITEM: Finance Category 5" },
  { value: "attribut6", label: "ITEM: Finance Category 6" },
  { value: "attribut7", label: "ITEM: Finance Category 7" },
  { value: "attribut8", label: "ITEM: Finance Category 8" },
  { value: "attribut9", label: "ITEM: Finance Category 9" },
  { value: "attribut10", label: "ITEM: Finance Category 10" },
  { value: "attributItemKarakter1", label: "ITEM: Custom Character 1" },
  { value: "attributItemKarakter2", label: "ITEM: Custom Character 2" },
  { value: "attributItemKarakter3", label: "ITEM: Custom Character 3" },
  { value: "attributItemKarakter4", label: "ITEM: Custom Character 4" },
  { value: "attributItemKarakter5", label: "ITEM: Custom Character 5" },
  { value: "attributItemKarakter6", label: "ITEM: Custom Character 6" },
  { value: "attributItemKarakter7", label: "ITEM: Custom Character 7" },
  { value: "attributItemKarakter8", label: "ITEM: Custom Character 8" },
  { value: "attributItemKarakter9", label: "ITEM: Custom Character 9" },
  { value: "attributItemKarakter10", label: "ITEM: Custom Character 10" },
  { value: "attributItemKarakter11", label: "ITEM: Custom Character 11" },
  { value: "attributItemKarakter12", label: "ITEM: Custom Character 12" },
  { value: "attributItemKarakter13", label: "ITEM: Custom Character 13" },
  { value: "attributItemKarakter14", label: "ITEM: Custom Character 14" },
  { value: "attributItemKarakter15", label: "ITEM: Custom Character 15" },
  { value: "attributItemAngka1", label: "ITEM: Custom Number 1" },
  { value: "attributItemAngka2", label: "ITEM: Custom Number 2" },
  { value: "attributItemAngka3", label: "ITEM: Custom Number 3" },
  { value: "attributItemAngka4", label: "ITEM: Custom Number 4" },
  { value: "attributItemAngka5", label: "ITEM: Custom Number 5" },
  { value: "attributItemAngka6", label: "ITEM: Custom Number 6" },
  { value: "attributItemAngka7", label: "ITEM: Custom Number 7" },
  { value: "attributItemAngka8", label: "ITEM: Custom Number 8" },
  { value: "attributItemAngka9", label: "ITEM: Custom Number 9" },
  { value: "attributItemAngka10", label: "ITEM: Custom Number 10" },
  { value: "attributItemTanggal1", label: "ITEM: Custom Date 1" },
  { value: "attributItemTanggal2", label: "ITEM: Custom Date 2" },
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

export default function ReceiveItemImportPage() {
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
    const res = await api["receive-item"].import.upload.post({ file });
    if (res.error || !res.data) {
      const code = (res.error?.value as { code?: string } | undefined)?.code;
      setError(code === "EMPTY_FILE" ? "File Excel kosong — tidak ada baris data." : "Upload gagal, cek format file.");
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

    const res = await api["receive-item"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/receive-item/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Receive Item</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Penerimaan Barang dari vendor. Vendor dan Barang TIDAK dibuatkan otomatis — pastikan
          keduanya sudah terdaftar di Accurate sebelum import.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/receive-item/import/template`}
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
                    <TableHead>Kolom Excel</TableHead>
                    <TableHead>Field Accurate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.excelColumns.map((col) => (
                    <TableRow key={col}>
                      <TableCell className="font-medium text-foreground">{col}</TableCell>
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
