"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { currencyFormatter, formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { INSIGHT_PAGE_SIZE, defaultRange, renewalLabel, totalPagesOf, type ExpiringResponse, type NewResponse } from "@/lib/insights";
import { ContactCell, OwnerSummary } from "./contact-cell";
import { ExportButton } from "./export-button";
import { useInsightQuery } from "./use-insight-query";

const dayFormat = (value: string, timeZone: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(new Date(value));
const RANGE_ERRORS: Record<string, string> = {
  RANGE_TOO_LONG: "Rentang tanggal terlalu panjang (maksimal 24 bulan).",
  INVALID_RANGE: "Rentang tanggal tidak sah: tanggal akhir harus sama atau setelah tanggal awal.",
  INVALID_DATE: "Format tanggal tidak sah.",
};

function errorMessageOf(error: unknown): string {
  const code = (error as { value?: { code?: string } } | null)?.value?.code;
  return (code && RANGE_ERRORS[code]) || "Gagal memuat data.";
}

const newColumns = createDataTableColumns<NewResponse["items"][number]>();
const expColumns = createDataTableColumns<ExpiringResponse["items"][number]>();

function NewSubscriptions() {
  const timeZone = useCompanyTimezone();
  const [range, setRange] = useState(() => defaultRange(30, new Date(), timeZone));
  const [page, setPage] = useState(0);
  const valid = Boolean(range.from) && Boolean(range.to) && range.from <= range.to;
  const key = `new:${range.from}:${range.to}:${page}`;
  const { loading, data, failed, error } = useInsightQuery<NewResponse>(key, async () => {
    if (!valid) return { data: null, error: { value: { code: "INVALID_RANGE" } } };
    return (await api.admin.insights.new.get({ query: { from: range.from, to: range.to, page, pageSize: INSIGHT_PAGE_SIZE } })) as never;
  });

  const columns = useMemo(
    () => [
      newColumns.display({ id: "owner", header: "Pelanggan", meta: { width: "28%" }, cell: ({ row }) => (
        <div className="min-w-0">
          <OwnerSummary owner={row.original.owner} />
          {row.original.isNewCustomer ? <Badge variant="success">Pelanggan baru</Badge> : <Badge>Pelanggan lama</Badge>}
        </div>
      ) }),
      newColumns.display({ id: "contact", header: "Kontak", meta: { width: "22%" }, cell: ({ row }) => <ContactCell owner={row.original.owner} /> }),
      newColumns.display({
        id: "features",
        header: "Fitur",
        meta: { width: "34%" },
        cell: ({ row }) => (
          <span className="block truncate text-sm" title={row.original.features.map((f) => `${f.label} (${f.dataUsahaName})`).join(", ")}>
            {row.original.features.map((f) => f.label).join(", ")}
          </span>
        ),
      }),
      newColumns.display({ id: "start", header: "Mulai", meta: { width: "16%" }, cell: ({ row }) => <span className="text-xs">{dayFormat(row.original.firstStartAt, timeZone)}</span> }),
    ],
    [timeZone],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Dari
          <Input type="date" aria-label="Dari tanggal" value={range.from} onChange={(e) => { setRange({ ...range, from: e.target.value }); setPage(0); }} className="w-44" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Sampai
          <Input type="date" aria-label="Sampai tanggal" value={range.to} onChange={(e) => { setRange({ ...range, to: e.target.value }); setPage(0); }} className="w-44" />
        </label>
        <div className="ml-auto">{valid ? <ExportButton name="new" params={{ from: range.from, to: range.to }} /> : null}</div>
      </div>
      {!valid ? <Alert variant="warning">{RANGE_ERRORS.INVALID_RANGE}</Alert> : null}
      {valid && failed ? <Alert variant="destructive">{errorMessageOf(error)}</Alert> : null}
      {valid && loading ? <Skeleton className="h-48 w-full" /> : null}
      {valid && data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.summary.newCustomers} pelanggan baru · {data.summary.customers} pelanggan memulai langganan · {data.summary.subscriptions} langganan
          </p>
          <DataTable columns={columns} data={data.items} pageSize={INSIGHT_PAGE_SIZE} emptyTitle="Tidak ada langganan baru di rentang ini" />
          <Pagination page={page} totalPages={totalPagesOf(data.total, INSIGHT_PAGE_SIZE)} onPageChange={setPage} />
        </>
      ) : null}
    </div>
  );
}

function Expiring() {
  const timeZone = useCompanyTimezone();
  const [windowDays, setWindowDays] = useState<"14" | "30">("30");
  const [page, setPage] = useState(0);
  const { loading, data, failed } = useInsightQuery<ExpiringResponse>(`expiring:${windowDays}:${page}`, () =>
    api.admin.insights.expiring.get({ query: { window: windowDays, page, pageSize: INSIGHT_PAGE_SIZE } }) as never,
  );

  const columns = useMemo(
    () => [
      expColumns.display({ id: "owner", header: "Pelanggan", meta: { width: "26%" }, cell: ({ row }) => <OwnerSummary owner={row.original.owner} /> }),
      expColumns.display({ id: "contact", header: "Kontak", meta: { width: "22%" }, cell: ({ row }) => <ContactCell owner={row.original.owner} /> }),
      expColumns.display({
        id: "subs",
        header: "Langganan berakhir",
        meta: { width: "38%" },
        cell: ({ row }) => (
          <ul className="m-0 list-none space-y-1 p-0 text-xs">
            {row.original.subscriptions.map((s) => {
              const renewal = renewalLabel(s.renewal.status);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-2" title={`${s.label} — ${s.dataUsahaName}`}>
                  <span className="max-w-40 truncate font-medium">{s.label}</span>
                  <span>{dayFormat(s.endAt, timeZone)} ({s.daysLeft} hari)</span>
                  <Badge variant={renewal.tone === "ok" ? "success" : renewal.tone === "info" ? "primary" : "warning"}>
                    {renewal.text}
                    {s.renewal.status === "terbit" && s.renewal.amountDue !== undefined ? ` · ${currencyFormatter.format(s.renewal.amountDue)}` : ""}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ),
      }),
      expColumns.display({ id: "nearest", header: "Terdekat", meta: { width: "14%" }, cell: ({ row }) => <span className="text-xs">{dayFormat(row.original.nearestEndAt, timeZone)}</span> }),
    ],
    [timeZone],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Berakhir dalam</span>
        {(["14", "30"] as const).map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={windowDays === w}
            onClick={() => { setWindowDays(w); setPage(0); }}
            className={`rounded-md border px-3 py-1 text-sm ${windowDays === w ? "border-primary-500 bg-primary-100 text-primary-700" : "border-border hover:bg-muted"}`}
          >
            {w} hari
          </button>
        ))}
        <div className="ml-auto">
          <ExportButton name="expiring" params={{ window: windowDays }} />
        </div>
      </div>
      {failed ? <Alert variant="destructive">Gagal memuat langganan yang akan berakhir.</Alert> : null}
      {loading ? <Skeleton className="h-48 w-full" /> : null}
      {data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.summary.owners} pelanggan · {data.summary.subscriptions} langganan
          </p>
          <DataTable columns={columns} data={data.items} pageSize={INSIGHT_PAGE_SIZE} emptyTitle={`Tidak ada langganan yang berakhir dalam ${windowDays} hari`} />
          <Pagination page={page} totalPages={totalPagesOf(data.total, INSIGHT_PAGE_SIZE)} onPageChange={setPage} />
        </>
      ) : null}
    </div>
  );
}

// § Fase 189D — tab Langganan: sub-tab Baru (rentang tanggal, butir 5) dan Akan berakhir (14/30 hari + status tagihan perpanjangan, butir 6).
export function SubscriptionsTab() {
  return (
    <Tabs defaultValue="baru">
      <TabsList>
        <TabsTrigger value="baru">Baru</TabsTrigger>
        <TabsTrigger value="berakhir">Akan berakhir</TabsTrigger>
      </TabsList>
      <TabsContent value="baru"><NewSubscriptions /></TabsContent>
      <TabsContent value="berakhir"><Expiring /></TabsContent>
    </Tabs>
  );
}
