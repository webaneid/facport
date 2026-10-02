"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { warehouseComboboxOptions } from "@/lib/accurate-combobox-options";
import { searchAccurateWarehouses, type AccurateWarehouseResult } from "@/lib/accurate-warehouse-search";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { SearchableField } from "@/components/autoproduksi/searchable-accurate-field";

// § Fase 159 — form PALING SEDERHANA di seluruh Facport: pilih formula +
// input qty produksi, sisanya OTOMATIS (hitung kebutuhan bahan baku, kirim
// ke Accurate). Konfirmasi alur ke user 2026-09-28: "cukup bilang produksi
// berapa Bolu, sisanya otomatis mengikuti resep yang sudah didefinisikan
// di awal". Diproses ASYNC lewat job queue (JOBS.PROCESS_AUTOPRODUKSI_ENTRY)
// — submit langsung dapat status "pending", hasil final dicek di halaman
// Riwayat (polling), konsisten pola 23 modul lain (bukan tunggu di halaman
// ini).
// § Fase 168 (diminta client) — Cabang/Gudang Barang Jadi/Gudang Bahan
// Baku/Proyek/Departemen SEKARANG di sini (konteks per-produksi, pindahan
// dari Formula — 1 Formula sekarang dipakai lintas cabang/gudang), semua
// OPSIONAL. Gudang Bahan Baku SATU pilihan berlaku ke SEMUA Bahan Baku
// resep ini (bukan per-item lagi). Hanya Formula yang AKTIF yang muncul di
// Combobox (non-aktif disaring di sini, server juga menolak 409 kalau
// tetap dipaksa — § autoproduksi.route.ts).
type Formula = { id: string; name: string; finishedGoodItemUnitName: string; isActive: boolean };

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AutoProduksiInputPage() {
  const [formulas, setFormulas] = useState<Formula[] | null>(null);
  const [formulaId, setFormulaId] = useState("");
  const [producedQty, setProducedQty] = useState("");
  const [transDate, setTransDate] = useState(todayIsoDate());
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [rawMaterialWarehouseName, setRawMaterialWarehouseName] = useState("");
  const [projectNo, setProjectNo] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [finishedGoodWarehouseResults, setFinishedGoodWarehouseResults] = useState<AccurateWarehouseResult[]>([]);
  const [rawMaterialWarehouseResults, setRawMaterialWarehouseResults] = useState<AccurateWarehouseResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const debouncedFinishedGoodWarehouseSearch = useDebouncedCallback(async (q: string) => setFinishedGoodWarehouseResults(await searchAccurateWarehouses(q)), 350);
  const debouncedRawMaterialWarehouseSearch = useDebouncedCallback(async (q: string) => setRawMaterialWarehouseResults(await searchAccurateWarehouses(q)), 350);

  useEffect(() => {
    (async () => {
      const res = await api.autoproduksi.formulas.get();
      if (res.data) setFormulas((res.data as unknown as { formulas: Formula[] }).formulas);
    })();
  }, []);

  const activeFormulas = formulas?.filter((f) => f.isActive) ?? null;
  const selectedFormula = activeFormulas?.find((f) => f.id === formulaId);

  async function handleSubmit() {
    if (!formulaId) {
      toast.error("Pilih formula dulu.");
      return;
    }
    const qty = Number(producedQty);
    if (!qty || qty <= 0) {
      toast.error("Qty produksi harus lebih dari 0.");
      return;
    }
    setSubmitting(true);
    const res = await api.autoproduksi["production-entries"].post({
      formulaId,
      producedQty: qty,
      transDate,
      ...(branchName.trim() ? { branchName: branchName.trim() } : {}),
      ...(warehouseName.trim() ? { warehouseName: warehouseName.trim() } : {}),
      ...(rawMaterialWarehouseName.trim() ? { rawMaterialWarehouseName: rawMaterialWarehouseName.trim() } : {}),
      ...(projectNo.trim() ? { projectNo: projectNo.trim() } : {}),
      ...(departmentName.trim() ? { departmentName: departmentName.trim() } : {}),
    });
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string } | undefined;
      toast.error(value?.code === "FORMULA_INACTIVE" ? "Formula ini sedang non-aktif — aktifkan dulu di List Formula." : "Gagal submit input produksi.");
      return;
    }
    toast.success("Input produksi terkirim — cek status di halaman Riwayat.");
    setProducedQty("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Input Produksi</h1>
        <p className="text-sm text-muted-foreground">
          Pilih formula & qty hasil produksi — kebutuhan Bahan Baku dihitung otomatis sesuai resep.
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Form Input Produksi</CardTitle>
          <CardDescription>Belum ada formula? Buat dulu di halaman List Formula.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!activeFormulas ? (
            <Skeleton className="h-40 w-full" />
          ) : activeFormulas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada formula aktif.{" "}
              <Link href="/autoproduksi/formulas" className="text-primary underline">
                Buat atau aktifkan formula
              </Link>
              .
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-foreground">Formula / Resep</span>
                <Combobox
                  options={activeFormulas.map((f) => ({ value: f.id, label: f.name }))}
                  value={formulaId}
                  onChange={setFormulaId}
                  placeholder="Pilih formula..."
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-foreground">Tanggal Transaksi</span>
                <Input type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-foreground">
                  Qty Produksi {selectedFormula ? `(${selectedFormula.finishedGoodItemUnitName})` : ""}
                </span>
                <Input type="number" value={producedQty} onChange={(e) => setProducedQty(e.target.value)} placeholder="1" />
              </label>

              <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                <span className="text-xs font-medium text-foreground">Konteks Produksi (opsional)</span>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">Cabang</span>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="JAKARTA" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">Gudang Barang Jadi</span>
                  <SearchableField
                    value={warehouseName}
                    onChange={setWarehouseName}
                    onSearch={debouncedFinishedGoodWarehouseSearch}
                    placeholder="Cari Gudang..."
                    options={warehouseComboboxOptions(warehouseName, finishedGoodWarehouseResults)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">Gudang Bahan Baku (berlaku ke semua Bahan Baku resep ini)</span>
                  <SearchableField
                    value={rawMaterialWarehouseName}
                    onChange={setRawMaterialWarehouseName}
                    onSearch={debouncedRawMaterialWarehouseSearch}
                    placeholder="Cari Gudang..."
                    options={warehouseComboboxOptions(rawMaterialWarehouseName, rawMaterialWarehouseResults)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Proyek</span>
                    <Input value={projectNo} onChange={(e) => setProjectNo(e.target.value)} placeholder="Kode proyek" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Departemen</span>
                    <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="Nama departemen" />
                  </label>
                </div>
              </div>

              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Mengirim..." : "Input Produksi"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
