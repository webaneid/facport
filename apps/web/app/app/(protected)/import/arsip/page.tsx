"use client";

import { useEffect, useState } from "react";
import { X, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportBatchTable, type UnifiedImportBatch } from "@/components/import-archive/import-batch-table";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

const PAGE_SIZE = 20;
const NOTICE_DISMISSED_KEY = "facport.arsipImportNoticeDismissed";

// § diminta user 2026-09-06 — notifikasi retensi data, TARIK LANGSUNG
// angka dari `/admin/settings` (`data.importRetentionDays`, § lib/import-retention.ts
// apps/api) supaya SELALU akurat kalau admin ubah — bukan hardcode di
// frontend. `GET /settings?group=data` cuma butuh `auth: true` (BUKAN
// permission admin), jadi customer boleh baca angka ini.
// `dismissed === null` (belum dicek localStorage) SENGAJA disembunyikan
// dulu — cegah "flash" notifikasi muncul-hilang pas viewer yang sudah
// pernah nutup buka halaman ini lagi.
function RetentionNotice({ retentionDays }: { retentionDays: number | null }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let alreadyDismissed = false;
    try {
      alreadyDismissed = localStorage.getItem(NOTICE_DISMISSED_KEY) === "1";
    } catch {
      // § private browsing/localStorage diblokir — anggap belum ditutup.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage (external system) SEKALI saat mount, pola standar
    setDismissed(alreadyDismissed);
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(NOTICE_DISMISSED_KEY, "1");
    } catch {
      // § gagal simpan — tidak fatal, notifikasi cuma muncul lagi kunjungan berikutnya.
    }
  }

  if (dismissed !== false || retentionDays === null) return null;

  return (
    <Card className="border-primary-200 bg-primary-50">
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <p className="text-sm text-foreground">
          Untuk menjaga privasi pelanggan, Facport akan menghapus secara otomatis arsip import selama {retentionDays}{" "}
          hari.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Tutup notifikasi"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}

// § diminta user 2026-09-06 — arsip GABUNGAN lintas semua modul (mirror
// pola halaman riwayat per-modul yang sudah ada, tapi datanya dari
// `GET /me/import-batches`, bukan `/{module}/import`). Item nav "Arsip
// Import" sengaja ditaruh PALING BAWAH grup "Import Data" di sidebar.
export default function ImportArchivePage() {
  const companyTimezone = useCompanyTimezone();
  const [batches, setBatches] = useState<UnifiedImportBatch[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);

  async function load() {
    const res = await api.me["import-batches"].get({ query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE } });
    if (res.data) {
      const data = res.data as unknown as { batches: UnifiedImportBatch[]; total: number };
      setBatches(data.batches);
      setTotal(data.total);
    }
  }

  useEffect(() => {
    async function loadRetention() {
      const res = await api.settings.get({ query: { group: "data" } });
      const data = res.data as Record<string, unknown> | undefined;
      const days = Number(data?.["data.importRetentionDays"] ?? 2);
      setRetentionDays(Number.isFinite(days) ? days : 2);
    }
    loadRetention();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal + polling daftar batch, pola standar
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Arsip Import" description="Semua import kamu, dari semua fitur, termasuk yang lebih lama." />

      <RetentionNotice retentionDays={retentionDays} />

      <Card>
        <CardHeader>
          <CardTitle>Semua Batch</CardTitle>
          <CardDescription>{total} batch total.</CardDescription>
        </CardHeader>
        <CardContent>
          {!batches ? (
            <Skeleton className="h-40 w-full" />
          ) : batches.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada riwayat import" />
          ) : (
            <>
              <ImportBatchTable batches={batches} onChanged={load} timezone={companyTimezone} />
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
