"use client";

import { useEffect, useState } from "react";
import { Trash2, Settings as SettingsIcon, Landmark } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { api } from "@/lib/api-client";
import { SettingsSectionHeader } from "@/components/autoproduksi/settings-section-header";
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengaturan AutoProduksi</h1>
        <p className="text-sm text-muted-foreground">Dua pengaturan yang dipakai saat membuat Formula dan menjalankan Input Produksi.</p>
        {/* Pintasan ke tiap bagian — tombol aksi ada di dalam kartu masing-masing, bukan di judul halaman ini. */}
        <nav aria-label="Bagian pengaturan" className="mt-3 flex flex-wrap gap-2 text-xs">
          <a href="#akun-perantara" className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            1. Akun Perantara
          </a>
          <a href="#default-cabang-gudang" className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            2. Default Cabang &amp; Gudang
          </a>
        </nav>
      </div>

      {/* Bagian 1 — Akun Perantara (dipakai saat bikin Formula, jadi di atas). Tombol "Buat Akun Baru" milik bagian ini. */}
      <Card id="akun-perantara" className="scroll-mt-6">
        <SettingsSectionHeader
          icon={Landmark}
          title="Akun Perantara"
          description="Akun yang dipakai saat bikin atau edit Formula. Bisa juga bikin baru langsung dari form Formula."
          action={<IntermediaryAccountFormDialog onSaved={load} />}
        />
        <CardContent className="pt-4">
          {!accounts ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={accounts}
              emptyIcon={SettingsIcon}
              emptyTitle="Belum ada Akun Perantara"
              emptyDescription='Klik "Buat Akun Baru" di kanan atas kartu ini untuk menambah akun pertama.'
            />
          )}
        </CardContent>
      </Card>

      {/* Bagian 2 — Default Cabang & Gudang, tombol Simpan ada di dalam kartunya sendiri. */}
      <ContextDefaultsCard id="default-cabang-gudang" />
    </div>
  );
}
