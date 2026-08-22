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

// § architecture-accurate-integration.md § 3, § phase-02 doc — upload
// Excel Purchase Invoice → cocokkan kolom → konfirmasi. 1 baris Excel = 1
// Faktur Pembelian dengan 1 detailItem (Known Limitation, belum dukung
// multi-item per baris).
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "vendorNo", label: "Nomor Pemasok (wajib)" },
  { value: "transDate", label: "Tanggal (wajib)" },
  { value: "itemNo", label: "Kode Barang (wajib)" },
  { value: "unitPrice", label: "Harga Satuan (wajib)" },
  { value: "quantity", label: "Qty (wajib)" },
  { value: "itemUnitName", label: "Satuan Barang (wajib)" },
  { value: "warehouseName", label: "Gudang (wajib)" },
  { value: "branchName", label: "Nama Cabang (wajib kalau akun multi-cabang)" },
  { value: "number", label: "Nomor Transaksi (kosongkan = auto)" },
  { value: "billNumber", label: "Nomor Referensi Tagihan Pemasok" },
  { value: "description", label: "Keterangan" },
  { value: "currencyCode", label: "Kode Mata Uang" },
  { value: "rate", label: "Nilai Tukar" },
  { value: "paymentTermName", label: "Syarat Bayar" },
  { value: "taxable", label: "Kena Pajak (Y/N)" },
  { value: "inclusiveTax", label: "Termasuk Pajak (Y/N)" },
  { value: "taxNumber", label: "Nomor Faktur Pajak" },
  { value: "taxDate", label: "Tanggal Pajak" },
  { value: "reverseInvoice", label: "Faktur Dimuka (Y/N)" },
  { value: "cashDiscount", label: "Diskon (Rupiah)" },
  { value: "cashDiscPercent", label: "Diskon (%)" },
  { value: "documentCode", label: "Kode Dokumen Pajak" },
  { value: "documentTransaction", label: "Jenis Transaksi Dokumen Pajak" },
  { value: "toAddress", label: "Alamat Pemasok" },
  { value: "shipmentName", label: "Nama Pengiriman" },
  { value: "shipDate", label: "Tanggal Pengiriman" },
  { value: "itemName", label: "Nama Barang" },
  { value: "itemNotes", label: "Catatan Barang" },
  { value: "itemCashDiscount", label: "Diskon Barang (Rupiah)" },
  { value: "itemDiscPercent", label: "Diskon Barang (%)" },
  { value: "departmentName", label: "Departemen" },
  { value: "projectNo", label: "Nomor Proyek" },
  { value: "useTax1", label: "PPN (Y/N)" },
  { value: "useTax2", label: "PPnBM (Y/N)" },
  { value: "useTax3", label: "PPh23 (Y/N)" },
  // § phase-05-purchase-invoice-auto-create.md — field OPSIONAL ini CUMA
  // dipakai kalau Pemasok/Barang di baris itu BELUM ada di Accurate
  // (dicari dulu by Nomor Pemasok/Kode Barang, baru dibuatkan otomatis
  // kalau tidak ketemu). Kalau sudah ada, field ini diabaikan — TIDAK
  // meng-update data yang sudah ada.
  { value: "vendorName", label: "Nama Pemasok Baru (isi kalau Pemasok belum ada)" },
  { value: "vendorCategoryName", label: "Kategori Pemasok Baru (default: Umum)" },
  { value: "vendorWorkPhone", label: "Telepon Bisnis Pemasok Baru" },
  { value: "vendorMobilePhone", label: "Handphone Pemasok Baru" },
  { value: "vendorWhatsapp", label: "No. WhatsApp Pemasok Baru" },
  { value: "vendorEmail", label: "Email Pemasok Baru" },
  { value: "vendorAddress", label: "Alamat Pemasok Baru" },
  { value: "vendorCountry", label: "Negara Pemasok Baru" },
  { value: "vendorPayableAccountNo", label: "Akun Hutang Pemasok Baru" },
  { value: "itemCategoryName", label: "Kategori Barang Baru (default: Umum)" },
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

export default function PurchaseInvoiceImportPage() {
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
    const res = await api["purchase-invoice"].import.upload.post({ file });
    if (res.error || !res.data) {
      const code = (res.error?.value as { code?: string } | undefined)?.code;
      setError(code === "EMPTY_FILE" ? "File Excel kosong — tidak ada baris data." : "Upload gagal, cek format file.");
      return;
    }
    // § adr-0010 — t.File() route: Eden infer sukses jadi `{}`, cast scoped
    // sudah diverifikasi manual (pola sama media-library-modal.tsx).
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

    const res = await api["purchase-invoice"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
    setConfirming(false);
    if (res.error) {
      const value = res.error.value as { code?: string; fields?: string[] } | undefined;
      setError(
        value?.code === "MISSING_REQUIRED_FIELDS"
          ? `Field wajib belum dipetakan: ${value.fields?.join(", ")}`
          : "Gagal konfirmasi mapping.",
      );
      return;
    }
    router.push(`/purchase-invoice/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Faktur Pembelian dari Excel</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel, cocokkan kolom, lalu import langsung ke Accurate Online. Pemasok/Barang yang belum ada
          otomatis dibuatkan (isi kolom opsional &quot;...Baru&quot; saat cocokkan kolom).
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/purchase-invoice/import/template`}
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
