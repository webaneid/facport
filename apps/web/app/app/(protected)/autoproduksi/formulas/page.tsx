"use client";

import { useEffect, useState } from "react";
import { Trash2, Boxes } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { api } from "@/lib/api-client";
import { filterFormulas } from "@/lib/filter-formulas";
import { itemComboboxOptions, warehouseComboboxOptions } from "@/lib/accurate-combobox-options";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

// § Fase 159, architecture-autoproduksi.md — modul PERTAMA Facport yang
// form-based (BUKAN Excel-upload seperti 23 modul lain). Formula (BOM):
// 1 Barang Jadi = kombinasi N Bahan Baku + takaran.
// § Fase 163, ADR-0039 (evaluasi client) — Barang Jadi/Bahan Baku/Akun
// Perantara SEKARANG dicari live ke Accurate (`GET /accurate/items/search`,
// `GET /accurate/glaccounts/search`, § accurate-lookup.route.ts) lewat
// `Combobox` yang sudah ada, BUKAN diketik manual lagi — kode+satuan+nama
// otomatis terisi begitu dipilih. `branchName` TETAP diketik manual
// (Accurate tidak punya endpoint search Cabang yang relevan di sini).
// § Fase 162 (evaluasi client) — kolom "Gudang" per baris Bahan Baku.
// § HOTFIX 2026-09-30 (evaluasi client) — Gudang (Barang Jadi & Bahan
// Baku) SEKARANG juga search-pilih ke Accurate (`GET /accurate/warehouses/search`)
// BUKAN ketik bebas lagi, supaya nama gudang konsisten dengan data ASLI
// Accurate (bukan typo). CATATAN: ini BUKAN "auto-fill" seperti Satuan —
// Accurate tidak punya konsep "gudang default" per Barang (stok tersebar
// di banyak gudang), jadi user tetap harus PILIH gudangnya sendiri, cuma
// dari daftar asli (bukan ketik manual).
type AccurateItemResult = { no: string; name: string; unitName: string };
type AccurateAccountResult = { no: string; name: string };
type AccurateWarehouseResult = { name: string };

type FormulaItem = { itemNo: string; itemUnitName: string; itemName?: string; quantity: number; warehouseName?: string };
type Formula = {
  id: string;
  name: string;
  finishedGoodItemNo: string;
  finishedGoodItemUnitName: string;
  finishedGoodItemName: string | null;
  standardCost: string | null;
  adjustmentAccountNo: string;
  adjustmentAccountName: string | null;
  branchName: string;
  warehouseName: string | null;
};
type FormulaDetail = { formula: Formula; items: FormulaItem[] };

const EMPTY_ITEM: FormulaItem = { itemNo: "", itemUnitName: "", quantity: 0 };

async function searchAccurateItems(q: string): Promise<AccurateItemResult[]> {
  if (!q.trim()) return [];
  const res = await api.accurate.items.search.get({ query: { q } });
  return res.data ? (res.data as unknown as { items: AccurateItemResult[] }).items : [];
}

async function searchAccurateAccounts(q: string): Promise<AccurateAccountResult[]> {
  if (!q.trim()) return [];
  const res = await api.accurate.glaccounts.search.get({ query: { q } });
  return res.data ? (res.data as unknown as { accounts: AccurateAccountResult[] }).accounts : [];
}

async function searchAccurateWarehouses(q: string): Promise<AccurateWarehouseResult[]> {
  if (!q.trim()) return [];
  const res = await api.accurate.warehouses.search.get({ query: { q } });
  return res.data ? (res.data as unknown as { warehouses: AccurateWarehouseResult[] }).warehouses : [];
}

function FormulaFormDialog({ formulaId, onSaved }: { formulaId?: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [finishedGoodItemNo, setFinishedGoodItemNo] = useState("");
  const [finishedGoodItemUnitName, setFinishedGoodItemUnitName] = useState("");
  const [finishedGoodItemName, setFinishedGoodItemName] = useState("");
  const [finishedGoodResults, setFinishedGoodResults] = useState<AccurateItemResult[]>([]);
  const [standardCost, setStandardCost] = useState("");
  const [adjustmentAccountNo, setAdjustmentAccountNo] = useState("");
  const [adjustmentAccountName, setAdjustmentAccountName] = useState("");
  const [accountResults, setAccountResults] = useState<AccurateAccountResult[]>([]);
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [items, setItems] = useState<FormulaItem[]>([{ ...EMPTY_ITEM }]);
  // § Bahan Baku pakai endpoint search yang SAMA (`item/list.do` mencakup
  // Barang Jadi & Bahan Baku, sama-sama "Item" di Accurate) — 1 state hasil
  // pencarian DIBAGI semua baris (cuma 1 Combobox baris yang aktif dicari
  // dalam satu waktu), fallback per-baris (§ `itemComboboxOptions`) yang
  // menjaga baris LAIN tetap tampil benar walau state ini berubah.
  const [itemResults, setItemResults] = useState<AccurateItemResult[]>([]);
  // § Gudang Barang Jadi vs Gudang per-baris Bahan Baku dipisah jadi 2 state
  // hasil pencarian (bukan digabung 1 seperti Item) karena keduanya sering
  // dicari BERSAMAAN di layar yang sama (1 field Gudang Barang Jadi + N
  // baris Gudang Bahan Baku) — kalau digabung 1 state, hasil salah satu
  // bisa "menimpa" tampilan yang lain.
  const [finishedGoodWarehouseResults, setFinishedGoodWarehouseResults] = useState<AccurateWarehouseResult[]>([]);
  const [itemWarehouseResults, setItemWarehouseResults] = useState<AccurateWarehouseResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // § HOTFIX 2026-09-29 — WAJIB debounce (§ use-debounced-callback.ts):
  // ditemukan NYATA di production, ketik 4 huruf ("gula") tanpa debounce
  // langsung 429 dari Accurate (rate limit /accurate 60/menit per-IP,
  // dibagi bersama traffic Accurate lain). 350ms sama seperti default
  // `SearchForm` (§ ADR-0024) — konsisten timing debounce lintas project.
  const debouncedFinishedGoodSearch = useDebouncedCallback(async (q: string) => setFinishedGoodResults(await searchAccurateItems(q)), 350);
  const debouncedItemSearch = useDebouncedCallback(async (q: string) => setItemResults(await searchAccurateItems(q)), 350);
  const debouncedAccountSearch = useDebouncedCallback(async (q: string) => setAccountResults(await searchAccurateAccounts(q)), 350);
  const debouncedFinishedGoodWarehouseSearch = useDebouncedCallback(async (q: string) => setFinishedGoodWarehouseResults(await searchAccurateWarehouses(q)), 350);
  const debouncedItemWarehouseSearch = useDebouncedCallback(async (q: string) => setItemWarehouseResults(await searchAccurateWarehouses(q)), 350);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setFinishedGoodResults([]);
    setAccountResults([]);
    setItemResults([]);
    setFinishedGoodWarehouseResults([]);
    setItemWarehouseResults([]);
    if (!formulaId) {
      setName("");
      setFinishedGoodItemNo("");
      setFinishedGoodItemUnitName("");
      setFinishedGoodItemName("");
      setStandardCost("");
      setAdjustmentAccountNo("");
      setAdjustmentAccountName("");
      setBranchName("");
      setWarehouseName("");
      setItems([{ ...EMPTY_ITEM }]);
      return;
    }
    const res = await api.autoproduksi.formulas({ id: formulaId }).get();
    if (res.data) {
      const detail = res.data as unknown as FormulaDetail;
      setName(detail.formula.name);
      setFinishedGoodItemNo(detail.formula.finishedGoodItemNo);
      setFinishedGoodItemUnitName(detail.formula.finishedGoodItemUnitName);
      setFinishedGoodItemName(detail.formula.finishedGoodItemName ?? "");
      setStandardCost(detail.formula.standardCost ?? "");
      setAdjustmentAccountNo(detail.formula.adjustmentAccountNo);
      setAdjustmentAccountName(detail.formula.adjustmentAccountName ?? "");
      setBranchName(detail.formula.branchName);
      setWarehouseName(detail.formula.warehouseName ?? "");
      setItems(detail.items.length > 0 ? detail.items : [{ ...EMPTY_ITEM }]);
    }
  }

  function updateItem(index: number, patch: Partial<FormulaItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function selectFinishedGood(no: string) {
    const record = finishedGoodResults.find((r) => r.no === no);
    setFinishedGoodItemNo(no);
    if (record) {
      setFinishedGoodItemUnitName(record.unitName);
      setFinishedGoodItemName(record.name);
    }
  }

  function selectAccount(no: string) {
    const record = accountResults.find((r) => r.no === no);
    setAdjustmentAccountNo(no);
    if (record) setAdjustmentAccountName(record.name);
  }

  function selectItemForRow(index: number, no: string) {
    const record = itemResults.find((r) => r.no === no);
    updateItem(index, { itemNo: no, ...(record ? { itemUnitName: record.unitName, itemName: record.name } : {}) });
  }

  async function handleSave() {
    if (!name.trim() || !finishedGoodItemNo.trim() || !finishedGoodItemUnitName.trim() || !adjustmentAccountNo.trim() || !branchName.trim()) {
      setError("Nama Formula, Barang Jadi, Akun Perantara, dan Cabang wajib diisi.");
      return;
    }
    const validItems = items.filter((i) => i.itemNo.trim() && i.itemUnitName.trim() && i.quantity > 0);
    if (validItems.length === 0) {
      setError("Minimal 1 Bahan Baku (kode barang, satuan, dan takaran > 0).");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      name: name.trim(),
      finishedGoodItemNo: finishedGoodItemNo.trim(),
      finishedGoodItemUnitName: finishedGoodItemUnitName.trim(),
      ...(finishedGoodItemName.trim() ? { finishedGoodItemName: finishedGoodItemName.trim() } : {}),
      ...(standardCost.trim() ? { standardCost: Number(standardCost) } : {}),
      adjustmentAccountNo: adjustmentAccountNo.trim(),
      ...(adjustmentAccountName.trim() ? { adjustmentAccountName: adjustmentAccountName.trim() } : {}),
      branchName: branchName.trim(),
      ...(warehouseName.trim() ? { warehouseName: warehouseName.trim() } : {}),
      items: validItems.map((i) => ({
        itemNo: i.itemNo.trim(),
        itemUnitName: i.itemUnitName.trim(),
        ...(i.itemName?.trim() ? { itemName: i.itemName.trim() } : {}),
        quantity: i.quantity,
        ...(i.warehouseName?.trim() ? { warehouseName: i.warehouseName.trim() } : {}),
      })),
    };
    const res = formulaId ? await api.autoproduksi.formulas({ id: formulaId }).put(body) : await api.autoproduksi.formulas.post(body);
    setSubmitting(false);
    if (res.error) {
      setError("Gagal menyimpan formula — cek kembali isian.");
      return;
    }
    toast.success(formulaId ? "Formula diperbarui." : "Formula dibuat.");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {formulaId ? (
        <button type="button" onClick={openDialog} className={buttonVariants("outline", "h-8")}>
          Edit
        </button>
      ) : (
        <Button onClick={openDialog}>Tambah Formula</Button>
      )}
      <DialogContent className="max-w-2xl">
        <DialogTitle>{formulaId ? "Edit Formula" : "Tambah Formula"}</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Nama Formula</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='mis. "Bolu Kukus SP (Spesial BGT)"' />
          </label>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
            <span className="col-span-2 text-xs font-medium text-foreground">Barang Jadi</span>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Cari Barang (Accurate)</span>
              <Combobox
                value={finishedGoodItemNo}
                onChange={selectFinishedGood}
                onSearch={debouncedFinishedGoodSearch}
                placeholder="Ketik kode/nama barang..."
                options={itemComboboxOptions(finishedGoodItemNo, finishedGoodItemName, finishedGoodResults)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Satuan (otomatis)</span>
              <Input value={finishedGoodItemUnitName} disabled placeholder="Pilih barang dulu" />
            </label>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Standard Cost (opsional — diisi manual)</span>
              <Input type="number" value={standardCost} onChange={(e) => setStandardCost(e.target.value)} placeholder="20000" />
            </label>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Bahan Baku (takaran per 1 unit Barang Jadi)</span>
              <button type="button" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])} className={buttonVariants("outline", "h-7 text-xs")}>
                + Baris
              </button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[1.6fr_0.8fr_0.8fr_1.2fr_auto] gap-2">
                <Combobox
                  value={item.itemNo}
                  onChange={(no) => selectItemForRow(index, no)}
                  onSearch={debouncedItemSearch}
                  placeholder="Cari Bahan Baku..."
                  options={itemComboboxOptions(item.itemNo, item.itemName, itemResults)}
                />
                <Input value={item.itemUnitName} disabled placeholder="Satuan" />
                <Input
                  type="number"
                  value={item.quantity || ""}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  placeholder="Takaran, 0.5"
                />
                <Combobox
                  value={item.warehouseName ?? ""}
                  onChange={(name) => updateItem(index, { warehouseName: name })}
                  onSearch={debouncedItemWarehouseSearch}
                  placeholder="Gudang (opsional)"
                  options={warehouseComboboxOptions(item.warehouseName, itemWarehouseResults)}
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  disabled={items.length === 1}
                  className={buttonVariants("ghost", "h-9 w-9 p-0 text-destructive disabled:opacity-30")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
            <span className="col-span-2 text-xs font-medium text-foreground">Konfigurasi Lainnya</span>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Akun Perantara (cari di Accurate)</span>
              <Combobox
                value={adjustmentAccountNo}
                onChange={selectAccount}
                onSearch={debouncedAccountSearch}
                placeholder="Ketik kode/nama akun..."
                options={itemComboboxOptions(adjustmentAccountNo, adjustmentAccountName, accountResults)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Cabang</span>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="JAKARTA" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Gudang Barang Jadi (opsional)</span>
              <Combobox
                value={warehouseName}
                onChange={setWarehouseName}
                onSearch={debouncedFinishedGoodWarehouseSearch}
                placeholder="Cari Gudang..."
                options={warehouseComboboxOptions(warehouseName, finishedGoodWarehouseResults)}
              />
            </label>
          </div>

          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<Formula>();

export default function AutoProduksiFormulasPage() {
  const [formulas, setFormulas] = useState<Formula[] | null>(null);
  // § Fase 162 (evaluasi client) — search nama Formula + filter Cabang,
  // client-side (dataset per Data Usaha kecil, § plan file). Fungsi
  // filter diekstrak ke `lib/filter-formulas.ts` supaya testable.
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string | null>(null);

  async function load() {
    const res = await api.autoproduksi.formulas.get();
    if (res.data) setFormulas((res.data as unknown as { formulas: Formula[] }).formulas);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, []);

  async function handleDelete(formula: Formula) {
    const res = await api.autoproduksi.formulas({ id: formula.id }).delete();
    if (res.error) {
      toast.error("Gagal menghapus formula.");
      return;
    }
    toast.success("Formula dihapus.");
    load();
  }

  const columns = [
    columnHelper.accessor("name", { header: "Nama Formula", meta: { width: "30%" } }),
    columnHelper.display({
      id: "finishedGood",
      header: "Barang Jadi",
      cell: ({ row }) => (
        // § Fase 163 — tampilkan NAMA hasil live-search kalau ada (Formula
        // baru/diedit lewat Combobox), fallback ke kode saja untuk Formula
        // lama (dibuat sebelum Fase 163, belum punya nama tersimpan).
        <span>
          {row.original.finishedGoodItemName ? (
            <>
              {row.original.finishedGoodItemName} <span className="text-muted-foreground">({row.original.finishedGoodItemNo})</span>
            </>
          ) : (
            <>
              {row.original.finishedGoodItemNo} <span className="text-muted-foreground">({row.original.finishedGoodItemUnitName})</span>
            </>
          )}
        </span>
      ),
    }),
    columnHelper.display({
      id: "adjustmentAccount",
      header: "Akun Perantara",
      cell: ({ row }) => (row.original.adjustmentAccountName ? `${row.original.adjustmentAccountName} (${row.original.adjustmentAccountNo})` : row.original.adjustmentAccountNo),
    }),
    columnHelper.accessor("branchName", { header: "Cabang" }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      meta: { width: "110px" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <FormulaFormDialog formulaId={row.original.id} onSaved={load} />
          <button
            type="button"
            onClick={() => handleDelete(row.original)}
            title="Hapus"
            aria-label={`Hapus formula ${row.original.name}`}
            className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:text-destructive")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ];

  // § Fase 162 — opsi filter Cabang diambil dari data Formula yang SUDAH
  // ada (tidak perlu fetch daftar Cabang dari Accurate, cukup Cabang yang
  // benar-benar dipakai di Formula Data Usaha ini).
  const branchOptions = formulas ? [...new Set(formulas.map((f) => f.branchName))].sort() : [];
  const filteredFormulas = formulas ? filterFormulas(formulas, { search, branch: branchFilter }) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">List Formula</h1>
          <p className="text-sm text-muted-foreground">Resep produksi — Barang Jadi terdiri dari Bahan Baku apa saja & takarannya.</p>
        </div>
        <FormulaFormDialog onSaved={load} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Formula</CardTitle>
          <CardDescription>Barang/Akun dicari langsung ke Accurate — kode & nama otomatis terisi saat dipilih.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {formulas && formulas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama Formula..." className="max-w-xs" />
              <div className="w-48">
                <Combobox
                  value={branchFilter ?? ""}
                  onChange={(v) => setBranchFilter(v || null)}
                  placeholder="Semua Cabang"
                  options={[{ value: "", label: "Semua Cabang" }, ...branchOptions.map((b) => ({ value: b, label: b }))]}
                />
              </div>
            </div>
          )}
          {!filteredFormulas ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={filteredFormulas}
              emptyIcon={Boxes}
              emptyTitle={formulas && formulas.length > 0 ? "Tidak ada Formula yang cocok" : "Belum ada formula"}
              emptyDescription={
                formulas && formulas.length > 0 ? "Coba ubah kata pencarian atau filter Cabang." : 'Klik "Tambah Formula" untuk bikin resep pertama.'
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
