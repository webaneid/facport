"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { SearchForm } from "@/components/ui/search-form";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { describeDataUsahaEvent } from "@/lib/data-usaha-history";
import { INSIGHT_PAGE_SIZE, totalPagesOf, type ConnectionResponse } from "@/lib/insights";
import { WhatsAppButton } from "./contact-cell";
import { ExportButton } from "./export-button";
import { useInsightQuery } from "./use-insight-query";

const columnHelper = createDataTableColumns<ConnectionResponse["items"][number]>();
const TONE_VARIANT = { info: "default", warning: "warning", danger: "destructive" } as const;

// § Fase 189D — tab Riwayat Koneksi (butir 9): peristiwa sambung/pilih/konfirmasi/koreksi/putus lintas pelanggan + ringkasan "salah koneksi".
export function ConnectionTab() {
  const timeZone = useCompanyTimezone();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "koreksi">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const rangeIncomplete = (from === "") !== (to === "");
  const rangeInvalid = from !== "" && to !== "" && from > to;
  const blocked = rangeIncomplete || rangeInvalid;
  const range = from && to ? { from, to } : {};

  const { loading, data, failed } = useInsightQuery<ConnectionResponse>(`conn:${q}:${kind}:${from}:${to}:${page}:${blocked}`, async () => {
    if (blocked) return { data: null, error: null };
    return (await api.admin.insights["connection-history"].get({ query: { q: q || undefined, kind, ...range, page, pageSize: INSIGHT_PAGE_SIZE } })) as never;
  });

  const columns = useMemo(
    () => [
      columnHelper.display({ id: "time", header: "Waktu", meta: { width: "16%" }, cell: ({ row }) => <span className="text-xs">{formatDate(row.original.createdAt, timeZone)}</span> }),
      columnHelper.display({
        id: "owner",
        header: "Pelanggan · Data Usaha",
        meta: { width: "28%" },
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p className="m-0 truncate font-medium" title={row.original.owner.companyName || row.original.owner.name}>{row.original.owner.companyName || row.original.owner.name}</p>
            <p className="m-0 truncate text-xs text-muted-foreground" title={row.original.dataUsaha.name}>{row.original.dataUsaha.name}</p>
          </div>
        ),
      }),
      columnHelper.display({
        id: "event",
        header: "Kejadian",
        meta: { width: "40%" },
        cell: ({ row }) => {
          const d = describeDataUsahaEvent({ id: row.original.id, action: row.original.action, changes: row.original.changes, actorName: row.original.actor?.name ?? null, createdAt: row.original.createdAt });
          return (
            <div className="min-w-0 text-sm">
              <Badge variant={TONE_VARIANT[d.tone]} className="max-w-full truncate">{d.title}</Badge>
              {d.detail ? <p className="m-0 mt-1 truncate text-xs text-muted-foreground" title={d.detail}>{d.detail}</p> : null}
              {row.original.actor ? <p className="m-0 text-xs text-muted-foreground">Oleh {row.original.actor.name}</p> : null}
            </div>
          );
        },
      }),
      columnHelper.display({ id: "wa", header: "", meta: { width: "16%" }, cell: ({ row }) => <WhatsAppButton whatsapp={row.original.owner.whatsapp} phone={row.original.owner.phone} name={row.original.owner.name} /> }),
    ],
    [timeZone],
  );

  const summary = data?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <SearchForm placeholder="Cari pelanggan atau Data Usaha…" onSearch={(v) => { setQ(v); setPage(0); }} />
        <Select aria-label="Jenis kejadian" value={kind} onChange={(e) => { setKind(e.target.value === "koreksi" ? "koreksi" : "all"); setPage(0); }} className="w-52">
          <option value="all">Semua kejadian</option>
          <option value="koreksi">Hanya koreksi / diputus</option>
        </Select>
        <Input type="date" aria-label="Dari tanggal" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-40" />
        <Input type="date" aria-label="Sampai tanggal" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-40" />
        <div className="ml-auto">{blocked ? null : <ExportButton name="connection-history" params={{ q: q || undefined, kind, ...range }} />}</div>
      </div>
      {rangeIncomplete ? <Alert variant="warning">Isi tanggal awal dan akhir sekaligus, atau kosongkan keduanya.</Alert> : null}
      {rangeInvalid ? <Alert variant="warning">Tanggal akhir harus sama atau setelah tanggal awal.</Alert> : null}
      {failed ? <Alert variant="destructive">Gagal memuat riwayat koneksi.</Alert> : null}
      {!blocked && loading ? <Skeleton className="h-48 w-full" /> : null}
      {!blocked && data ? (
        <>
          {summary ? (
            <p className="text-sm text-muted-foreground">
              {summary.dataUsahaWithCorrection} Data Usaha pernah dikoreksi / diputus ({summary.ownersWithCorrection} pelanggan) · {summary.repeatedCorrection} berulang (≥ 2 kali)
            </p>
          ) : null}
          <DataTable columns={columns} data={data.items} pageSize={INSIGHT_PAGE_SIZE} emptyTitle="Belum ada riwayat koneksi" emptyDescription="Ubah filter atau rentang tanggal." />
          <Pagination page={page} totalPages={totalPagesOf(data.total, INSIGHT_PAGE_SIZE)} onPageChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
