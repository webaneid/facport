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

// § architecture-sales-return.md, Fase 124 — retur terhadap transaksi
// yang sudah ada (Sales Invoice/Delivery Order/tanpa acuan, ditentukan
// "Return Type"). TIDAK auto-create customer/item. "Return Type" WAJIB
// salah satu: DELIVERY, INVOICE, INVOICE_DP, NO_INVOICE — DELIVERY
// butuh "Delivery Order No", INVOICE/INVOICE_DP butuh "Invoice No".
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Transaction Date (wajib)" },
  { value: "number", label: "Retur No (opsional — kunci gabung baris kalau diisi)" },
  { value: "customerNo", label: "Customer No (wajib)" },
  { value: "returnType", label: "Return Type (wajib — DELIVERY / INVOICE / INVOICE_DP / NO_INVOICE)" },
  { value: "invoiceNumber", label: "Invoice No (wajib kalau Return Type = INVOICE/INVOICE_DP)" },
  { value: "deliveryOrderNumber", label: "Delivery Order No (wajib kalau Return Type = DELIVERY)" },
  { value: "taxDate", label: "Tax Date (wajib)" },
  { value: "taxNumber", label: "Tax Number (wajib)" },
  { value: "toAddress", label: "To Address" },
  { value: "description", label: "Transaction Description" },
  { value: "branchName", label: "Branch Name (wajib)" },
  { value: "currencyCode", label: "Currency Code" },
  { value: "rate", label: "Rate" },
  { value: "fiscalRate", label: "Fiscal Rate" },
  { value: "cashDiscount", label: "Cash Disc" },
  { value: "cashDiscPercent", label: "Cash Disc Percent" },
  { value: "returnStatusType", label: "Return Status Type (dokumen)" },
  { value: "paymentTermName", label: "Payment Term Name" },
  { value: "taxable", label: "Taxable (isi TRUE/FALSE)" },
  { value: "inclusiveTax", label: "Inclusive Tax (isi TRUE/FALSE)" },
  { value: "fobName", label: "FOB Name" },
  { value: "shipmentName", label: "Shipment Name" },
  { value: "attributHeaderKarakter1", label: "Header - CF1" },
  { value: "attributHeaderKarakter2", label: "Header - CF2" },
  { value: "attributHeaderKarakter3", label: "Header - CF3" },
  { value: "attributHeaderTanggal1", label: "Header - DF1" },
  { value: "attributHeaderTanggal2", label: "Header - DF2" },
  { value: "itemNo", label: "Item No (wajib)" },
  { value: "itemName", label: "Item Name" },
  { value: "unitPrice", label: "Item Unit Price (wajib)" },
  { value: "quantity", label: "Item Qty (wajib)" },
  { value: "itemUnitName", label: "Item Unit Name (wajib)" },
  { value: "itemNotes", label: "Item Note" },
  { value: "itemReturnStatusType", label: "Item Return Status Type (baris)" },
  { value: "projectNo", label: "Item Project No" },
  { value: "departmentName", label: "Item Department" },
  { value: "warehouseName", label: "Item Warehouse" },
  { value: "itemCashDiscount", label: "Item Cash Discount" },
  { value: "itemDiscPercent", label: "Item Cash Disc Percent" },
  { value: "useTax1", label: "Item PPN (VAT) (isi TRUE/FALSE)" },
  { value: "useTax2", label: "Item PPNMB (isi TRUE/FALSE)" },
  { value: "useTax3", label: "Item PPH (isi TRUE/FALSE)" },
  { value: "attribut1", label: "Item CLS1" },
  { value: "attribut2", label: "Item CLS2" },
  { value: "attribut3", label: "Item CLS3" },
  { value: "itemSerialNo", label: "Item Serial No (wajib bersama Item Serial Number Qty)" },
  { value: "itemSerialQty", label: "Item Serial Number Qty (wajib bersama Item Serial No)" },
  { value: "itemSerialExpDate", label: "Item Serial Number Exp Date" },
  { value: "expenseAccountNo", label: "Expense Account No (wajib bersama Expense Amount)" },
  { value: "expenseName", label: "Expense Name" },
  { value: "expenseAmount", label: "Expense Amount (wajib bersama Expense Account No)" },
  { value: "expenseNotes", label: "Expense Note" },
  { value: "expenseDepartmentName", label: "Expense Department" },
  { value: "expenseSalesOrderNo", label: "Expense Sales Order No" },
  { value: "expenseSalesQuotationNo", label: "Expense Sales Quotation No" },
  { value: "expenseKategoriKeuangan1", label: "Expense CLS1" },
  { value: "expenseKategoriKeuangan2", label: "Expense CLS2" },
  { value: "expenseKategoriKeuangan3", label: "Expense CLS3" },
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

export default function SalesReturnImportPage() {
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
    const res = await api["sales-return"].import.upload.post({ file });
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

    const res = await api["sales-return"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/sales-return/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Sales Return</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi Retur Penjualan. Customer dan Barang TIDAK dibuatkan otomatis — pastikan keduanya
          sudah terdaftar di Accurate. Kolom &quot;Return Type&quot; menentukan dokumen acuan retur ini.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/sales-return/import/template`}
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
