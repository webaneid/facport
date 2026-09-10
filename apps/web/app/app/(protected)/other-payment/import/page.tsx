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

// § architecture-other-payment.md — pembayaran bank/kas untuk beban
// LANGSUNG (listrik, gaji, dll), TANPA faktur/vendor. Baris dengan
// "Trans No" sama digabung jadi 1 transaksi (bisa lebih dari 1 akun
// beban). TIDAK ADA validasi balance (beda dari Jurnal Umum) — akun
// kas/bank otomatis sisi kredit via API.
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Tanggal (wajib)" },
  { value: "transNo", label: "Nomor Transaksi (wajib, kunci pengelompokan baris)" },
  { value: "branchName", label: "Cabang (wajib)" },
  { value: "bankNo", label: "Kode Akun Kas/Bank (wajib)" },
  { value: "payee", label: "Penerima Pembayaran (wajib)" },
  { value: "chequeNo", label: "Nomor Cek/Giro (opsional)" },
  { value: "description", label: "Keterangan (opsional)" },
  { value: "rate", label: "Kurs (opsional, untuk mata uang asing)" },
  { value: "lineAccountNo", label: "Kode Akun Beban per Baris (wajib)" },
  { value: "lineAmount", label: "Nominal Beban per Baris (wajib)" },
  { value: "lineExpenseName", label: "Nama Beban / Paid To per Baris (wajib)" },
  { value: "lineMemo", label: "Memo per Baris (opsional)" },
  { value: "lineDepartmentName", label: "Departemen per Baris (opsional)" },
  { value: "lineProjectNo", label: "Proyek per Baris (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan1", label: "Atribut Tambahan 1 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan2", label: "Atribut Tambahan 2 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan3", label: "Atribut Tambahan 3 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan4", label: "Atribut Tambahan 4 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan5", label: "Atribut Tambahan 5 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan6", label: "Atribut Tambahan 6 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan7", label: "Atribut Tambahan 7 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan8", label: "Atribut Tambahan 8 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan9", label: "Atribut Tambahan 9 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTambahan10", label: "Atribut Tambahan 10 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber1", label: "Atribut Number 1 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber2", label: "Atribut Number 2 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber3", label: "Atribut Number 3 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber4", label: "Atribut Number 4 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber5", label: "Atribut Number 5 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber6", label: "Atribut Number 6 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber7", label: "Atribut Number 7 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber8", label: "Atribut Number 8 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber9", label: "Atribut Number 9 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributNumber10", label: "Atribut Number 10 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTanggal1", label: "Atribut Tanggal 1 (opsional, belum diverifikasi end-to-end)" },
  { value: "attributTanggal2", label: "Atribut Tanggal 2 (opsional, belum diverifikasi end-to-end)" },
  { value: "attribut1", label: "Kategori Keuangan 1 (opsional)" },
  { value: "attribut2", label: "Kategori Keuangan 2 (opsional)" },
  { value: "attribut3", label: "Kategori Keuangan 3 (opsional)" },
  { value: "attribut4", label: "Kategori Keuangan 4 (opsional)" },
  { value: "attribut5", label: "Kategori Keuangan 5 (opsional)" },
  { value: "attribut6", label: "Kategori Keuangan 6 (opsional)" },
  { value: "attribut7", label: "Kategori Keuangan 7 (opsional)" },
  { value: "attribut8", label: "Kategori Keuangan 8 (opsional)" },
  { value: "attribut9", label: "Kategori Keuangan 9 (opsional)" },
  { value: "attribut10", label: "Kategori Keuangan 10 (opsional)" },
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

export default function OtherPaymentImportPage() {
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
    const res = await api["other-payment"].import.upload.post({ file });
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

    const res = await api["other-payment"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/other-payment/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Other Payment</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi pengeluaran kas/bank untuk beban langsung (listrik, gaji, sewa, dll) — TANPA
          faktur atau vendor. Baris dengan Nomor Transaksi yang sama digabung jadi 1 pembayaran (boleh lebih dari 1
          akun beban). Kode akun kas/bank dan akun beban WAJIB SUDAH terdaftar di Accurate.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/other-payment/import/template`}
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
