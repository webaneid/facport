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
import { IntermediaryAccountFormDialog, type IntermediaryAccount } from "@/components/autoproduksi/intermediary-account-form-dialog";

// § Fase 159, architecture-autoproduksi.md — modul PERTAMA Facport yang
// form-based (BUKAN Excel-upload seperti 23 modul lain). Formula (BOM):
// 1 Barang Jadi = kombinasi N Bahan Baku + takaran.
// § Fase 163, ADR-0039 (evaluasi client) — Barang Jadi/Bahan Baku
// SEKARANG dicari live ke Accurate (`GET /accurate/items/search`,
// § accurate-lookup.route.ts) lewat `Combobox` yang sudah ada, BUKAN
// diketik manual lagi — kode+satuan+nama otomatis terisi begitu dipilih.
// `branchName` TETAP diketik manual (Accurate tidak punya endpoint
// search Cabang yang relevan di sini).
// § DIUBAH TOTAL 2026-10-02 (diminta client) — Akun Perantara BUKAN
// LAGI live-search Accurate (`glaccounts/search` dihapus dari alur
// ini): bagian produksi yang isi Formula sering tidak paham akun, jadi
// sekarang pilih dari daftar MASTER DATA LOKAL yang dikelola sendiri di
// halaman Settings (`/autoproduksi/settings`, §
// `autoproduksi_intermediary_accounts`), atau bikin baru langsung dari
// sini lewat `IntermediaryAccountFormDialog` (dialog kecil, Kode+Nama).
// § Fase 162 (evaluasi client) — kolom "Gudang" per baris Bahan Baku.
// § HOTFIX 2026-09-30 (evaluasi client) — Gudang (Barang Jadi & Bahan
// Baku) SEKARANG juga search-pilih ke Accurate (`GET /accurate/warehouses/search`)
// BUKAN ketik bebas lagi, supaya nama gudang konsisten dengan data ASLI
// Accurate (bukan typo). CATATAN: ini BUKAN "auto-fill" seperti Satuan —
// Accurate tidak punya konsep "gudang default" per Barang (stok tersebar
// di banyak gudang), jadi user tetap harus PILIH gudangnya sendiri, cuma
// dari daftar asli (bukan ketik manual).
type AccurateItemResult = { no: string; name: string; unitName: string };
type AccurateWarehouseResult = { name: string };

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
type FormulaItem = { itemNo: string; itemUnitName: string; itemName?: string; quantity: string; warehouseName?: string; projectNo?: string; departmentName?: string };
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
  finishedGoodProjectNo: string | null;
  finishedGoodDepartmentName: string | null;
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

// § diminta client 2026-09-30 — search Accurate (Barang/Akun/Gudang) TIDAK
// selalu ketemu (mis. search Akun Perantara ternyata cuma cocok ke NAMA,
// bukan kode "no" — dikonfirmasi manual oleh client, § lessons-learned.md).
// `Combobox` sendiri TIDAK diubah (dipakai lintas project, § architecture
// doc "WAJIB dipakai ulang") — toggle manual ini LOKAL ke halaman ini
// saja: swap ke `Input` polos kalau user klik "Isi manual", supaya kode
// yang tidak ketemu di search tetap bisa diisi tangan sebagai fallback.
function SearchableField({
  value,
  onChange,
  onSearch,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [manual, setManual] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {manual ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ketik kode manual..." />
      ) : (
        <Combobox value={value} onChange={onChange} onSearch={onSearch} placeholder={placeholder} options={options} />
      )}
      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        className="self-start text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        {manual ? "Cari di Accurate lagi" : "Tidak ketemu? Isi manual"}
      </button>
    </div>
  );
}

async function searchAccurateItems(q: string): Promise<AccurateItemResult[]> {
  if (!q.trim()) return [];
  const res = await api.accurate.items.search.get({ query: { q } });
  return res.data ? (res.data as unknown as { items: AccurateItemResult[] }).items : [];
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
  // § diminta client 2026-10-02 — daftar Akun Perantara LOKAL (bukan hasil
  // search Accurate lagi), di-fetch sekali tiap dialog Formula dibuka.
  const [intermediaryAccounts, setIntermediaryAccounts] = useState<IntermediaryAccount[]>([]);
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  // § Import Formula (Excel) — "Nomor Project"/"Departemen", ditambah di
  // form manual JUGA supaya edit Formula hasil import lewat form TIDAK
  // diam-diam menghapus field ini (PUT mengganti seluruh Formula).
  const [finishedGoodProjectNo, setFinishedGoodProjectNo] = useState("");
  const [finishedGoodDepartmentName, setFinishedGoodDepartmentName] = useState("");
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
  const debouncedFinishedGoodWarehouseSearch = useDebouncedCallback(async (q: string) => setFinishedGoodWarehouseResults(await searchAccurateWarehouses(q)), 350);
  const debouncedItemWarehouseSearch = useDebouncedCallback(async (q: string) => setItemWarehouseResults(await searchAccurateWarehouses(q)), 350);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setFinishedGoodResults([]);
    setItemResults([]);
    setFinishedGoodWarehouseResults([]);
    setItemWarehouseResults([]);
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
      setBranchName("");
      setWarehouseName("");
      setFinishedGoodProjectNo("");
      setFinishedGoodDepartmentName("");
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
      setBranchName(detail.formula.branchName);
      setWarehouseName(detail.formula.warehouseName ?? "");
      setFinishedGoodProjectNo(detail.formula.finishedGoodProjectNo ?? "");
      setFinishedGoodDepartmentName(detail.formula.finishedGoodDepartmentName ?? "");
      // § `quantity` dari API bisa number ATAU string tergantung serialisasi
      // (§ komentar tipe `FormulaItem` di atas) — `String(...)` membungkus
      // keduanya jadi representasi teks yang konsisten untuk state form.
      setItems(detail.items.length > 0 ? detail.items.map((i) => ({ ...i, quantity: String(i.quantity) })) : [{ ...EMPTY_ITEM }]);
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
    if (!name.trim() || !finishedGoodItemNo.trim() || !finishedGoodItemUnitName.trim() || !adjustmentAccountNo.trim() || !branchName.trim()) {
      setError("Nama Formula, Barang Jadi, Akun Perantara, dan Cabang wajib diisi.");
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
      branchName: branchName.trim(),
      ...(warehouseName.trim() ? { warehouseName: warehouseName.trim() } : {}),
      ...(finishedGoodProjectNo.trim() ? { finishedGoodProjectNo: finishedGoodProjectNo.trim() } : {}),
      ...(finishedGoodDepartmentName.trim() ? { finishedGoodDepartmentName: finishedGoodDepartmentName.trim() } : {}),
      items: validItems.map((i) => ({
        itemNo: i.itemNo.trim(),
        itemUnitName: i.itemUnitName.trim(),
        ...(i.itemName?.trim() ? { itemName: i.itemName.trim() } : {}),
        // § konversi ke number TEPAT DI SINI, 1 titik — § komentar tipe FormulaItem.
        quantity: Number(i.quantity),
        ...(i.warehouseName?.trim() ? { warehouseName: i.warehouseName.trim() } : {}),
        ...(i.projectNo?.trim() ? { projectNo: i.projectNo.trim() } : {}),
        ...(i.departmentName?.trim() ? { departmentName: i.departmentName.trim() } : {}),
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
              <span className="text-xs text-muted-foreground">Satuan (otomatis, atau isi manual)</span>
              <Input value={finishedGoodItemUnitName} onChange={(e) => setFinishedGoodItemUnitName(e.target.value)} placeholder="Pilih barang dulu" />
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
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Nomor Project (opsional)</span>
              <Input value={finishedGoodProjectNo} onChange={(e) => setFinishedGoodProjectNo(e.target.value)} placeholder="Kode proyek" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Departemen (opsional)</span>
              <Input value={finishedGoodDepartmentName} onChange={(e) => setFinishedGoodDepartmentName(e.target.value)} placeholder="Nama departemen" />
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
              <div key={index} className="flex flex-col gap-1 rounded-md border border-border/40 p-2">
                <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_1.2fr_auto] gap-2">
                  <SearchableField
                    value={item.itemNo}
                    onChange={(no) => selectItemForRow(index, no)}
                    onSearch={debouncedItemSearch}
                    placeholder="Cari Bahan Baku..."
                    options={itemComboboxOptions(item.itemNo, item.itemName, itemResults)}
                  />
                  <Input value={item.itemUnitName} onChange={(e) => updateItem(index, { itemUnitName: e.target.value })} placeholder="Satuan" />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    placeholder="Takaran, 0.5"
                  />
                  <SearchableField
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
                {/* § Import Formula (Excel) — Nomor Project/Departemen per Bahan Baku, baris sekunder supaya grid utama tidak terlalu padat. */}
                <div className="grid grid-cols-2 gap-2">
                  <Input value={item.projectNo ?? ""} onChange={(e) => updateItem(index, { projectNo: e.target.value })} placeholder="Nomor Project (opsional)" className="h-7 text-xs" />
                  <Input value={item.departmentName ?? ""} onChange={(e) => updateItem(index, { departmentName: e.target.value })} placeholder="Departemen (opsional)" className="h-7 text-xs" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
            <span className="col-span-2 text-xs font-medium text-foreground">Konfigurasi Lainnya</span>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Akun Perantara (daftar lokal)</span>
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
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Cabang</span>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="JAKARTA" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Gudang Barang Jadi (opsional)</span>
              <SearchableField
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
    // § diminta client 2026-10-02 — Akun Perantara DIHILANGKAN dari tabel
    // List Formula (bagian produksi tidak paham akun, cuma relevan untuk
    // akunting) — field-nya TETAP ada di form Tambah/Edit (masih WAJIB
    // dikirim ke Accurate), cuma tidak ditampilkan di kolom tabel ini.
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
          <CardDescription>Barang Jadi/Bahan Baku dicari langsung ke Accurate (kode & nama otomatis terisi saat dipilih) — Akun Perantara dari daftar lokal (kelola di &quot;Pengaturan&quot;).</CardDescription>
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
