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

// § architecture-journal-voucher.md — transaksi akuntansi murni (debit/
// kredit ke akun COA), TANPA vendor/customer/faktur. DUA FORMAT hidup
// berdampingan (§ Fase 50, `formatOf` di `journal-voucher.mapping.ts`):
// Opsi A (Format Lebar) — 1 baris Excel = 1 jurnal lengkap (1 akun debit
// + 1 akun kredit), Nominal Debit WAJIB SAMA PERSIS dengan Nominal
// Kredit; Opsi B (Format Panjang) — banyak baris per jurnal (N akun),
// dikelompokkan lewat "Nomor Transaksi", SUM semua baris DEBIT WAJIB
// SAMA PERSIS dengan SUM semua baris CREDIT dalam 1 kelompok.
//
// § Fase 95 (2026-09-10) — riset 2 sumber (template kompetitor
// `FACPORT_JV_v3/v4.1.xlsx` + template client dengan 3 screenshot UI
// Accurate asli, § architecture-journal-voucher.md § "Fase 95"). Opsi B
// GANTI TOTAL kolom tipe manual ("Nominal per Baris"+"Tipe Baris") jadi
// **"Debit"/"Credit" TERPISAH** (isi salah satu per baris, tipe
// ditentukan otomatis dari kolom mana yang terisi — mirror radio button
// Debit/Kredit di UI Accurate asli, bukan lagi teks bebas). Field baru:
// Branch (WAJIB), Kurs, Nominal Asing, Department, Project, Memo,
// Subsidiary Type+Cust/Employee/Vendor No, Kategori Keuangan 1-10.
const ACCURATE_FIELDS = [
  { value: "", label: "(tidak dipetakan)" },
  { value: "transDate", label: "Tanggal (wajib, kedua opsi)" },
  { value: "description", label: "Keterangan (opsional, kedua opsi)" },
  { value: "debitAccountNo", label: "Opsi A — Kode Akun Debit (wajib)" },
  { value: "debitAmount", label: "Opsi A — Nominal Debit (wajib)" },
  { value: "creditAccountNo", label: "Opsi A — Kode Akun Kredit (wajib)" },
  { value: "creditAmount", label: "Opsi A — Nominal Kredit (wajib)" },
  { value: "journalNumber", label: "Opsi B — Nomor Transaksi (wajib, kunci pengelompokan baris)" },
  { value: "branchName", label: "Opsi B — Cabang (wajib)" },
  { value: "lineAccountNo", label: "Opsi B — Kode Akun per Baris (wajib)" },
  { value: "lineDebitAmount", label: "Opsi B — Debit (isi HANYA kalau baris ini debit)" },
  { value: "lineCreditAmount", label: "Opsi B — Credit (isi HANYA kalau baris ini kredit)" },
  { value: "lineRate", label: "Opsi B — Kurs (opsional, untuk akun mata uang asing)" },
  { value: "linePrimeAmount", label: "Opsi B — Nominal Mata Uang Asing (opsional)" },
  { value: "lineDepartmentName", label: "Opsi B — Departemen (opsional)" },
  { value: "lineProjectNo", label: "Opsi B — Proyek (opsional)" },
  { value: "lineMemo", label: "Opsi B — Memo (opsional)" },
  { value: "lineSubsidiaryType", label: "Opsi B — Tipe Subsidiary: CUSTOMER/EMPLOYEE/VENDOR (opsional)" },
  { value: "lineCustomerNo", label: "Opsi B — Kode Customer (opsional, isi kalau Tipe Subsidiary = CUSTOMER)" },
  { value: "lineEmployeeNo", label: "Opsi B — Kode Karyawan (opsional, isi kalau Tipe Subsidiary = EMPLOYEE)" },
  { value: "lineVendorNo", label: "Opsi B — Kode Vendor (opsional, isi kalau Tipe Subsidiary = VENDOR)" },
  { value: "attribut1", label: "Opsi B — Kategori Keuangan 1 (opsional)" },
  { value: "attribut2", label: "Opsi B — Kategori Keuangan 2 (opsional)" },
  { value: "attribut3", label: "Opsi B — Kategori Keuangan 3 (opsional)" },
  { value: "attribut4", label: "Opsi B — Kategori Keuangan 4 (opsional)" },
  { value: "attribut5", label: "Opsi B — Kategori Keuangan 5 (opsional)" },
  { value: "attribut6", label: "Opsi B — Kategori Keuangan 6 (opsional)" },
  { value: "attribut7", label: "Opsi B — Kategori Keuangan 7 (opsional)" },
  { value: "attribut8", label: "Opsi B — Kategori Keuangan 8 (opsional)" },
  { value: "attribut9", label: "Opsi B — Kategori Keuangan 9 (opsional)" },
  { value: "attribut10", label: "Opsi B — Kategori Keuangan 10 (opsional)" },
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

export default function JournalVoucherImportPage() {
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
    const res = await api["journal-voucher"].import.upload.post({ file });
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

    const res = await api["journal-voucher"].import({ batchId: result.batchId }).confirm.post({ columnMapping });
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
    router.push(`/journal-voucher/import/${result.batchId}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import Jurnal Umum</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel berisi jurnal debit/kredit antar akun COA. Mendukung 2 format: <strong>Opsi A</strong> (1
          baris = 1 jurnal lengkap, 1 akun debit + 1 akun kredit) atau <strong>Opsi B</strong> (banyak baris
          dikelompokkan lewat Nomor Transaksi, untuk jurnal dengan lebih dari 2 akun — isi kolom Debit ATAU Credit
          per baris, jangan dua-duanya). Total Debit dan Kredit WAJIB sama persis dalam 1 jurnal. Kode akun WAJIB
          SUDAH terdaftar di Accurate.
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload File</CardTitle>
            <CardDescription>
              Format `.xlsx`/`.xls`, maks 10MB.{" "}
              <a
                href={`${process.env.NODE_ENV === "production" ? getProdApiOrigin() : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")}/journal-voucher/import/template`}
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
