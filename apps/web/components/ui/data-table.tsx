"use client";

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// § ADR-0023 — akhirnya `@tanstack/react-table` (dependency sejak
// ADR-0004, 0 pemakaian nyata sebelum fase ini) benar-benar dipakai.
// 1 wrapper tipis di sini, bukan tiap halaman pasang sorting/pagination
// sendiri-sendiri. `features` didefinisikan SEKALI di module scope (v9
// mensyaratkan objek `features` yang sama dipakai `createColumnHelper`
// & `useTable` — lihat skill `@tanstack/table-core#typescript`).
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableFeatures = typeof features;
export type DataTableColumn<TData extends RowData, TValue = unknown> = ColumnDef<DataTableFeatures, TData, TValue>;

// Caller bikin kolom lewat helper ini (bukan `createColumnHelper` langsung)
// supaya selalu terikat ke `features` yang SAMA dengan yang dipakai
// `DataTable` di bawah.
export function createDataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  pageSize = 10,
  toolbar,
  emptyIcon,
  emptyTitle = "Belum ada data",
  emptyDescription,
  className,
}: {
  columns: DataTableColumn<TData, any>[];
  data: TData[];
  pageSize?: number;
  toolbar?: React.ReactNode;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  const table = useTable({
    features,
    columns,
    data,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  if (data.length === 0) {
    return emptyIcon ? <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} /> : null;
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {toolbar}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" && <ArrowUp className="h-3.5 w-3.5" />}
                        {sorted === "desc" && <ArrowDown className="h-3.5 w-3.5" />}
                        {!sorted && <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={table.state.pagination.pageIndex} totalPages={table.getPageCount()} onPageChange={table.setPageIndex} />
    </div>
  );
}
