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

// § architecture-sales-receipt.md — aplikasi penerimaan pembayaran ke
// Faktur Penjualan yang SUDAH ADA di Accurate (customer & faktur WAJIB
// sudah terdaftar, TIDAK auto-create). § Fase 49 — 1 baris Excel = 1
// penerimaan = 1 faktur SECARA DEFAULT, TAPI bisa digabung jadi 1
// penerimaan yang bayar BANYAK faktur sekaligus kalau kolom "No. Sales
// Receipt" (`receiptNumber`) diisi sama di beberapa baris.
// § Fase 85 (2026-09-10, dikoreksi susunannya sebelum push) — URUTAN
// opsi di bawah SENGAJA mengikuti PERSIS urutan kolom sheet "NOTE"
// client (disalin dari template kompetitor `FACPORT_Sales Receipt_v5.xlsx`),
// BUKAN urutan "field lama dulu, field baru ditambah di akhir" yang
// biasa dipakai modul lain — permintaan eksplisit user supaya susunan
// Excel/dropdown sama dengan file yang sudah familiar bagi client.
// Detail lengkap 18 field baru (dikonfirmasi 4 sumber: spec resmi,
// template kompetitor, screenshot UI Accurate asli, dokumentasi resmi
// /api/tax) → architecture-sales-receipt.md § "Ekspansi Field Opsional
// — Fase 85".
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Tanggal (wajib)" },
  // § Fase 84 (2026-09-10) — field ini SUDAH ADA di backend sejak Fase
  // 49, tapi TIDAK PERNAH ditambahkan ke dropdown ini — cuma bisa
  // ke-mapping otomatis kalau nama kolom Excel PERSIS "No. Sales
  // Receipt"/"Nomor Penerimaan"/"No Penerimaan". Ditambahkan supaya
  // bisa dipetakan manual juga kalau client pakai nama kolom lain.
  { value: "receiptNumber", label: "No. Sales Receipt (opsional — isi sama untuk gabung jadi 1 penerimaan multi-faktur)" },
  { value: "bankNo", label: "Kode Akun Bank/Kas (wajib)" },
  { value: "customerNo", label: "Nomor Customer (wajib)" },
  { value: "description", label: "Description" },
  { value: "branchName", label: "Branch" },
  { value: "currencyCode", label: "Currency Code" },
  { value: "rate", label: "kurs" },
  { value: "receiptTotalAmount", label: "Cheque Amount (opsional — total eksplisit, kosongkan untuk auto-jumlah)" },
  { value: "chequeNo", label: "Cheque No" },
  { value: "chequeDate", label: "Cheque Date" },
  { value: "paymentMethod", label: "Payment Method (Tunai/Cek-Giro/Transfer Bank/EDC/Kartu Debit/Kartu Kredit/QRIS/Payment Link/Virtual Account/Dompet Digital/Non Tunai Lainnya)" },
  { value: "passValidateInvoiceDate", label: "Pass Validate Inv Date (isi \"Y\" atau kosongkan)" },
  { value: "useCredit", label: "Use credit (isi \"Y\" atau kosongkan)" },
  { value: "invoiceNo", label: "Nomor Faktur (wajib)" },
  { value: "chequeAmount", label: "Jumlah Bayar (wajib)" },
  { value: "invoiceDepartmentName", label: "Department (per baris faktur)" },
  { value: "paidPph", label: "Paid PPH (isi \"Y\" atau kosongkan)" },
  { value: "pphNumber", label: "PPh No" },
  { value: "discountAmount", label: "Discount (wajib bersama Discount Acc)" },
  { value: "discountAccountNo", label: "Discount Acc (wajib bersama Discount)" },
  { value: "discountNotes", label: "Discount Note" },
  { value: "discountDepartmentName", label: "Diskon - Dept" },
  { value: "discountProjectNo", label: "Diskon - Project No" },
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

export default function SalesReceiptImportPage() {
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
    const res = await api["sales-receipt"].import.upload.post({ file });
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

    const res = await api["sales-receipt"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/sales-receipt/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Sales Receipt</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi penerimaan pembayaran dari Faktur Penjualan. Customer dan nomor faktur WAJIB SUDAH
          terdaftar di Accurate — proses ini menerima pembayaran tagihan yang sudah ada, bukan membuat faktur baru.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/sales-receipt/import/template`}
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
