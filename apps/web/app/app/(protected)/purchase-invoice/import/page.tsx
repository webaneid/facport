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
import { getProdApiOrigin } from "@/lib/get-prod-api-origin";
import { api } from "@/lib/api-client";

// § architecture-accurate-integration.md § 3, § phase-02 doc — upload
// Excel Purchase Invoice → cocokkan kolom → konfirmasi. § Fase 06,
// ADR-0011 — baris dengan "Nomor Referensi Tagihan Pemasok" (billNumber)
// SAMA digabung jadi 1 Faktur Pembelian multi-item, bukan lagi selalu
// 1 baris = 1 faktur.
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
  { value: "billNumber", label: "Nomor Referensi Tagihan Pemasok (isi sama untuk gabung jadi 1 faktur)" },
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
  { value: "vendorPayableAccountNo", label: "Akun Hutang Pemasok (berlaku buat Pemasok baru ATAU sudah ada)" },
  { value: "itemCategoryName", label: "Kategori Barang Baru (default: Umum)" },
  // § Fase 75 (2026-09-09) — mirror LENGKAP dari Sales Invoice
  // (Fase 55/61/64/68/73/74).
  { value: "attribut1", label: "Kategori Keuangan 1 (per barang)" },
  { value: "attribut2", label: "Kategori Keuangan 2 (per barang)" },
  { value: "attribut3", label: "Kategori Keuangan 3 (per barang)" },
  { value: "attribut4", label: "Kategori Keuangan 4 (per barang)" },
  { value: "attribut5", label: "Kategori Keuangan 5 (per barang)" },
  { value: "attribut6", label: "Kategori Keuangan 6 (per barang)" },
  { value: "attribut7", label: "Kategori Keuangan 7 (per barang)" },
  { value: "attribut8", label: "Kategori Keuangan 8 (per barang)" },
  { value: "attribut9", label: "Kategori Keuangan 9 (per barang)" },
  { value: "attribut10", label: "Kategori Keuangan 10 (per barang)" },
  { value: "attributHeaderKarakter1", label: "Atribut Tambahan Karakter 1 (per faktur)" },
  { value: "attributHeaderKarakter2", label: "Atribut Tambahan Karakter 2 (per faktur)" },
  { value: "attributHeaderKarakter3", label: "Atribut Tambahan Karakter 3 (per faktur)" },
  { value: "attributHeaderKarakter4", label: "Atribut Tambahan Karakter 4 (per faktur)" },
  { value: "attributHeaderKarakter5", label: "Atribut Tambahan Karakter 5 (per faktur)" },
  { value: "attributHeaderKarakter6", label: "Atribut Tambahan Karakter 6 (per faktur)" },
  { value: "attributHeaderKarakter7", label: "Atribut Tambahan Karakter 7 (per faktur)" },
  { value: "attributHeaderKarakter8", label: "Atribut Tambahan Karakter 8 (per faktur)" },
  { value: "attributHeaderKarakter9", label: "Atribut Tambahan Karakter 9 (per faktur)" },
  { value: "attributHeaderKarakter10", label: "Atribut Tambahan Karakter 10 (per faktur)" },
  { value: "attributHeaderAngka1", label: "Atribut Tambahan Angka 1 (per faktur)" },
  { value: "attributHeaderAngka2", label: "Atribut Tambahan Angka 2 (per faktur)" },
  { value: "attributHeaderAngka3", label: "Atribut Tambahan Angka 3 (per faktur)" },
  { value: "attributHeaderAngka4", label: "Atribut Tambahan Angka 4 (per faktur)" },
  { value: "attributHeaderAngka5", label: "Atribut Tambahan Angka 5 (per faktur)" },
  { value: "attributHeaderAngka6", label: "Atribut Tambahan Angka 6 (per faktur)" },
  { value: "attributHeaderAngka7", label: "Atribut Tambahan Angka 7 (per faktur)" },
  { value: "attributHeaderAngka8", label: "Atribut Tambahan Angka 8 (per faktur)" },
  { value: "attributHeaderAngka9", label: "Atribut Tambahan Angka 9 (per faktur)" },
  { value: "attributHeaderAngka10", label: "Atribut Tambahan Angka 10 (per faktur)" },
  { value: "attributHeaderTanggal1", label: "Atribut Tambahan Tanggal 1 (per faktur)" },
  { value: "attributHeaderTanggal2", label: "Atribut Tambahan Tanggal 2 (per faktur)" },
  { value: "attributItemKarakter1", label: "Atribut Tambahan Karakter 1 (per barang)" },
  { value: "attributItemKarakter2", label: "Atribut Tambahan Karakter 2 (per barang)" },
  { value: "attributItemKarakter3", label: "Atribut Tambahan Karakter 3 (per barang)" },
  { value: "attributItemKarakter4", label: "Atribut Tambahan Karakter 4 (per barang)" },
  { value: "attributItemKarakter5", label: "Atribut Tambahan Karakter 5 (per barang)" },
  { value: "attributItemKarakter6", label: "Atribut Tambahan Karakter 6 (per barang)" },
  { value: "attributItemKarakter7", label: "Atribut Tambahan Karakter 7 (per barang)" },
  { value: "attributItemKarakter8", label: "Atribut Tambahan Karakter 8 (per barang)" },
  { value: "attributItemKarakter9", label: "Atribut Tambahan Karakter 9 (per barang)" },
  { value: "attributItemKarakter10", label: "Atribut Tambahan Karakter 10 (per barang)" },
  { value: "attributItemKarakter11", label: "Atribut Tambahan Karakter 11 (per barang)" },
  { value: "attributItemKarakter12", label: "Atribut Tambahan Karakter 12 (per barang)" },
  { value: "attributItemKarakter13", label: "Atribut Tambahan Karakter 13 (per barang)" },
  { value: "attributItemKarakter14", label: "Atribut Tambahan Karakter 14 (per barang)" },
  { value: "attributItemKarakter15", label: "Atribut Tambahan Karakter 15 (per barang)" },
  { value: "attributItemAngka1", label: "Atribut Tambahan Angka 1 (per barang)" },
  { value: "attributItemAngka2", label: "Atribut Tambahan Angka 2 (per barang)" },
  { value: "attributItemAngka3", label: "Atribut Tambahan Angka 3 (per barang)" },
  { value: "attributItemAngka4", label: "Atribut Tambahan Angka 4 (per barang)" },
  { value: "attributItemAngka5", label: "Atribut Tambahan Angka 5 (per barang)" },
  { value: "attributItemAngka6", label: "Atribut Tambahan Angka 6 (per barang)" },
  { value: "attributItemAngka7", label: "Atribut Tambahan Angka 7 (per barang)" },
  { value: "attributItemAngka8", label: "Atribut Tambahan Angka 8 (per barang)" },
  { value: "attributItemAngka9", label: "Atribut Tambahan Angka 9 (per barang)" },
  { value: "attributItemAngka10", label: "Atribut Tambahan Angka 10 (per barang)" },
  { value: "attributItemTanggal1", label: "Atribut Tambahan Tanggal 1 (per barang)" },
  { value: "attributItemTanggal2", label: "Atribut Tambahan Tanggal 2 (per barang)" },
  { value: "expenseAccountNo", label: "Akun Beban (wajib bersama Jumlah Beban)" },
  { value: "expenseName", label: "Nama Beban" },
  { value: "expenseAmount", label: "Jumlah Beban (wajib bersama Akun Beban)" },
  { value: "expenseNotes", label: "Catatan Beban" },
  { value: "expenseDepartmentName", label: "Departemen Beban" },
  { value: "expenseKategoriKeuangan1", label: "Kategori Keuangan Beban 1 (per baris Beban)" },
  { value: "expenseKategoriKeuangan2", label: "Kategori Keuangan Beban 2 (per baris Beban)" },
  { value: "expenseKategoriKeuangan3", label: "Kategori Keuangan Beban 3 (per baris Beban)" },
  { value: "expenseKategoriKeuangan4", label: "Kategori Keuangan Beban 4 (per baris Beban)" },
  { value: "expenseKategoriKeuangan5", label: "Kategori Keuangan Beban 5 (per baris Beban)" },
  { value: "expenseKategoriKeuangan6", label: "Kategori Keuangan Beban 6 (per baris Beban)" },
  { value: "expenseKategoriKeuangan7", label: "Kategori Keuangan Beban 7 (per baris Beban)" },
  { value: "expenseKategoriKeuangan8", label: "Kategori Keuangan Beban 8 (per baris Beban)" },
  { value: "expenseKategoriKeuangan9", label: "Kategori Keuangan Beban 9 (per baris Beban)" },
  { value: "expenseKategoriKeuangan10", label: "Kategori Keuangan Beban 10 (per baris Beban)" },
  // § Fase 79 (2026-09-09) — link alur pembelian (Permintaan Pembelian
  // -> Pesanan Pembelian -> Penerimaan Barang -> Faktur). "PO No Beban"
  // tetap bagian grup Beban, field level ITEM saling terhubung (prioritas:
  // Receive Item > Purchase Order > Purchase Requisition).
  { value: "expensePurchaseOrderNo", label: "PO No Beban (per baris Beban)" },
  { value: "itemReceiveItemNo", label: "No. Receive Item (per barang, prioritas tertinggi)" },
  { value: "itemPurchaseOrderNo", label: "No. Purchase Order (per barang)" },
  { value: "itemPurchaseRequisitionNo", label: "No. Purchase Requisition (per barang, prioritas terendah)" },
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
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/purchase-invoice/import/template`}
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
              <p className="text-xs text-muted-foreground">
                💡 Baris dengan <strong>Nomor Referensi Tagihan Pemasok</strong> yang SAMA akan digabung jadi 1 faktur
                (banyak barang) — pastikan tiap faktur yang berbeda pakai nomor yang berbeda juga.
              </p>
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
