"use client";

import { useEffect, useState } from "react";
import { Trash2, Boxes } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { api } from "@/lib/api-client";
import { filterFormulas, type FormulaStatusFilter } from "@/lib/filter-formulas";
import { itemComboboxOptions } from "@/lib/accurate-combobox-options";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { IntermediaryAccountFormDialog, type IntermediaryAccount } from "@/components/autoproduksi/intermediary-account-form-dialog";
import { SearchableField } from "@/components/autoproduksi/searchable-accurate-field";
import { UnitField, type ItemUnit } from "@/components/autoproduksi/unit-field";

// § Fase 159, architecture-autoproduksi.md — modul PERTAMA Facport yang
// form-based (BUKAN Excel-upload seperti 23 modul lain). Formula (BOM):
// 1 Barang Jadi = kombinasi N Bahan Baku + takaran.
// § Fase 163, ADR-0039 (evaluasi client) — Barang Jadi/Bahan Baku
// SEKARANG dicari live ke Accurate (`GET /accurate/items/search`,
// § accurate-lookup.route.ts) lewat `Combobox` yang sudah ada, BUKAN
// diketik manual lagi — kode+satuan+nama otomatis terisi begitu dipilih.
// § DIUBAH TOTAL 2026-10-02 (diminta client) — Akun Perantara BUKAN
// LAGI live-search Accurate (`glaccounts/search` dihapus dari alur
// ini): bagian produksi yang isi Formula sering tidak paham akun, jadi
// sekarang pilih dari daftar MASTER DATA LOKAL yang dikelola sendiri di
// halaman Settings (`/autoproduksi/settings`, §
// `autoproduksi_intermediary_accounts`), atau bikin baru langsung dari
// sini lewat `IntermediaryAccountFormDialog` (dialog kecil, Kode+Nama).
// § Fase 168 (diminta client) — Cabang/Gudang Barang Jadi/Gudang Bahan
// Baku/Nomor Project/Departemen DIHAPUS TOTAL dari Formula (pindah ke
// Input Produksi, § `input/page.tsx`) — alasan client: customer dengan
// banyak cabang terpaksa bikin Formula terpisah per cabang padahal
// resepnya identik, sekarang 1 Formula dipakai lintas cabang/gudang.
// Formula sekarang MURNI resep: Nama + Barang Jadi + Bahan Baku + takaran
// + Akun Perantara. Fase ini juga menambahkan toggle Aktif/Non-aktif
// (§ kolom "Status" di tabel List Formula) — non-aktif = tidak bisa
// dipilih/dicari utk Input Produksi baru, tapi tetap tampil di sini
// sebagai dokumentasi.
type AccurateItemResult = { no: string; name: string; unitName: string; units?: ItemUnit[] };

// § BUG DITEMUKAN & DIPERBAIKI 2026-10-02 (evaluasi client) — `quantity`
// SENGAJA string (BUKAN number) di state form, sepanjang masa edit.
// Akar masalah: kolom DB `numeric` SELALU datang dari API sebagai STRING
// (mis. "0.8000", postgres.js tidak otomatis jadi JS number) — field yang
// TIDAK disentuh user tetap string itu, dikonversi ke number CUMA kalau
// field itu di-klik-ulang. Dulu disimpan sebagai `number` + `value={item.
// quantity || ""}` — DUA bug sekaligus: (1) field yang tidak disentuh
// terkirim ke server sebagai string, DITOLAK validasi (pesan generik
// "Gagal menyimpan formula", client harus klik-ulang SEMUA baris biar
// kekonversi); (2) `0 || ""` di JS true untuk angka 0 (falsy) — ketik "0"
// sebagai awalan desimal (mis. "0,5") bikin kotak kelihatan kosong lagi,
// client produksi terbiasa menulis "0" di depan koma. String SELAMA edit
// (apa adanya, tanpa round-trip ke number tiap keystroke) menghilangkan
// AKAR kedua masalah — konversi `Number(...)` cuma di 1 titik, pas kirim
// ke server (§ `handleSave`).
type FormulaItem = { itemNo: string; itemUnitName: string; itemName?: string; quantity: string };
type Formula = {
  id: string;
  name: string;
  finishedGoodItemNo: string;
  finishedGoodItemUnitName: string;
  finishedGoodItemName: string | null;
  standardCost: string | null;
  adjustmentAccountNo: string;
  adjustmentAccountName: string | null;
  isActive: boolean;
};
type FormulaDetail = { formula: Formula; items: FormulaItem[] };

const EMPTY_ITEM: FormulaItem = { itemNo: "", itemUnitName: "", quantity: "" };

// § diminta client 2026-10-02 — pemisah ribuan di Standard Cost supaya
// gampang hitung jumlah digit. State TETAP digit polos (mis. "20000"),
// formatter ini CUMA untuk tampilan — konversi ke Number() tetap di 1
// titik (`handleSave`), sama pola `quantity` di atas.
function formatThousands(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function searchAccurateItems(q: string): Promise<AccurateItemResult[]> {
  if (!q.trim()) return [];
  const res = await api.accurate.items.search.get({ query: { q } });
  return res.data ? (res.data as unknown as { items: AccurateItemResult[] }).items : [];
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
  // § diminta client 2026-10-02 — daftar Akun Perantara LOKAL (bukan hasil
  // search Accurate lagi), di-fetch sekali tiap dialog Formula dibuka.
  const [intermediaryAccounts, setIntermediaryAccounts] = useState<IntermediaryAccount[]>([]);
  const [items, setItems] = useState<FormulaItem[]>([{ ...EMPTY_ITEM }]);
  // § Bahan Baku pakai endpoint search yang SAMA (`item/list.do` mencakup
  // Barang Jadi & Bahan Baku, sama-sama "Item" di Accurate) — 1 state hasil
  // pencarian DIBAGI semua baris (cuma 1 Combobox baris yang aktif dicari
  // dalam satu waktu), fallback per-baris (§ `itemComboboxOptions`) yang
  // menjaga baris LAIN tetap tampil benar walau state ini berubah.
  const [itemResults, setItemResults] = useState<AccurateItemResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // § evaluasi client 2026-10-03 — daftar satuan per kode barang (barang bisa
  // punya >1 satuan, mis. KG & Pouch), diisi dari SETIAP hasil pencarian supaya
  // baris yang sudah dipilih tetap punya pilihan satuan walau pencarian berganti.
  const [unitsByItemNo, setUnitsByItemNo] = useState<Record<string, ItemUnit[]>>({});

  function rememberUnits(results: AccurateItemResult[]): AccurateItemResult[] {
    const found = results.filter((r) => r.units && r.units.length > 0);
    if (found.length > 0) setUnitsByItemNo((prev) => ({ ...prev, ...Object.fromEntries(found.map((r) => [r.no, r.units!])) }));
    return results;
  }

  // § HOTFIX 2026-09-29 — WAJIB debounce (§ use-debounced-callback.ts):
  // ditemukan NYATA di production, ketik 4 huruf ("gula") tanpa debounce
  // langsung 429 dari Accurate (rate limit /accurate 60/menit per-IP,
  // dibagi bersama traffic Accurate lain). 350ms sama seperti default
  // `SearchForm` (§ ADR-0024) — konsisten timing debounce lintas project.
  const debouncedFinishedGoodSearch = useDebouncedCallback(async (q: string) => setFinishedGoodResults(rememberUnits(await searchAccurateItems(q))), 350);
  const debouncedItemSearch = useDebouncedCallback(async (q: string) => setItemResults(rememberUnits(await searchAccurateItems(q))), 350);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setFinishedGoodResults([]);
    setItemResults([]);
    // § diminta client 2026-10-02 — Akun Perantara LOKAL, bukan Accurate
    // search lagi: fetch sekali tiap dialog dibuka (dibutuhkan baik mode
    // Tambah maupun Edit, jadi di luar percabangan `formulaId` di bawah).
    const accountsRes = await api.autoproduksi.accounts.get();
    if (accountsRes.data) setIntermediaryAccounts((accountsRes.data as unknown as { accounts: IntermediaryAccount[] }).accounts);
    if (!formulaId) {
      setName("");
      setFinishedGoodItemNo("");
      setFinishedGoodItemUnitName("");
      setFinishedGoodItemName("");
      setStandardCost("");
      setAdjustmentAccountNo("");
      setAdjustmentAccountName("");
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
      // § standardCost dari DB bisa punya ".00" (kolom numeric(18,2)) —
      // Standard Cost di sini selalu bilangan bulat Rupiah di praktiknya
      // (sama seperti contoh client, tidak pernah pakai sen), jadi
      // dibulatkan ke string digit polos supaya formatter ribuan di bawah
      // bekerja benar (bukan karena sengaja buang presisi desimal).
      setStandardCost(detail.formula.standardCost ? String(Math.trunc(Number(detail.formula.standardCost))) : "");
      setAdjustmentAccountNo(detail.formula.adjustmentAccountNo);
      setAdjustmentAccountName(detail.formula.adjustmentAccountName ?? "");
      // § `quantity` dari API bisa number ATAU string tergantung serialisasi
      // (§ komentar tipe `FormulaItem` di atas) — `String(...)` membungkus
      // keduanya jadi representasi teks yang konsisten untuk state form.
      setItems(detail.items.length > 0 ? detail.items.map((i) => ({ ...i, quantity: String(i.quantity) })) : [{ ...EMPTY_ITEM }]);
      // Muat daftar satuan barang yang SUDAH tersimpan (tanpa menunggu, tidak memblokir form) —
      // cari pakai nama kalau ada (pencarian Accurate tidak selalu cocok ke kode), cocokkan hasil by kode.
      const saved = [
        { no: detail.formula.finishedGoodItemNo, name: detail.formula.finishedGoodItemName ?? "" },
        ...detail.items.map((i) => ({ no: i.itemNo, name: i.itemName ?? "" })),
      ].filter((x, idx, all) => x.no && all.findIndex((y) => y.no === x.no) === idx);
      void Promise.all(saved.map(async (x) => rememberUnits((await searchAccurateItems(x.name || x.no)).filter((r) => r.no === x.no))));
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

  function selectLocalAccount(no: string) {
    const record = intermediaryAccounts.find((a) => a.accountNo === no);
    setAdjustmentAccountNo(no);
    if (record) setAdjustmentAccountName(record.accountName);
  }

  function handleAccountCreated(account: IntermediaryAccount) {
    setIntermediaryAccounts((prev) => [...prev, account]);
    setAdjustmentAccountNo(account.accountNo);
    setAdjustmentAccountName(account.accountName);
  }

  function selectItemForRow(index: number, no: string) {
    const record = itemResults.find((r) => r.no === no);
    updateItem(index, { itemNo: no, ...(record ? { itemUnitName: record.unitName, itemName: record.name } : {}) });
  }

  async function handleSave() {
    if (!name.trim() || !finishedGoodItemNo.trim() || !finishedGoodItemUnitName.trim() || !adjustmentAccountNo.trim()) {
      setError("Nama Formula, Barang Jadi, dan Akun Perantara wajib diisi.");
      return;
    }
    const validItems = items.filter((i) => i.itemNo.trim() && i.itemUnitName.trim() && Number(i.quantity) > 0);
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
      items: validItems.map((i) => ({
        itemNo: i.itemNo.trim(),
        itemUnitName: i.itemUnitName.trim(),
        ...(i.itemName?.trim() ? { itemName: i.itemName.trim() } : {}),
        // § konversi ke number TEPAT DI SINI, 1 titik — § komentar tipe FormulaItem.
        quantity: Number(i.quantity),
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
              <SearchableField
                value={finishedGoodItemNo}
                onChange={selectFinishedGood}
                onSearch={debouncedFinishedGoodSearch}
                placeholder="Ketik kode/nama barang..."
                options={itemComboboxOptions(finishedGoodItemNo, finishedGoodItemName, finishedGoodResults)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Satuan (otomatis; pilih kalau barang punya beberapa satuan)</span>
              <UnitField value={finishedGoodItemUnitName} units={unitsByItemNo[finishedGoodItemNo]} onChange={setFinishedGoodItemUnitName} placeholder="Pilih barang dulu" />
            </label>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Standard Cost (opsional — diisi manual)</span>
              <Input
                type="text"
                inputMode="numeric"
                value={formatThousands(standardCost)}
                onChange={(e) => setStandardCost(e.target.value.replace(/\D/g, ""))}
                placeholder="20.000"
              />
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
              <div key={index} className="grid grid-cols-[1.6fr_0.8fr_0.8fr_auto] gap-2">
                <SearchableField
                  value={item.itemNo}
                  onChange={(no) => selectItemForRow(index, no)}
                  onSearch={debouncedItemSearch}
                  placeholder="Cari Bahan Baku..."
                  options={itemComboboxOptions(item.itemNo, item.itemName, itemResults)}
                />
                <UnitField value={item.itemUnitName} units={unitsByItemNo[item.itemNo]} onChange={(unit) => updateItem(index, { itemUnitName: unit })} placeholder="Satuan" />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
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

          <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3">
            <span className="text-xs font-medium text-foreground">Akun Perantara</span>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Combobox
                  value={adjustmentAccountNo}
                  onChange={selectLocalAccount}
                  placeholder="Pilih Akun Perantara..."
                  options={intermediaryAccounts.map((a) => ({ value: a.accountNo, label: `${a.accountName} (${a.accountNo})` }))}
                />
              </div>
              <IntermediaryAccountFormDialog trigger="icon" onSaved={handleAccountCreated} />
            </div>
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
  // § Fase 162 (evaluasi client) — search nama Formula, client-side
  // (dataset per Data Usaha kecil, § plan file). Fungsi filter diekstrak
  // ke `lib/filter-formulas.ts` supaya testable.
  // § Fase 168 — filter Cabang DIGANTI filter Status (Aktif/Non-aktif),
  // karena Cabang sudah tidak lagi jadi field Formula.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FormulaStatusFilter>("all");

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

  // § Fase 168 (diminta client) — toggle Aktif/Non-aktif, endpoint
  // TERPISAH dari PUT (§ autoproduksi.route.ts) supaya tidak perlu kirim
  // ulang Formula+items cuma utk ubah 1 boolean.
  async function handleToggleActive(formula: Formula) {
    const res = await api.autoproduksi.formulas({ id: formula.id }).active.patch({ isActive: !formula.isActive });
    if (res.error) {
      toast.error("Gagal mengubah status formula.");
      return;
    }
    toast.success(formula.isActive ? "Formula dinonaktifkan." : "Formula diaktifkan.");
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
    // § Fase 168 (diminta client) — kolom Cabang DIHILANGKAN (field-nya
    // sudah dihapus dari Formula total, pindah ke Input Produksi) —
    // digantikan kolom Status (toggle Aktif/Non-aktif).
    columnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <button type="button" onClick={() => handleToggleActive(row.original)} title="Klik untuk ubah status">
          <Badge variant={row.original.isActive ? "success" : "default"}>{row.original.isActive ? "Aktif" : "Non-aktif"}</Badge>
        </button>
      ),
    }),
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

  const filteredFormulas = formulas ? filterFormulas(formulas, { search, status: statusFilter }) : null;

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
          <CardDescription>
            Barang Jadi/Bahan Baku dicari langsung ke Accurate (kode & nama otomatis terisi saat dipilih) — Akun Perantara dari daftar lokal (kelola di
            &quot;Pengaturan&quot;). Cabang/Gudang dipilih saat Input Produksi, bukan di sini — 1 Formula dipakai lintas cabang.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {formulas && formulas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama Formula..." className="max-w-xs" />
              <div className="w-48">
                <Combobox
                  value={statusFilter === "all" ? "" : statusFilter}
                  onChange={(v) => setStatusFilter((v || "all") as FormulaStatusFilter)}
                  placeholder="Semua Status"
                  options={[
                    { value: "", label: "Semua Status" },
                    { value: "active", label: "Aktif" },
                    { value: "inactive", label: "Non-aktif" },
                  ]}
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
              emptyDescription={formulas && formulas.length > 0 ? "Coba ubah kata pencarian atau filter Status." : 'Klik "Tambah Formula" untuk bikin resep pertama.'}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
