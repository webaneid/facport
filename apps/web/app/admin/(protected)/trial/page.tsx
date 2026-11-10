"use client";

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { TruncateText } from "@/components/ui/truncate-text";
import { SearchForm } from "@/components/ui/search-form";
import { Can } from "@/components/auth/can";
import { TrialClaimReleaseDialog } from "@/components/admin/trial-claim-release-dialog";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { api } from "@/lib/api-client";
import { moduleLabel } from "@/lib/module-options";
import { TRIAL_CLAIM_STATUS_LABEL, type TrialClaimStatusFilter } from "@/lib/trial-claims";

// § Fase 217, ADR-0054, architecture-trial-database-ledger.md § 5 — daftar klaim trial per (database Accurate, modul) dan aksi "Lepas klaim" (Super Admin saja).
// Melihat daftar butuh `users.view`; melepas klaim butuh `users.manage` (dipaksa server).
type ClaimRow = {
  id: string;
  accurateDbId: string;
  accurateDbAlias: string | null;
  module: string;
  userEmail: string | null;
  dataUsahaName: string | null;
  rowsUsed: number;
  claimedAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
};

const columnHelper = createDataTableColumns<ClaimRow>();

export default function AdminTrialClaimsPage() {
  const companyTimezone = useCompanyTimezone();
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TrialClaimStatusFilter>("active");
  const [releaseTarget, setReleaseTarget] = useState<ClaimRow | null>(null);

  const load = useCallback(async () => {
    const res = await api.admin["trial-claims"].get({ query: { q: search || undefined, status, limit: 200 } });
    if (res.data) setClaims((res.data as unknown as { claims: ClaimRow[] }).claims);
  }, [search, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ulang saat filter berubah, pola sama admin/staff/page.tsx
    load();
  }, [load]);

  const columns = [
    columnHelper.display({
      id: "database",
      header: "Database Accurate",
      meta: { width: "24%" },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <TruncateText className="font-medium text-foreground">{row.original.accurateDbAlias || "-"}</TruncateText>
          <code className="text-xs text-muted-foreground">{row.original.accurateDbId}</code>
        </div>
      ),
    }),
    columnHelper.display({
      id: "module",
      header: "Fitur",
      meta: { width: "16%" },
      cell: ({ row }) => <span className="text-foreground">{moduleLabel(row.original.module)}</span>,
    }),
    columnHelper.display({
      id: "owner",
      header: "Pemegang klaim",
      meta: { width: "26%" },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <TruncateText className="text-foreground">{row.original.userEmail ?? "-"}</TruncateText>
          <TruncateText className="text-xs text-muted-foreground">{row.original.dataUsahaName ?? "-"}</TruncateText>
        </div>
      ),
    }),
    columnHelper.accessor("rowsUsed", {
      header: "Baris",
      meta: { width: "8%" },
      cell: (ctx) => <span className="text-muted-foreground">{ctx.getValue()}</span>,
    }),
    columnHelper.display({
      id: "claimedAt",
      header: "Diklaim",
      meta: { width: "14%" },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-muted-foreground">{formatDate(row.original.claimedAt, companyTimezone)}</span>
          {row.original.releasedAt ? <Badge variant="warning">Dilepas {formatDate(row.original.releasedAt, companyTimezone)}</Badge> : null}
        </div>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      meta: { width: "12%" },
      cell: ({ row }) => {
        const r = row.original;
        if (r.releasedAt) return <TruncateText className="text-xs text-muted-foreground">{r.releaseReason ?? ""}</TruncateText>;
        return (
          <Can permission="users.manage">
            <Button type="button" variant="outline" size="sm" onClick={() => setReleaseTarget(r)}>
              <Unlock className="mr-1.5 h-3.5 w-3.5" />
              Lepas
            </Button>
          </Can>
        );
      },
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Klaim Trial"
        description="Trial gratis hanya 1x per database Accurate untuk tiap fitur. Di sini terlihat database mana yang sudah dicoba, siapa pemegangnya, dan bisa dilepas bila salah klaim."
      />

      <Card>
        <CardHeader>
          <CardTitle>Daftar Klaim</CardTitle>
          <CardDescription>{claims?.length ?? 0} klaim ditampilkan. Klaim dibuat saat import trial pertama dikonfirmasi.</CardDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SearchForm placeholder="Cari ID database Accurate..." onSearch={setSearch} className="min-w-64 flex-1" />
            <div className="flex gap-1" role="group" aria-label="Filter status klaim">
              {(Object.keys(TRIAL_CLAIM_STATUS_LABEL) as TrialClaimStatusFilter[]).map((s) => (
                <Button key={s} type="button" size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                  {TRIAL_CLAIM_STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!claims ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={claims} emptyIcon={FlaskConical} emptyTitle="Belum ada klaim trial" />}
        </CardContent>
      </Card>

      {releaseTarget ? (
        <TrialClaimReleaseDialog
          open
          onOpenChange={(o) => !o && setReleaseTarget(null)}
          claimId={releaseTarget.id}
          accurateDbId={releaseTarget.accurateDbId}
          moduleName={moduleLabel(releaseTarget.module)}
          onDone={load}
        />
      ) : null}
    </div>
  );
}
