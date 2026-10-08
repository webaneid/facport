"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { TruncateText } from "@/components/ui/truncate-text";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { accurateResultText } from "@/lib/accurate-result-text";

// § Fase 159 — riwayat "Input Produksi", polling 3 detik mirror pola
// `[batchId]/page.tsx` 23 modul lain (status berubah async lewat job
// worker PROCESS_AUTOPRODUKSI_ENTRY).
type Entry = {
  id: string;
  formulaName: string;
  formulaCode: string;
  producedQty: string;
  transDate: string;
  status: "pending" | "processing" | "success" | "failed";
  accurateTransactionId: string | null;
  accurateTransactionNumber: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const STATUS_BADGE: Record<Entry["status"], { label: string; variant: "success" | "destructive" | "warning" | "default" }> = {
  pending: { label: "Menunggu", variant: "warning" },
  processing: { label: "Memproses", variant: "warning" },
  success: { label: "Sukses", variant: "success" },
  failed: { label: "Gagal", variant: "destructive" },
};

const columnHelper = createDataTableColumns<Entry>();

export default function AutoProduksiRiwayatPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  async function load() {
    const res = await api.autoproduksi["production-entries"].get({ query: {} });
    if (res.data) setEntries((res.data as unknown as { entries: Entry[] }).entries);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal + polling status entry, pola standar
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const columns = [
    columnHelper.accessor((row) => `${row.formulaCode} · ${row.formulaName}`, { id: "formulaName", header: "Formula", meta: { width: "26%" } }),
    columnHelper.accessor("producedQty", { header: "Qty Produksi" }),
    columnHelper.accessor("transDate", { header: "Tanggal" }),
    columnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) => <Badge variant={STATUS_BADGE[row.original.status].variant}>{STATUS_BADGE[row.original.status].label}</Badge>,
    }),
    columnHelper.display({
      id: "result",
      header: "No. Transaksi Accurate / Error",
      meta: { width: "30%" },
      cell: ({ row }) => <TruncateText className="text-muted-foreground">{accurateResultText(row.original)}</TruncateText>,
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Riwayat Input Produksi</h1>
        <p className="text-sm text-muted-foreground">Status tiap input produksi — diproses async, refresh otomatis tiap 3 detik.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Semua Entry</CardTitle>
          <CardDescription>Kalau gagal, cek pesan error (biasanya kode barang/akun belum ada di Accurate).</CardDescription>
        </CardHeader>
        <CardContent>
          {!entries ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable columns={columns} data={entries} emptyIcon={History} emptyTitle="Belum ada riwayat" emptyDescription="Input produksi pertamamu akan tampil di sini." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
