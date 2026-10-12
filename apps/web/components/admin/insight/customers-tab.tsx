"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { SearchForm } from "@/components/ui/search-form";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { INSIGHT_PAGE_SIZE, kindLabel, totalPagesOf, type CustomerRow, type CustomersResponse } from "@/lib/insights";
import { ContactCell, OwnerSummary } from "./contact-cell";
import { CustomerAccessDialog } from "./customer-access-dialog";
import { ExportButton } from "./export-button";
import { useInsightQuery } from "./use-insight-query";

type TypeFilter = "all" | "commercial" | "internal";
const columnHelper = createDataTableColumns<CustomerRow>();

// § Fase 189D — tab Pelanggan (semua akun customer + kontak/WhatsApp) dan tab Akses (`mode="akses"`: hanya pemilik + jumlah slot User Tambahan).
// Kolom sedikit, lebar persen, teks dipotong — detail lewat tombol "Lihat" (dialog), bukan kolom tambahan.
export function CustomersTab({ mode }: { mode: "pelanggan" | "akses" }) {
  const timeZone = useCompanyTimezone();
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState<CustomerRow | null>(null);

  const kind = mode === "akses" ? "pemilik" : undefined;
  const key = `customers:${mode}:${q}:${type}:${page}`;
  const { loading, data, failed } = useInsightQuery<CustomersResponse>(key, () =>
    api.admin.insights.customers.get({ query: { q: q || undefined, type, kind, page, pageSize: INSIGHT_PAGE_SIZE } }) as never,
  );

  const columns = useMemo(
    () => [
      columnHelper.display({ id: "owner", header: "Pelanggan", meta: { width: "28%" }, cell: ({ row }) => <OwnerSummary owner={row.original} internalReason={row.original.internalReason} /> }),
      columnHelper.display({ id: "contact", header: "Kontak", meta: { width: "24%" }, cell: ({ row }) => <ContactCell owner={row.original} /> }),
      mode === "akses"
        ? columnHelper.display({
            id: "seats",
            header: "User Tambahan",
            meta: { width: "28%" },
            cell: ({ row }) => {
              const s = row.original.seats;
              return (
                <span className="text-sm">
                  {s.active} aktif · {s.invited} diundang · {s.available} tersedia
                </span>
              );
            },
          })
        : columnHelper.display({
            id: "kind",
            header: "Jenis · Data Usaha",
            meta: { width: "28%" },
            cell: ({ row }) => (
              <div className="min-w-0 text-sm">
                <Badge>{kindLabel(row.original.kind)}</Badge>
                <p className="m-0 mt-1 truncate text-xs text-muted-foreground">
                  {row.original.ownedDataUsaha} Data Usaha · {row.original.activeFeatures.length} fitur aktif
                </p>
              </div>
            ),
          }),
      columnHelper.display({
        id: "end",
        header: mode === "akses" ? "Terdaftar" : "Berakhir terdekat",
        meta: { width: "12%" },
        cell: ({ row }) => {
          const value = mode === "akses" ? row.original.createdAt : row.original.nearestEndAt;
          return <span className="text-xs">{value ? formatDate(value, timeZone) : "—"}</span>;
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        meta: { width: "8%" },
        cell: ({ row }) => (
          <Button type="button" variant="outline" className="h-8 gap-1 px-2" onClick={() => setViewing(row.original)} aria-label={`Lihat ${row.original.name}`}>
            <Eye className="h-4 w-4" />
            Lihat
          </Button>
        ),
      }),
    ],
    [mode, timeZone],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchForm
        placeholder="Cari nama, email, atau perusahaan…"
        onSearch={(v) => {
          setQ(v);
          setPage(0);
        }}
      />
      <Select
        aria-label="Tipe akun"
        value={type}
        onChange={(e) => {
          setType(e.target.value as TypeFilter);
          setPage(0);
        }}
        className="w-40"
      >
        <option value="all">Semua tipe</option>
        <option value="commercial">Komersil</option>
        <option value="internal">Internal</option>
      </Select>
      <div className="ml-auto">
        <ExportButton name="customers" params={{ q: q || undefined, type, accountKind: kind }} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {toolbar}
      {failed ? <Alert variant="destructive">Gagal memuat daftar pelanggan.</Alert> : null}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : data ? (
        <>
          <DataTable columns={columns} data={data.items} pageSize={INSIGHT_PAGE_SIZE} emptyTitle="Tidak ada pelanggan" emptyDescription="Ubah kata kunci atau filter pencarian." />
          <Pagination page={page} totalPages={totalPagesOf(data.total, INSIGHT_PAGE_SIZE)} onPageChange={setPage} />
          <p className="text-xs text-muted-foreground">{data.total.toLocaleString("id-ID")} akun</p>
        </>
      ) : null}
      <CustomerAccessDialog userId={viewing?.id ?? null} name={viewing?.name ?? ""} onClose={() => setViewing(null)} />
    </div>
  );
}
