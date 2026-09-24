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

// § architecture-purchase-return.md, Fase 122 — retur terhadap
// transaksi yang sudah ada (Purchase Invoice/Receive Item/tanpa acuan,
// ditentukan "Return Type"). TIDAK auto-create vendor/item. "Return
// Type" WAJIB salah satu: INVOICE, INVOICE_DP, RECEIVE, NO_INVOICE —
// INVOICE/INVOICE_DP butuh "Invoice No", RECEIVE butuh "Receive Item No".
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Date (wajib)" },
  { value: "number", label: "TransNo (opsional — kunci gabung baris kalau diisi)" },
  { value: "vendorNo", label: "Vendor No (wajib)" },
  { value: "returnType", label: "Return Type (wajib — INVOICE / INVOICE_DP / RECEIVE / NO_INVOICE)" },
  { value: "invoiceNumber", label: "Invoice No (wajib kalau Return Type = INVOICE/INVOICE_DP)" },
  { value: "receiveItemNumber", label: "Receive Item No (wajib kalau Return Type = RECEIVE)" },
  { value: "taxDate", label: "Tax Date (wajib)" },
  { value: "taxNumber", label: "Tax Num (wajib)" },
  { value: "toAddress", label: "To Address" },
  { value: "branchName", label: "Branch (wajib)" },
  { value: "description", label: "Notes" },
  { value: "cashDiscount", label: "Cash Disc" },
  { value: "cashDiscPercent", label: "Cash Disc %" },
  { value: "currencyCode", label: "Currency Code" },
  { value: "rate", label: "Rate" },
  { value: "fiscalRate", label: "Fiscal Rate" },
  { value: "fobName", label: "FOB" },
  { value: "taxable", label: "Taxable (isi TRUE/FALSE)" },
  { value: "inclusiveTax", label: "Include Tax (isi TRUE/FALSE)" },
  { value: "paymentTermName", label: "Pay Term" },
  { value: "shipmentName", label: "Shipment Name" },
  { value: "itemNo", label: "Item No (wajib)" },
  { value: "itemName", label: "Item Name" },
  { value: "quantity", label: "Item Qty (wajib)" },
  { value: "itemUnitName", label: "Item Unit Name (wajib)" },
  { value: "unitPrice", label: "Item Price (wajib)" },
  { value: "itemNotes", label: "Item Notes" },
  { value: "departmentName", label: "Item Department" },
  { value: "projectNo", label: "Item Project No" },
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
  { value: "expenseAccountNo", label: "Expense Acc No (wajib bersama Expense Amount)" },
  { value: "expenseName", label: "Expense Name" },
  { value: "expenseAmount", label: "Expense Amount (wajib bersama Expense Acc No)" },
  { value: "expenseNotes", label: "Expense Notes" },
  { value: "expenseDepartmentName", label: "Expense Department" },
  { value: "expenseKategoriKeuangan1", label: "EXPENSE: Finance Category 1" },
  { value: "expenseKategoriKeuangan2", label: "EXPENSE: Finance Category 2" },
  { value: "expenseKategoriKeuangan3", label: "EXPENSE: Finance Category 3" },
  { value: "expenseKategoriKeuangan4", label: "EXPENSE: Finance Category 4" },
  { value: "expenseKategoriKeuangan5", label: "EXPENSE: Finance Category 5" },
  { value: "expenseKategoriKeuangan6", label: "EXPENSE: Finance Category 6" },
  { value: "expenseKategoriKeuangan7", label: "EXPENSE: Finance Category 7" },
  { value: "expenseKategoriKeuangan8", label: "EXPENSE: Finance Category 8" },
  { value: "expenseKategoriKeuangan9", label: "EXPENSE: Finance Category 9" },
  { value: "expenseKategoriKeuangan10", label: "EXPENSE: Finance Category 10" },
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

export default function PurchaseReturnImportPage() {
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
    const res = await api["purchase-return"].import.upload.post({ file });
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

    const res = await api["purchase-return"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/purchase-return/import/${result.batchId}`);
  }

  const mappedCount = result ? result.excelColumns.filter((col) => result.suggestedMapping[col]).length : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AccurateRequiredNotice />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Purchase Return</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Retur Pembelian. Vendor dan Barang TIDAK dibuatkan otomatis — pastikan keduanya sudah
          terdaftar di Accurate. Kolom &quot;Return Type&quot; menentukan dokumen acuan retur ini.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/purchase-return/import/template`}
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
