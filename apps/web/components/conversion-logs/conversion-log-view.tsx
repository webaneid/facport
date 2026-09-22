"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversionLogTable, type ConversionLogRow } from "@/components/conversion-logs/conversion-log-table";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

const PAGE_SIZE = 20;

// § Fase 150, ADR-0038 — "Riwayat Konversi" Produk Konverter, mirror pola "Arsip Import" Facport
// (`components/import-archive/import-archive-view.tsx`): scope PER DATA USAHA (semua anggota tim, bukan cuma
// riwayat pribadi caller — § keputusan mirror `GET /me/import-batches`, BUKAN `GET /me/invoices`). BEDA: TIDAK
// ada notifikasi retensi/tombol batal/hapus (§ komentar `ConversionLogTable` — tidak ada proses async server yang
// bisa dibatalkan, baris riwayat ditulis SEKALI saat lolos kuota trial, § `checkAndRecordConversionRowBudget`).
export function ConversionLogView({ dataUsahaId }: { dataUsahaId: string }) {
  const companyTimezone = useCompanyTimezone();
  const [logs, setLogs] = useState<ConversionLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  async function load() {
    const res = await api.me["conversion-logs"].get({ query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE, dataUsahaId } });
    if (res.data) {
      const data = res.data as unknown as { logs: ConversionLogRow[]; total: number };
      setLogs(data.logs);
      setTotal(data.total);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal daftar riwayat, pola sama Arsip Import
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, dataUsahaId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Riwayat Konversi" description="Semua konversi Excel→XML di Data Usaha ini, dari semua Varian dan anggota tim." />

      <Card>
        <CardHeader>
          <CardTitle>Semua Konversi</CardTitle>
          <CardDescription>{total} konversi total.</CardDescription>
        </CardHeader>
        <CardContent>
          {!logs ? (
            <Skeleton className="h-40 w-full" />
          ) : logs.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="Belum ada riwayat konversi" />
          ) : (
            <>
              <ConversionLogTable logs={logs} timezone={companyTimezone} />
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
