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
import { ProductionSubmitDialog, type SubmitOutcome } from "@/components/autoproduksi/production-submit-dialog";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { duplicateWarning, todayInTimezone, type RecentEntry } from "@/lib/production-input";

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
// Combobox (nonaktif disaring di sini, server juga menolak 409 kalau
// tetap dipaksa — § autoproduksi.route.ts).
type Formula = { id: string; formulaCode: string; name: string; finishedGoodItemUnitName: string; isActive: boolean };

// § Fase 185 — isian terakhir milik user ini (server, `GET /autoproduksi/production-entries/last`); tanggal SENGAJA tidak ikut (selalu hari ini).
type LastEntry = { formulaId: string; producedQty: string; branchName: string | null; warehouseName: string | null; rawMaterialWarehouseName: string | null; projectNo: string | null; departmentName: string | null };

export default function AutoProduksiInputPage() {
  const [formulas, setFormulas] = useState<Formula[] | null>(null);
  const [formulaId, setFormulaId] = useState("");
  const [producedQty, setProducedQty] = useState("");
  const companyTimezone = useCompanyTimezone();
  const [transDate, setTransDate] = useState(() => todayInTimezone(companyTimezone));
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [rawMaterialWarehouseName, setRawMaterialWarehouseName] = useState("");
  const [projectNo, setProjectNo] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [finishedGoodWarehouseResults, setFinishedGoodWarehouseResults] = useState<AccurateWarehouseResult[]>([]);
  const [rawMaterialWarehouseResults, setRawMaterialWarehouseResults] = useState<AccurateWarehouseResult[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const debouncedFinishedGoodWarehouseSearch = useDebouncedCallback(async (q: string) => setFinishedGoodWarehouseResults(await searchAccurateWarehouses(q)), 350);
  const debouncedRawMaterialWarehouseSearch = useDebouncedCallback(async (q: string) => setRawMaterialWarehouseResults(await searchAccurateWarehouses(q)), 350);

  useEffect(() => {
    (async () => {
      const res = await api.autoproduksi.formulas.get();
      const list = res.data ? (res.data as unknown as { formulas: Formula[] }).formulas : null;
      if (list) setFormulas(list);
      // isian terakhir: semua kecuali tanggal. Formula hanya diisi bila masih AKTIF (nonaktif/terhapus → pengguna memilih ulang).
      const lastRes = await api.autoproduksi["production-entries"].last.get();
      const last = (lastRes.data as unknown as { entry: LastEntry | null } | null)?.entry;
      if (!last) return;
      const formula = list?.find((f) => f.id === last.formulaId && f.isActive);
      if (formula) setFormulaId(formula.id);
      setProducedQty(String(Number(last.producedQty)));
      setBranchName(last.branchName ?? "");
      setWarehouseName(last.warehouseName ?? "");
      setRawMaterialWarehouseName(last.rawMaterialWarehouseName ?? "");
      setProjectNo(last.projectNo ?? "");
      setDepartmentName(last.departmentName ?? "");
      setPrefillNote(formula ? `${formula.formulaCode} · ${formula.name}, ${Number(last.producedQty)} ${formula.finishedGoodItemUnitName}` : "isian sebelumnya");
    })();
  }, []);

  function clearForm() {
    setFormulaId("");
    setProducedQty("");
    setBranchName("");
    setWarehouseName("");
    setRawMaterialWarehouseName("");
    setProjectNo("");
    setDepartmentName("");
    setPrefillNote(null);
  }

  const activeFormulas = formulas?.filter((f) => f.isActive) ?? null;
  const selectedFormula = activeFormulas?.find((f) => f.id === formulaId);

  // Klik "Input Produksi" TIDAK langsung mengirim: validasi → popup "Periksa dulu" (Kirim/Batal) + peringatan bila ada entri serupa yang baru dikirim.
  async function handleReview() {
    if (!formulaId) {
      toast.error("Pilih formula dulu.");
      return;
    }
    const qty = Number(producedQty);
    if (!qty || qty <= 0) {
      toast.error("Qty produksi harus lebih dari 0.");
      return;
    }
    const recent = await api.autoproduksi["production-entries"].get({ query: { limit: 10 } });
    const entries = (recent.data as unknown as { entries?: RecentEntry[] } | null)?.entries ?? [];
    setWarning(duplicateWarning(entries, { formulaId, qty, transDate }));
    setConfirmOpen(true);
  }

  async function sendEntry(): Promise<SubmitOutcome> {
    const res = await api.autoproduksi["production-entries"].post({
      formulaId,
      producedQty: Number(producedQty),
      transDate,
      ...(branchName.trim() ? { branchName: branchName.trim() } : {}),
      ...(warehouseName.trim() ? { warehouseName: warehouseName.trim() } : {}),
      ...(rawMaterialWarehouseName.trim() ? { rawMaterialWarehouseName: rawMaterialWarehouseName.trim() } : {}),
      ...(projectNo.trim() ? { projectNo: projectNo.trim() } : {}),
      ...(departmentName.trim() ? { departmentName: departmentName.trim() } : {}),
    });
    if (res.error) {
      const value = res.error.value as { code?: string } | undefined;
      return { ok: false, message: value?.code === "FORMULA_INACTIVE" ? "Formula ini sedang nonaktif — aktifkan dulu di List Formula." : "Gagal mengirim input produksi ke server." };
    }
    return { ok: true, entryId: (res.data as unknown as { entry: { id: string } }).entry.id };
  }

  // "Input produksi baru": isian TETAP (hanya tanggal kembali ke hari ini) — user cukup mengubah yang perlu.
  function startNewInput() {
    setConfirmOpen(false);
    setPrefillNote(null);
    setTransDate(todayInTimezone(companyTimezone));
  }

  const summary = {
    formulaLabel: selectedFormula ? `${selectedFormula.formulaCode} · ${selectedFormula.name}` : "-",
    qtyText: `${Number(producedQty)} ${selectedFormula?.finishedGoodItemUnitName ?? ""}`.trim(),
    dateText: transDate,
    context: [
      { label: "Cabang", value: branchName.trim() },
      { label: "Gudang Barang Jadi", value: warehouseName.trim() },
      { label: "Gudang Bahan Baku", value: rawMaterialWarehouseName.trim() },
      { label: "Proyek", value: projectNo.trim() },
      { label: "Departemen", value: departmentName.trim() },
    ].filter((c) => c.value),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Input Produksi</h1>
        <p className="text-sm text-muted-foreground">
          Pilih formula & qty hasil produksi — kebutuhan Bahan Baku dihitung otomatis sesuai resep.
        </p>
      </div>

      {/* § diminta client 2026-10-06 — form lebih ringkas supaya 1 layar terlihat semua: kartu lebih lebar di desktop (3/4 di lg, 1/2 di xl+),
          Qty Produksi sebelum Tanggal dan keduanya 1 baris, Gudang Barang Jadi & Gudang Bahan Baku 1 baris. Hanya tata letak. */}
      <Card className="w-full lg:w-3/4 xl:w-1/2">
        <CardHeader>
          <CardTitle>Form Input Produksi</CardTitle>
          <CardDescription>
            Belum ada formula? Buat dulu di halaman{" "}
            <Link href="/autoproduksi/formulas" className="text-primary underline">
              List Formula
            </Link>
            .
          </CardDescription>
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
                  options={activeFormulas.map((f) => ({ value: f.id, label: `${f.formulaCode} · ${f.name}` }))}
                  value={formulaId}
                  onChange={setFormulaId}
                  placeholder="Pilih formula..."
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    Qty Produksi {selectedFormula ? `(${selectedFormula.finishedGoodItemUnitName})` : ""}
                  </span>
                  <Input type="number" value={producedQty} onChange={(e) => setProducedQty(e.target.value)} placeholder="1" />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                  <span className="text-xs font-medium text-foreground">Tanggal Transaksi</span>
                  <Input type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                <span className="text-xs font-medium text-foreground">Konteks Produksi (opsional)</span>
                <span className="-mt-2 text-[11px] text-muted-foreground">
                  Cabang/Gudang yang dikosongkan memakai default dari{" "}
                  <Link href="/autoproduksi/settings" className="text-primary underline">
                    Pengaturan AutoProduksi
                  </Link>{" "}
                  (kalau sudah diatur). Gudang Bahan Baku berlaku ke semua Bahan Baku resep ini.
                </span>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">Cabang</span>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="JAKARTA" />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Gudang Barang Jadi</span>
                    <SearchableField
                      value={warehouseName}
                      onChange={setWarehouseName}
                      onSearch={debouncedFinishedGoodWarehouseSearch}
                      placeholder="Cari Gudang..."
                      options={warehouseComboboxOptions(warehouseName, finishedGoodWarehouseResults)}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-sm" title="Berlaku ke semua Bahan Baku resep ini">
                    <span className="text-xs text-muted-foreground">Gudang Bahan Baku</span>
                    <SearchableField
                      value={rawMaterialWarehouseName}
                      onChange={setRawMaterialWarehouseName}
                      onSearch={debouncedRawMaterialWarehouseSearch}
                      placeholder="Cari Gudang..."
                      options={warehouseComboboxOptions(rawMaterialWarehouseName, rawMaterialWarehouseResults)}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Proyek</span>
                    <Input value={projectNo} onChange={(e) => setProjectNo(e.target.value)} placeholder="Kode proyek" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Departemen</span>
                    <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="Nama departemen" />
                  </label>
                </div>
              </div>

              {prefillNote && (
                <p className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <span>Diisi dari input terakhir kamu ({prefillNote}). Tanggal hari ini.</span>
                  <button type="button" onClick={clearForm} className="shrink-0 font-medium text-primary underline">
                    Kosongkan
                  </button>
                </p>
              )}

              <Button onClick={handleReview} disabled={confirmOpen}>
                Input Produksi
              </Button>
              {confirmOpen && (
                <ProductionSubmitDialog summary={summary} duplicateWarning={warning} onSubmit={sendEntry} onCancel={() => setConfirmOpen(false)} onNewInput={startNewInput} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
