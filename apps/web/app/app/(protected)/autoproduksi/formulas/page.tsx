"use client";

import { useEffect, useState } from "react";
import { Trash2, Boxes } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { api } from "@/lib/api-client";

// § Fase 159, architecture-autoproduksi.md — modul PERTAMA Facport yang
// form-based (BUKAN Excel-upload seperti 23 modul lain). Formula (BOM):
// 1 Barang Jadi = kombinasi N Bahan Baku + takaran. `itemNo`/
// `adjustmentAccountNo`/`branchName`/`warehouseName` diketik APA ADANYA
// (TIDAK ada lookup/pencarian live ke Accurate — Accurate yang validasi
// eksistensi saat "Input Produksi" beneran diproses, § konsisten filosofi
// SEMUA modul lain, dicek lagi saat eksekusi fase ini — TIDAK ada satu pun
// modul di Facport yang punya live-search Accurate dari browser).
type FormulaItem = { itemNo: string; itemUnitName: string; quantity: number; warehouseName?: string };
type Formula = {
  id: string;
  name: string;
  finishedGoodItemNo: string;
  finishedGoodItemUnitName: string;
  standardCost: string | null;
  adjustmentAccountNo: string;
  branchName: string;
  warehouseName: string | null;
};
type FormulaDetail = { formula: Formula; items: FormulaItem[] };

const EMPTY_ITEM: FormulaItem = { itemNo: "", itemUnitName: "", quantity: 0 };

function FormulaFormDialog({ formulaId, onSaved }: { formulaId?: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [finishedGoodItemNo, setFinishedGoodItemNo] = useState("");
  const [finishedGoodItemUnitName, setFinishedGoodItemUnitName] = useState("");
  const [standardCost, setStandardCost] = useState("");
  const [adjustmentAccountNo, setAdjustmentAccountNo] = useState("");
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [items, setItems] = useState<FormulaItem[]>([{ ...EMPTY_ITEM }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    setError(null);
    if (!formulaId) {
      setName("");
      setFinishedGoodItemNo("");
      setFinishedGoodItemUnitName("");
      setStandardCost("");
      setAdjustmentAccountNo("");
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
      setStandardCost(detail.formula.standardCost ?? "");
      setAdjustmentAccountNo(detail.formula.adjustmentAccountNo);
      setBranchName(detail.formula.branchName);
      setWarehouseName(detail.formula.warehouseName ?? "");
      setItems(detail.items.length > 0 ? detail.items : [{ ...EMPTY_ITEM }]);
    }
  }

  function updateItem(index: number, patch: Partial<FormulaItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
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
      ...(standardCost.trim() ? { standardCost: Number(standardCost) } : {}),
      adjustmentAccountNo: adjustmentAccountNo.trim(),
      branchName: branchName.trim(),
      ...(warehouseName.trim() ? { warehouseName: warehouseName.trim() } : {}),
      items: validItems.map((i) => ({
        itemNo: i.itemNo.trim(),
        itemUnitName: i.itemUnitName.trim(),
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
              <span className="text-xs text-muted-foreground">Kode Barang (Accurate)</span>
              <Input value={finishedGoodItemNo} onChange={(e) => setFinishedGoodItemNo(e.target.value)} placeholder="100011" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Satuan</span>
              <Input value={finishedGoodItemUnitName} onChange={(e) => setFinishedGoodItemUnitName(e.target.value)} placeholder="Loyang" />
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
              <div key={index} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
                <Input value={item.itemNo} onChange={(e) => updateItem(index, { itemNo: e.target.value })} placeholder="Kode Barang, mis. 100012" />
                <Input value={item.itemUnitName} onChange={(e) => updateItem(index, { itemUnitName: e.target.value })} placeholder="Satuan, KG" />
                <Input
                  type="number"
                  value={item.quantity || ""}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  placeholder="Takaran, 0.5"
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
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Akun Perantara (kode akun Accurate)</span>
              <Input value={adjustmentAccountNo} onChange={(e) => setAdjustmentAccountNo(e.target.value)} placeholder="11078" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Cabang</span>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="JAKARTA" />
            </label>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Gudang Barang Jadi (opsional)</span>
              <Input value={warehouseName} onChange={(e) => setWarehouseName(e.target.value)} placeholder="Gudang Utama" />
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
        <span>
          {row.original.finishedGoodItemNo} <span className="text-muted-foreground">({row.original.finishedGoodItemUnitName})</span>
        </span>
      ),
    }),
    columnHelper.accessor("adjustmentAccountNo", { header: "Akun Perantara" }),
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
          <CardDescription>Kode barang & akun diketik apa adanya — divalidasi Accurate saat Input Produksi diproses.</CardDescription>
        </CardHeader>
        <CardContent>
          {!formulas ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={formulas}
              emptyIcon={Boxes}
              emptyTitle="Belum ada formula"
              emptyDescription='Klik "Tambah Formula" untuk bikin resep pertama.'
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
