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
import { SearchForm } from "@/components/ui/search-form";
import { StatusBadge } from "@/lib/status-badges";
import { api } from "@/lib/api-client";
import { currencyFormatter } from "@/lib/utils";
import { MODULE_OPTIONS, MODULE_GROUPS, type ModuleKey } from "@/lib/module-options";
import { DURATION_UNIT_LABELS, formatDuration, inferDurationUnit, toDurationDays, type DurationUnit } from "@/lib/duration";

type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean; trialEligible: boolean };

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
    if (!moduleKey) {
      setError("Pilih fitur untuk paket ini.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = { name: name.trim(), price: priceValue, durationDays: days, modules: [moduleKey], isActive: true, trialEligible };
    const res = plan ? await api.admin.plans({ id: plan.id }).put(body) : await api.admin.plans.post(body);
    setSubmitting(false);
    if (res.error) {
      setError("Gagal menyimpan paket.");
      return;
    }
    toast.success(plan ? "Paket diperbarui." : "Paket dibuat.");
    setOpen(false);
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
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-foreground">Fitur (1 paket = 1 fitur)</span>
            {MODULE_GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{group}</span>
                <div className="flex flex-col gap-2 pl-1" role="radiogroup" aria-label={group}>
                  {MODULE_OPTIONS.filter((m) => m.group === group).map((m) => (
                    <label key={m.key} className="flex items-center gap-2">
                      <input type="radio" name="moduleKey" checked={moduleKey === m.key} onChange={() => setModuleKey(m.key)} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
  const columns = [
    columnHelper.accessor("name", {
      header: "Nama",
      cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue()}</span>,
    }),
    columnHelper.accessor("price", { header: "Harga", cell: (ctx) => currencyFormatter.format(ctx.getValue()) }),
    columnHelper.accessor("durationDays", { header: "Durasi", cell: (ctx) => formatDuration(ctx.getValue()) }),
    columnHelper.display({
      id: "modules",
      header: "Fitur",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.modules.map((m) => MODULE_OPTIONS.find((o) => o.key === m)?.label ?? m).join(", ") || "-"}</span>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="plan" status={row.original.isActive ? "active" : "inactive"} />,
    }),
    columnHelper.display({
      id: "trialEligible",
      header: "Trial",
      cell: ({ row }) => (
        <span className={row.original.trialEligible ? "text-success" : "text-muted-foreground"}>
          {row.original.trialEligible ? "Aktif" : "Nonaktif"}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
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
