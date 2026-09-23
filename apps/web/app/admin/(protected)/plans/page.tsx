"use client";

import { useEffect, useState } from "react";
import { Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { TruncateText } from "@/components/ui/truncate-text";
import { SearchForm } from "@/components/ui/search-form";
import { StatusBadge } from "@/lib/status-badges";
import { api } from "@/lib/api-client";
import { currencyFormatter } from "@/lib/utils";
import { MODULE_OPTIONS, MODULE_CATEGORIES, PRODUCT_LINES, productLineLabel, moduleProductLine, type ModuleKey } from "@/lib/module-options";
import { DURATION_UNIT_LABELS, formatDuration, inferDurationUnit, toDurationDays, type DurationUnit } from "@/lib/duration";

type PlanKind = "module" | "seat_addon";
// § diminta user 2026-09-23 — Produk yang PUNYA modul saja boleh jadi pilihan "Jenis Paket" (Konverter/
// AutoProduksi yang 0 modul TIDAK muncul, sama prinsip "kosong = hilang" § module-catalog.ts). Dihitung SEKALI
// di module scope (bukan per-render) karena `MODULE_OPTIONS`/`PRODUCT_LINES` statis.
const PRODUCT_LINES_WITH_MODULES = PRODUCT_LINES.filter((p) => MODULE_OPTIONS.some((m) => m.productLine === p.key));
type Plan = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  modules: string[];
  isActive: boolean;
  trialEligible: boolean;
  kind: PlanKind;
};

function PlanFormDialog({ plan, onSaved }: { plan?: Plan; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(String(plan?.price ?? ""));
  // § Fase 43 — input "Jumlah" + unit (Hari/Bulan/Tahun), bukan hari mentah.
  // Infer unit dari `durationDays` existing saat edit (§ lib/duration.ts),
  // supaya paket "1 Tahun" tetap tampil "1"+"Tahun", bukan "360"+"Hari".
  const inferred = plan ? inferDurationUnit(plan.durationDays) : { amount: 30, unit: "hari" as const };
  const [durationAmount, setDurationAmount] = useState(String(inferred.amount));
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(inferred.unit);
  // § 1 plan = 1 sub-modul (radio, bukan checkbox lagi sejak Fase 14)
  const [moduleKey, setModuleKey] = useState<ModuleKey | "">((plan?.modules[0] as ModuleKey) ?? "");
  // § diminta user 2026-09-23 — "Jenis Paket" SEKARANG jadi gerbang tunggal: Produk (Facport/Konverter/dst,
  // key `PRODUCT_LINES`) ATAU "seat_addon", BUKAN 2 langkah terpisah (pilih kind lalu scroll cari Produk di
  // daftar modul). Memilih Produk di sini SEKALIGUS memfilter daftar modul di bawah ke Produk itu saja — admin
  // Konverter tidak perlu lihat/scroll lewat modul Facport sama sekali, dan sebaliknya. `kind` (dikirim ke
  // server) diturunkan dari ini (§ `planKindOf` di bawah), TIDAK disimpan sebagai state terpisah lagi.
  const [packageType, setPackageType] = useState<string>(
    plan?.kind === "seat_addon" ? "seat_addon" : (moduleProductLine(plan?.modules[0] ?? "") ?? PRODUCT_LINES_WITH_MODULES[0]?.key ?? "seat_addon"),
  );
  const kind: PlanKind = packageType === "seat_addon" ? "seat_addon" : "module";
  // § Fase 43 (koreksi) — trial BUKAN otomatis semua paket, admin WAJIB
  // tandai eksplisit per paket. Default OFF untuk paket baru (bukan ON) —
  // admin yang memutuskan, bukan sistem yang mengaktifkan diam-diam.
  const [trialEligible, setTrialEligible] = useState(plan?.trialEligible ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Nama paket wajib diisi.");
      return;
    }
    const priceValue = Number(price);
    if (!Number.isInteger(priceValue) || priceValue < 0) {
      setError("Harga harus angka bulat, minimal 0.");
      return;
    }
    const amount = Number(durationAmount);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Jumlah durasi harus angka bulat, minimal 1.");
      return;
    }
    const days = toDurationDays(amount, durationUnit);
    if (kind === "module" && !moduleKey) {
      setError("Pilih fitur untuk paket ini.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const modules: ModuleKey[] = kind === "seat_addon" ? [] : [moduleKey as ModuleKey];
    const body = {
      name: name.trim(),
      price: priceValue,
      durationDays: days,
      modules,
      isActive: true,
      // § seat_addon TIDAK PERNAH trial (§ subscriptions.route.ts guard) —
      // server juga memaksa ini, checkbox disembunyikan di UI supaya
      // tidak menyesatkan admin (§ render di bawah).
      trialEligible: kind === "seat_addon" ? false : trialEligible,
      kind,
    };
    const res = plan ? await api.admin.plans({ id: plan.id }).put(body) : await api.admin.plans.post(body);
    setSubmitting(false);
    if (res.error) {
      setError("Gagal menyimpan paket.");
      return;
    }
    toast.success(plan ? "Paket diperbarui." : "Paket dibuat.");
    setOpen(false);
    // § 2026-09-24 — bug ditemukan di produksi: dialog "Tambah Paket" adalah 1 instance
    // yang DIPAKAI ULANG tiap kali dibuka (bukan di-mount ulang per plan seperti dialog Edit
    // per-baris), jadi state field (terutama `moduleKey`) SEBELUMNYA nyangkut ke buka berikutnya
    // kalau tidak direset — admin yang bikin beberapa paket berurutan lalu lupa pilih ulang radio
    // modul akan diam-diam submit modul yang SALAH (persis kejadian nyata: 3 paket Konverter
    // "Purchase Invoice"/"Purchase Order" ke-submit dengan modules=["konverter_journal_voucher"]
    // karena radio itu tidak disentuh ulang). Reset SELURUH field ke default cuma untuk create
    // (bukan edit — dialog Edit sudah scoped per-baris via prop `plan`, tidak butuh reset ini).
    if (!plan) {
      setName("");
      setPrice("");
      setDurationAmount("30");
      setDurationUnit("hari");
      setModuleKey("");
      setPackageType(PRODUCT_LINES_WITH_MODULES[0]?.key ?? "seat_addon");
      setTrialEligible(false);
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {plan ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Edit"
          aria-label={`Edit ${plan.name}`}
          className={buttonVariants("ghost", "h-8 w-8 p-0")}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>Tambah Paket</Button>
      )}
      <DialogContent>
        <DialogTitle>{plan ? `Edit: ${plan.name}` : "Tambah Paket"}</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Nama Paket</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            {/* § Fase 53 — 1 sub-modul boleh punya beberapa baris paket
               (tier durasi/harga beda) tampil sebagai 1 kartu di
               landing/subscribe dengan pilihan tier — cukup bikin baris
               baru dengan modul yang sama, beri nama yang jelas. */}
            <span className="text-xs text-muted-foreground">
              Mau bikin opsi Bulanan &amp; Tahunan untuk fitur yang sama? Bikin 2 paket dengan fitur yang sama (beda durasi/harga) — otomatis
              tampil 1 kartu dengan pilihan tier di halaman pelanggan. Beri nama yang jelas, mis. &quot;Purchase Invoice - Bulanan&quot;.
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Harga (Rp)</span>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Jenis Paket</span>
            <div className="flex flex-col gap-2 pl-1" role="radiogroup" aria-label="Jenis Paket">
              {/* § diminta user 2026-09-23 — 1 opsi PER PRODUK (bukan 1 opsi generik "Fitur Modul") supaya
                 pilih Produk = pilih Jenis Paket, sekaligus jadi filter modul di bawah. Dinamis dari
                 `PRODUCT_LINES_WITH_MODULES` — begitu AutoProduksi punya modul nanti, opsinya OTOMATIS
                 muncul di sini, tidak perlu sentuh halaman ini lagi. */}
              {PRODUCT_LINES_WITH_MODULES.map((productLine) => (
                <label key={productLine.key} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="packageType"
                    checked={packageType === productLine.key}
                    onChange={() => {
                      setPackageType(productLine.key);
                      // § moduleKey lama bisa milik Produk LAIN (mis. pindah dari Facport ke Konverter) —
                      // reset supaya tidak submit modul yang tidak cocok Produk yang baru dipilih.
                      if (moduleProductLine(moduleKey) !== productLine.key) setModuleKey("");
                    }}
                  />
                  Fitur {productLineLabel(productLine.key)}
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input type="radio" name="packageType" checked={packageType === "seat_addon"} onChange={() => setPackageType("seat_addon")} />
                Slot User Tambahan (seat)
              </label>
            </div>
            {kind === "seat_addon" && (
              <span className="text-xs text-muted-foreground">
                Dijual per Data Usaha — pembeli bisa undang orang lain akses SEMUA fitur aktif Data Usaha itu. Tidak terikat modul tertentu.
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Durasi</span>
            <div className="flex gap-2">
              <Input type="number" min={1} className="flex-1" value={durationAmount} onChange={(e) => setDurationAmount(e.target.value)} />
              <Select className="flex-1" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}>
                {(Object.keys(DURATION_UNIT_LABELS) as DurationUnit[]).map((unit) => (
                  <option key={unit} value={unit}>
                    {DURATION_UNIT_LABELS[unit]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {kind === "module" && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-foreground">Fitur {productLineLabel(packageType)} (1 paket = 1 fitur)</span>
              {/* § diminta user 2026-09-23 — daftar modul SUDAH DIFILTER ke Produk yang dipilih di "Jenis
                 Paket" di atas (bukan tampil semua Produk sekaligus lalu di-sub-grup) — admin Konverter tidak
                 scroll lewat modul Facport sama sekali, dan sebaliknya. Kelompok di sini CUMA per Kategori
                 (Cash & Bank/Sales/dst), sama seperti sebelum Konverter ada, karena Produk sudah pasti 1 dari
                 gerbang "Jenis Paket" — tidak perlu sub-heading Produk lagi di sini. */}
              {MODULE_CATEGORIES.filter((category) => MODULE_OPTIONS.some((m) => m.productLine === packageType && m.category === category)).map((category) => (
                <div key={category} className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{category}</span>
                  <div className="flex flex-col gap-2 pl-1" role="radiogroup" aria-label={category}>
                    {MODULE_OPTIONS.filter((m) => m.productLine === packageType && m.category === category).map((m) => (
                      <label key={m.key} className="flex items-center gap-2">
                        <input type="radio" name="moduleKey" checked={moduleKey === m.key} onChange={() => setModuleKey(m.key)} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {kind === "module" && (
            <label className="flex items-start gap-2">
              <Checkbox checked={trialEligible} onCheckedChange={(checked) => setTrialEligible(checked === true)} className="mt-0.5" />
              <span className="flex flex-col">
                <span className="text-xs font-medium text-foreground">Bisa Dicoba Gratis (Trial)</span>
                <span className="text-xs text-muted-foreground">
                  Kalau diaktifkan, customer bisa coba paket ini gratis (dibatasi jumlah baris, § Pengaturan Trial) tanpa
                  bayar dulu. Nonaktif secara default — Anda yang menentukan paket mana yang boleh ditrial.
                </span>
              </span>
            </label>
          )}
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<Plan>();

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await api.admin.plans.get({ query: { search: search || undefined } });
    if (!res.data) return;
    // § Fase 53 — sort by modul lalu durasi, supaya beberapa tier paket
    // untuk modul yang sama (Bulanan/Tahunan dst) tampil berdekatan di
    // tabel, bukan tersebar sesuai urutan dibuat.
    const rows = [...(res.data as unknown as { plans: Plan[] }).plans].sort(
      (a, b) => (a.modules[0] ?? "").localeCompare(b.modules[0] ?? "") || a.durationDays - b.durationDays,
    );
    setPlans(rows);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ulang saat search berubah, pola sama admin/users/page.tsx
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDeactivate(plan: Plan) {
    const res = await api.admin.plans({ id: plan.id }).delete();
    if (res.error) {
      toast.error("Gagal menonaktifkan paket.");
      return;
    }
    toast.success(`"${plan.name}" dinonaktifkan.`);
    load();
  }

  // Tidak dibungkus `useMemo` — lihat catatan sama di admin/orders/page.tsx.
  // § ADR-0034 (2026-09-17) — width eksplisit tiap kolom + "Fitur"
  // (join modul, bisa panjang) dibungkus `TruncateText`.
  const columns = [
    columnHelper.accessor("name", {
      header: "Nama",
      meta: { width: "18%" },
      cell: (ctx) => <TruncateText className="font-medium text-foreground">{ctx.getValue()}</TruncateText>,
    }),
    columnHelper.accessor("price", { header: "Harga", meta: { width: "13%" }, cell: (ctx) => currencyFormatter.format(ctx.getValue()) }),
    columnHelper.accessor("durationDays", { header: "Durasi", meta: { width: "10%" }, cell: (ctx) => formatDuration(ctx.getValue()) }),
    columnHelper.display({
      id: "modules",
      header: "Fitur",
      meta: { width: "24%" },
      cell: ({ row }) =>
        row.original.kind === "seat_addon" ? (
          <span className="text-muted-foreground">Slot User Tambahan</span>
        ) : (
          <TruncateText className="text-muted-foreground">
            {/* § diminta user 2026-09-23 — label modul BISA SAMA lintas Produk (mis. "Sales Invoice" ada di
               Facport DAN Konverter), jadi Produk WAJIB ikut ditampilkan, bukan cuma label mentah. */}
            {row.original.modules
              .map((m) => {
                const found = MODULE_OPTIONS.find((o) => o.key === m);
                return found ? `${found.label} (${productLineLabel(found.productLine)})` : m;
              })
              .join(", ") || "-"}
          </TruncateText>
        ),
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      meta: { width: "10%" },
      cell: ({ row }) => <StatusBadge domain="plan" status={row.original.isActive ? "active" : "inactive"} />,
    }),
    columnHelper.display({
      id: "trialEligible",
      header: "Trial",
      meta: { width: "9%" },
      cell: ({ row }) => (
        <span className={row.original.trialEligible ? "text-success" : "text-muted-foreground"}>
          {row.original.trialEligible ? "Aktif" : "Nonaktif"}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      meta: { width: "88px" },
      cell: ({ row }) => {
        const plan = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <PlanFormDialog plan={plan} onSaved={load} />
            {plan.isActive && (
              <button
                type="button"
                onClick={() => handleDeactivate(plan)}
                title="Nonaktifkan"
                aria-label={`Nonaktifkan ${plan.name}`}
                className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Paket" description="Kelola paket langganan per fitur." action={<PlanFormDialog onSaved={load} />} />

      <Card>
        <CardHeader>
          <CardTitle>Semua Paket</CardTitle>
          <CardDescription>Katalog per fitur — cart multi-fitur dirakit saat checkout, bukan di sini.</CardDescription>
          <SearchForm placeholder="Cari nama paket..." onSearch={setSearch} className="mt-2 w-full" />
        </CardHeader>
        <CardContent>
          {!plans ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={plans} emptyIcon={Ban} emptyTitle="Belum ada paket" />}
        </CardContent>
      </Card>
    </div>
  );
}
