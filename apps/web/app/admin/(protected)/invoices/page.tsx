"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { FileText, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { StatusBadge } from "@/lib/status-badges";
import { Can } from "@/components/auth/can";
import { api, apiBaseUrl } from "@/lib/api-client";
import { formatDate, currencyFormatter } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { moduleLabel } from "@/lib/module-options";

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:6209";

type InvoiceItem = { id: string; label: string; moduleKey: string; price: number };
type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  billToName: string;
  total: number;
  dueDate: string;
  createdAt: string;
  items: InvoiceItem[];
  orderId: string | null;
};
type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean };
type UserOption = { id: string; name: string; email: string };
type CreatedInvoiceResult = { invoiceId: string; orderId: string; amountDue: number };

function publicPayLink(orderId: string) {
  return `${LANDING_URL}/pay/${orderId}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link pembayaran publik disalin.");
  } catch {
    toast.error("Gagal menyalin link — salin manual dari address bar setelah dibuka.");
  }
}

// § Fase 27, ADR-0025 — admin bikin invoice BARU untuk user EXISTING
// (bukan bersamaan pembuatan user seperti Fase 18), boleh >1 paket
// sekaligus. Pola Combobox (cari user) + Checkbox (pilih paket) SAMA
// dengan `AddUserDialog` (`admin/users/page.tsx`) — sengaja konsisten,
// bukan didesain ulang.
function CreateInvoiceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvoiceResult | null>(null);
  // § Fase 26, ADR-0024 (security-auditor finding) — role dgn `invoices.manage`
  // tapi bukan `users.manage` akan selalu dapat pencarian kosong tanpa
  // penjelasan (endpoint `GET /admin/users` digerbangi `users.manage`,
  // beda dari `invoices.manage` yg menjaga tombol trigger dialog ini).
  const [searchDenied, setSearchDenied] = useState(false);

  function openDialog() {
    setOpen(true);
    if (!plans) {
      api.admin.plans.get().then((res) => {
        if (res.data) setPlans((res.data as unknown as { plans: Plan[] }).plans.filter((p) => p.isActive));
      });
    }
  }

  async function searchUsers(query: string) {
    setUserQuery(query);
    const res = await api.admin.users.get({ query: { search: query || undefined, limit: 10 } });
    if (res.data) setUserOptions((res.data as unknown as { users: UserOption[] }).users);
    else if (res.error) setSearchDenied(true);
  }

  function togglePlan(planId: string) {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  async function handleCreate() {
    if (!selectedUserId) {
      setError("Pilih user dulu.");
      return;
    }
    if (selectedPlanIds.size === 0) {
      setError("Pilih minimal 1 paket.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.admin.invoices.post({ userId: selectedUserId, planIds: [...selectedPlanIds] });
    setSubmitting(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      setError(
        code === "USER_NOT_FOUND"
          ? "User tidak ditemukan."
          : code === "PLAN_NOT_ACTIVE"
            ? "Salah satu paket sudah tidak aktif."
            : "Gagal membuat invoice — coba lagi.",
      );
      return;
    }
    setCreated(res.data as unknown as CreatedInvoiceResult);
    onCreated();
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      setUserQuery("");
      setUserOptions([]);
      setSelectedUserId("");
      setSelectedPlanIds(new Set());
      setCreated(null);
      setError(null);
      setSearchDenied(false);
    }
  }

  const selectedPlans = plans?.filter((p) => selectedPlanIds.has(p.id)) ?? [];
  const total = selectedPlans.reduce((sum, p) => sum + p.price, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button onClick={openDialog}>Buat Invoice</Button>
      <DialogContent className="max-w-lg">
        <DialogTitle>Buat Invoice</DialogTitle>
        {created ? (
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <p className="rounded-md bg-success-bg px-3 py-2 text-success">
              Invoice berhasil dibuat — total tagihan {currencyFormatter.format(created.amountDue)}.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Link Pembayaran Publik (tanpa login)</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-muted px-2 py-1.5 text-xs text-foreground">
                  {publicPayLink(created.orderId)}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(publicPayLink(created.orderId))}
                  title="Salin Link"
                  aria-label="Salin link pembayaran publik"
                  className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </label>
            <Button onClick={() => handleClose(false)} className="self-end">
              Selesai
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4 text-sm">
            <FormField label="User" required error={searchDenied ? "Anda tidak punya izin mencari data user (butuh permission users.manage)." : undefined}>
              <Combobox
                options={userOptions.map((u) => ({ value: u.id, label: `${u.name || u.email} (${u.email})` }))}
                value={selectedUserId}
                onChange={setSelectedUserId}
                onSearch={searchUsers}
                placeholder={userQuery || "Cari nama atau email..."}
              />
            </FormField>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-xs font-medium text-foreground">Paket (pilih 1 atau lebih)</span>
              {!plans ? (
                <Skeleton className="h-16 w-full" />
              ) : plans.length === 0 ? (
                <p className="text-muted-foreground">Belum ada paket aktif — buat dulu di halaman Paket.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {plans.map((p) => (
                    <label key={p.id} className="flex items-center gap-2">
                      <Checkbox checked={selectedPlanIds.has(p.id)} onCheckedChange={() => togglePlan(p.id)} />
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({p.modules.map(moduleLabel).join(", ")}, {currencyFormatter.format(p.price)})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedPlanIds.size > 0 && <p className="text-xs text-muted-foreground">Total: {currencyFormatter.format(total)}</p>}

            {error && <p className="text-destructive">{error}</p>}
            <Button onClick={handleCreate} loading={submitting} className="self-end">
              Buat Invoice
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<InvoiceRow>();

export default function AdminInvoicesPage() {
  const companyTimezone = useCompanyTimezone();
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);

  async function load() {
    const res = await api.admin.invoices.get();
    if (res.data) setInvoices((res.data as unknown as { invoices: InvoiceRow[] }).invoices);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, []);

  // Tidak dibungkus `useMemo` — lihat catatan sama di admin/orders/page.tsx.
  const columns = [
    columnHelper.accessor("invoiceNumber", { header: "Nomor", cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue()}</span> }),
    columnHelper.accessor("billToName", { header: "Ditagihkan Ke" }),
    columnHelper.display({
      id: "items",
      header: "Paket",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.items.map((i) => i.label).join(", ") || "-"}</span>,
    }),
    columnHelper.accessor("total", { header: "Total", cell: (ctx) => currencyFormatter.format(ctx.getValue()) }),
    columnHelper.accessor("dueDate", { header: "Jatuh Tempo", cell: (ctx) => <span className="text-muted-foreground">{formatDate(ctx.getValue(), companyTimezone)}</span> }),
    columnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="invoice" status={row.original.status} />,
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const invoice = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {invoice.orderId && (
              <button
                type="button"
                onClick={() => copyToClipboard(publicPayLink(invoice.orderId!))}
                title="Salin Link Pembayaran Publik"
                aria-label={`Salin link pembayaran ${invoice.invoiceNumber}`}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
            <a
              href={`${apiBaseUrl}/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              title="Unduh PDF"
              aria-label={`Unduh PDF ${invoice.invoiceNumber}`}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        );
      },
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoice"
        description="Semua invoice — bikin baru untuk user existing di sini."
        // § Fase 26, ADR-0024 — halaman ini bisa diakses dgn `invoices.view`
        // saja (GET /admin/invoices), tapi bikin invoice baru butuh
        // `invoices.manage` terpisah — sembunyikan trigger-nya kalau
        // permission itu tidak ada (backend tetap jadi penjaga utama).
        action={
          <Can permission="invoices.manage">
            <CreateInvoiceDialog onCreated={load} />
          </Can>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {!invoices ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={invoices} emptyIcon={FileText} emptyTitle="Belum ada invoice" />}
        </CardContent>
      </Card>
    </div>
  );
}
