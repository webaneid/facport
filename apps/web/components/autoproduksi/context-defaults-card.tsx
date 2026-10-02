"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { warehouseComboboxOptions } from "@/lib/accurate-combobox-options";
import { searchAccurateWarehouses, type AccurateWarehouseResult } from "@/lib/accurate-warehouse-search";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { SearchableField } from "@/components/autoproduksi/searchable-accurate-field";

// § diminta client 2026-10-03 — default Cabang/Gudang untuk Input Produksi yang
// DIKOSONGKAN (manual maupun Excel). Accurate tidak punya "cabang pusat"/"gudang
// utama" bawaan yang bisa dirujuk lewat API, jadi diatur sendiri per Data Usaha di
// sini (§ `autoproduksi_defaults`). Kosong semua = perilaku lama (field tidak dikirim).
type Defaults = { branchName: string | null; warehouseName: string | null; rawMaterialWarehouseName: string | null };

export function ContextDefaultsCard() {
  const [loaded, setLoaded] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [rawMaterialWarehouseName, setRawMaterialWarehouseName] = useState("");
  const [finishedGoodResults, setFinishedGoodResults] = useState<AccurateWarehouseResult[]>([]);
  const [rawMaterialResults, setRawMaterialResults] = useState<AccurateWarehouseResult[]>([]);
  const [saving, setSaving] = useState(false);

  const debouncedFinishedGoodSearch = useDebouncedCallback(async (q: string) => setFinishedGoodResults(await searchAccurateWarehouses(q)), 350);
  const debouncedRawMaterialSearch = useDebouncedCallback(async (q: string) => setRawMaterialResults(await searchAccurateWarehouses(q)), 350);

  useEffect(() => {
    (async () => {
      const res = await api.autoproduksi.defaults.get();
      if (res.data) {
        const d = (res.data as unknown as { defaults: Defaults }).defaults;
        setBranchName(d.branchName ?? "");
        setWarehouseName(d.warehouseName ?? "");
        setRawMaterialWarehouseName(d.rawMaterialWarehouseName ?? "");
      }
      setLoaded(true);
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await api.autoproduksi.defaults.put({
      branchName: branchName.trim() || null,
      warehouseName: warehouseName.trim() || null,
      rawMaterialWarehouseName: rawMaterialWarehouseName.trim() || null,
    });
    setSaving(false);
    if (res.error) {
      toast.error("Gagal menyimpan default.");
      return;
    }
    toast.success("Default Cabang & Gudang disimpan.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Cabang &amp; Gudang</CardTitle>
        <CardDescription>
          Dipakai otomatis kalau Cabang/Gudang dikosongkan saat Input Produksi atau Import Produksi (Excel). Yang diisi langsung di transaksi tetap
          didahulukan. Kosongkan semua kalau tidak mau memakai default.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-lg flex-col gap-4">
        {!loaded ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium text-foreground">Cabang default (mis. kantor pusat)</span>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Nama cabang persis seperti di Accurate" />
              <span className="text-[11px] text-muted-foreground">
                Perusahaan multi-cabang di Accurate menolak transaksi tanpa cabang — sangat disarankan diisi.
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium text-foreground">Gudang Barang Jadi default (mis. gudang utama)</span>
              <SearchableField
                value={warehouseName}
                onChange={setWarehouseName}
                onSearch={debouncedFinishedGoodSearch}
                placeholder="Cari Gudang..."
                options={warehouseComboboxOptions(warehouseName, finishedGoodResults)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium text-foreground">Gudang Bahan Baku default</span>
              <SearchableField
                value={rawMaterialWarehouseName}
                onChange={setRawMaterialWarehouseName}
                onSearch={debouncedRawMaterialSearch}
                placeholder="Cari Gudang..."
                options={warehouseComboboxOptions(rawMaterialWarehouseName, rawMaterialResults)}
              />
            </label>
            <Button onClick={handleSave} disabled={saving} className="self-start">
              {saving ? "Menyimpan..." : "Simpan Default"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
