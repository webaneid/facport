"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { INSIGHT_PAGE_SIZE, totalPagesOf, type FeatureCustomersResponse, type FeatureRow } from "@/lib/insights";
import { ContactCell, OwnerSummary } from "./contact-cell";
import { ExportButton } from "./export-button";
import { useInsightQuery } from "./use-insight-query";

const featureColumns = createDataTableColumns<FeatureRow>();
const userColumns = createDataTableColumns<FeatureCustomersResponse["items"][number]>();

function FeatureUsers({ feature }: { feature: FeatureRow }) {
  const timeZone = useCompanyTimezone();
  const [page, setPage] = useState(0);
  const { loading, data, failed } = useInsightQuery<FeatureCustomersResponse>(`feature:${feature.moduleKey}:${page}`, () =>
    api.admin.insights.features({ moduleKey: feature.moduleKey }).customers.get({ query: { page, pageSize: INSIGHT_PAGE_SIZE } }) as never,
  );
  const columns = useMemo(
    () => [
      userColumns.display({ id: "owner", header: "Pelanggan", meta: { width: "30%" }, cell: ({ row }) => <OwnerSummary owner={row.original.owner} /> }),
      userColumns.display({ id: "contact", header: "Kontak", meta: { width: "24%" }, cell: ({ row }) => <ContactCell owner={row.original.owner} /> }),
      userColumns.display({
        id: "du",
        header: "Data Usaha · Paket",
        meta: { width: "26%" },
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p className="m-0 truncate" title={row.original.dataUsahaName}>{row.original.dataUsahaName}</p>
            <p className="m-0 truncate text-xs text-muted-foreground">{row.original.planName}</p>
          </div>
        ),
      }),
      userColumns.display({
        id: "period",
        header: "Masa berlaku",
        meta: { width: "20%" },
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.startAt ? formatDate(row.original.startAt, timeZone) : "—"} → {row.original.endAt ? formatDate(row.original.endAt, timeZone) : "tanpa batas"}
          </span>
        ),
      }),
    ],
    [timeZone],
  );

  if (failed) return <Alert variant="destructive">Gagal memuat pemakai fitur ini.</Alert>;
  if (loading || !data) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportButton name="feature-users" params={{ moduleKey: feature.moduleKey }} />
      </div>
      <DataTable columns={columns} data={data.items} pageSize={INSIGHT_PAGE_SIZE} emptyTitle="Belum ada pemakai aktif" />
      <Pagination page={page} totalPages={totalPagesOf(data.total, INSIGHT_PAGE_SIZE)} onPageChange={setPage} />
    </div>
  );
}

// § Fase 189D — tab Fitur: jumlah pemakai per fitur (butir 2) dan, lewat "Lihat", daftar pemakainya (kontak + WhatsApp, Data Usaha, masa berlaku).
export function FeaturesTab() {
  const [viewing, setViewing] = useState<FeatureRow | null>(null);
  const { loading, data, failed } = useInsightQuery<{ features: FeatureRow[] }>("features", () => api.admin.insights.features.get() as never);

  const columns = useMemo(
    () => [
      featureColumns.accessor("label", { header: "Fitur", meta: { width: "40%" }, cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
      featureColumns.accessor("customers", { header: "Pelanggan", meta: { width: "18%" } }),
      featureColumns.accessor("dataUsaha", { header: "Data Usaha", meta: { width: "18%" } }),
      featureColumns.accessor("subscriptions", { header: "Langganan aktif", meta: { width: "16%" } }),
      featureColumns.display({
        id: "actions",
        header: "",
        meta: { width: "8%" },
        cell: ({ row }) => (
          <Button type="button" variant="outline" className="h-8 gap-1 px-2" onClick={() => setViewing(row.original)} aria-label={`Lihat pemakai ${row.original.label}`}>
            <Eye className="h-4 w-4" />
            Lihat
          </Button>
        ),
      }),
    ],
    [],
  );

  if (failed) return <Alert variant="destructive">Gagal memuat daftar fitur.</Alert>;
  if (loading || !data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-3">
      <DataTable columns={columns} data={data.features} pageSize={50} emptyTitle="Belum ada langganan aktif" />
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Pemakai {viewing?.label}</DialogTitle>
            <DialogDescription>Pelanggan komersil dengan langganan aktif untuk fitur ini.</DialogDescription>
          </DialogHeader>
          {viewing ? <FeatureUsers feature={viewing} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
