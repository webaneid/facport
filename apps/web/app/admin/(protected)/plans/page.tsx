"use client";

import { useEffect, useState } from "react";
import { Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api-client";

// § Fase 14, ADR-0019 — katalog SEKARANG per SUB-MODUL (bukan grup
// top-level lagi): "1 plan = 1 SKU per sub-modul", bundling multi-modul
// terjadi di CART (Fase 16-17), bukan di sini. Cocok persis
// `SUB_MODULE_KEYS` di `apps/api/src/routes/admin/plans.route.ts` —
// diubah di 2 tempat kalau berubah.
const MODULE_OPTIONS = [
  { key: "sales_invoice", label: "Sales Invoice", group: "Penjualan" },
  { key: "sales_receipt", label: "Sales Receipt (Customer Receipt)", group: "Penjualan" },
  { key: "purchase_invoice", label: "Purchase Invoice", group: "Pembelian" },
  { key: "purchase_payment", label: "Purchase Payment", group: "Pembelian" },
  { key: "journal_voucher", label: "Jurnal Umum", group: "Buku Besar" },
] as const;
const MODULE_GROUPS = [...new Set(MODULE_OPTIONS.map((m) => m.group))];
type ModuleKey = (typeof MODULE_OPTIONS)[number]["key"];

const currencyFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean };

function PlanFormDialog({ plan, onSaved }: { plan?: Plan; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(String(plan?.price ?? ""));
  const [durationDays, setDurationDays] = useState(String(plan?.durationDays ?? 30));
  // § 1 plan = 1 sub-modul (radio, bukan checkbox lagi sejak Fase 14)
  const [moduleKey, setModuleKey] = useState<ModuleKey | "">((plan?.modules[0] as ModuleKey) ?? "");
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
    const days = Number(durationDays);
    if (!Number.isInteger(days) || days < 1) {
      setError("Durasi harus angka bulat, minimal 1 hari.");
      return;
    }
    if (!moduleKey) {
      setError("Pilih sub-modul untuk paket ini.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = { name: name.trim(), price: priceValue, durationDays: days, modules: [moduleKey], isActive: true };
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
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Harga (Rp)</span>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Durasi (hari)</span>
            <Input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
          </label>
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-foreground">Sub-Modul (1 paket = 1 sub-modul)</span>
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
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  async function load() {
    const res = await api.admin.plans.get();
    if (res.data) setPlans((res.data as unknown as { plans: Plan[] }).plans);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar (bukan derived state)
    load();
  }, []);

  async function handleDeactivate(plan: Plan) {
    const res = await api.admin.plans({ id: plan.id }).delete();
    if (res.error) {
      toast.error("Gagal menonaktifkan paket.");
      return;
    }
    toast.success(`"${plan.name}" dinonaktifkan.`);
    load();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Paket</h1>
          <p className="text-sm text-muted-foreground">Kelola paket langganan per modul.</p>
        </div>
        <PlanFormDialog onSaved={load} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Semua Paket</CardTitle>
          <CardDescription>Katalog per sub-modul — cart multi-modul dirakit saat checkout, bukan di sini.</CardDescription>
        </CardHeader>
        <CardContent>
          {!plans ? (
            <Skeleton className="h-40 w-full" />
          ) : plans.length === 0 ? (
            <EmptyState icon={Ban} title="Belum ada paket" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Sub-Modul</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium text-foreground">{plan.name}</TableCell>
                    <TableCell>{currencyFormatter.format(plan.price)}</TableCell>
                    <TableCell>{plan.durationDays} hari</TableCell>
                    <TableCell className="text-muted-foreground">
                      {plan.modules.map((m) => MODULE_OPTIONS.find((o) => o.key === m)?.label ?? m).join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive ? "success" : "default"}>{plan.isActive ? "Aktif" : "Nonaktif"}</Badge>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
