"use client";

import { useEffect, useState } from "react";
import { Trash2, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { api } from "@/lib/api-client";
import { ContextDefaultsCard } from "@/components/autoproduksi/context-defaults-card";
import { IntermediaryAccountFormDialog, type IntermediaryAccount } from "@/components/autoproduksi/intermediary-account-form-dialog";

// § diminta client 2026-10-02 — Akun Perantara jadi master data lokal
// (bukan live-search Accurate lagi, § komentar lengkap di
// `autoproduksi.schema.ts` dan `formulas/page.tsx`). Halaman ini tempat
// kelola daftarnya — pola PERSIS `formulas/page.tsx` (Card + DataTable +
// dialog Tambah/Edit/Hapus).
const columnHelper = createDataTableColumns<IntermediaryAccount>();

export default function AutoProduksiSettingsPage() {
  const [accounts, setAccounts] = useState<IntermediaryAccount[] | null>(null);

  async function load() {
    const res = await api.autoproduksi.accounts.get();
    if (res.data) setAccounts((res.data as unknown as { accounts: IntermediaryAccount[] }).accounts);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, []);

  async function handleDelete(account: IntermediaryAccount) {
    const res = await api.autoproduksi.accounts({ id: account.id }).delete();
    if (res.error) {
      toast.error("Gagal menghapus akun.");
      return;
    }
    toast.success("Akun Perantara dihapus.");
    load();
  }

  const columns = [
    columnHelper.accessor("accountNo", { header: "Kode Akun", meta: { width: "25%" } }),
    columnHelper.accessor("accountName", { header: "Nama Akun" }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      meta: { width: "110px" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <IntermediaryAccountFormDialog account={row.original} trigger="icon" onSaved={load} />
          <button
            type="button"
            onClick={() => handleDelete(row.original)}
            title="Hapus"
            aria-label={`Hapus akun ${row.original.accountName}`}
            className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:text-destructive")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengaturan AutoProduksi</h1>
          <p className="text-sm text-muted-foreground">
            Default Cabang & Gudang, dan daftar Akun Perantara yang dipakai saat bikin Formula — dikelola sendiri di sini.
          </p>
        </div>
        <IntermediaryAccountFormDialog onSaved={load} />
      </div>

      <ContextDefaultsCard />

      <Card>
        <CardHeader>
          <CardTitle>Akun Perantara</CardTitle>
          <CardDescription>Dipilih saat bikin/edit Formula — bisa juga bikin baru langsung dari form Formula.</CardDescription>
        </CardHeader>
        <CardContent>
          {!accounts ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={accounts}
              emptyIcon={SettingsIcon}
              emptyTitle="Belum ada Akun Perantara"
              emptyDescription='Klik "Buat Akun Baru" untuk tambah akun pertama.'
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
