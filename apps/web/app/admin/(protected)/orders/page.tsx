"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, CreditCard, Ban } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { StatusBadge } from "@/lib/status-badges";
import { api } from "@/lib/api-client";
import { formatDate, currencyFormatter } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

type OrderRow = {
  id: string;
  method: string | null;
  uniqueCode: number;
  status: string;
  transferDate: string | null;
  proofUrl: string | null;
  payerNote: string | null;
  submittedAt: string | null;
  invoice: { invoiceNumber: string; billToName: string; total: number };
  amountDue: number;
};

// § Fase 20, ADR-0023 — sebelumnya halaman ini SELALU filter
// status="submitted" saja (mengikuti default backend), admin TIDAK
// PERNAH bisa lihat order yang sudah paid/rejected lewat UI. Sekarang
// pakai Tabs sebagai antarmuka pilih status queue — "Semua" mencakup
// status langka (pending/cancelled/expired) tanpa perlu 1 tab per status.
const QUEUE_TABS = [
  { value: "submitted", label: "Menunggu Verifikasi" },
  { value: "paid", label: "Lunas" },
  { value: "rejected", label: "Ditolak" },
  { value: "all", label: "Semua" },
] as const;
type QueueStatus = (typeof QUEUE_TABS)[number]["value"];

const columnHelper = createDataTableColumns<OrderRow>();

export default function AdminOrdersPage() {
  const companyTimezone = useCompanyTimezone();
  const [queue, setQueue] = useState<QueueStatus>("submitted");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [proofDialogUrl, setProofDialogUrl] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(status: QueueStatus) {
    setOrders(null);
    const res = await api.admin.orders.get({ query: { status } });
    if (res.data) setOrders((res.data as unknown as { orders: OrderRow[] }).orders);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal/tiap ganti tab, pola standar
    load(queue);
  }, [queue]);

  async function handleViewProof(orderId: string) {
    const res = await api.admin.orders({ id: orderId })["proof-url"].get();
    if (res.error || !res.data) {
      toast.error("Gagal ambil foto bukti transfer.");
      return;
    }
    setProofDialogUrl((res.data as { url: string }).url);
  }

  async function handleConfirm(orderId: string) {
    setBusyId(orderId);
    const res = await api.admin.orders({ id: orderId }).confirm.post();
    setBusyId(null);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(code === "ORDER_NOT_SUBMITTED" ? "Order sudah diproses sebelumnya." : "Gagal konfirmasi pembayaran.");
      return;
    }
    const data = res.data as { subscriptionsCreated: number };
    toast.success(`Pembayaran dikonfirmasi — ${data.subscriptionsCreated} langganan diaktifkan.`);
    load(queue);
  }

  async function handleReject() {
    if (!rejectingId || !rejectReason.trim()) return;
    setBusyId(rejectingId);
    const res = await api.admin.orders({ id: rejectingId }).reject.post({ reason: rejectReason.trim() });
    setBusyId(null);
    if (res.error) {
      toast.error("Gagal tolak pembayaran.");
      return;
    }
    toast.success("Pembayaran ditolak, customer bisa upload ulang bukti.");
    setRejectingId(null);
    setRejectReason("");
    load(queue);
  }

  // Tidak dibungkus `useMemo` — handler (`handleConfirm` dkk) dibuat
  // ulang tiap render (bukan `useCallback`), jadi "optimisasi" useMemo
  // di sini cuma ilusi (tetap invalidasi tiap render lewat closure yang
  // berubah) sambil nambah risiko stale closure kalau deps kurang
  // lengkap. Volume data admin/orders kecil, biaya rebuild kolom tiap
  // render bisa diabaikan.
  const columns = [
      columnHelper.accessor((row) => row.invoice.invoiceNumber, {
        id: "invoiceNumber",
        header: "Invoice",
        cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue()}</span>,
      }),
      columnHelper.accessor((row) => row.invoice.billToName, { id: "billToName", header: "Customer" }),
      columnHelper.display({
        id: "amountDue",
        header: "Nominal (+kode unik)",
        cell: ({ row }) => (
          <>
            {currencyFormatter.format(row.original.amountDue)}
            <span className="ml-1 text-xs text-muted-foreground">(+{row.original.uniqueCode})</span>
          </>
        ),
      }),
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge domain="order" status={row.original.status} />,
      }),
      columnHelper.display({
        id: "method",
        header: "Metode",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.method === "qris" ? "QRIS" : row.original.method === "bank_transfer" ? "Transfer Bank" : "-"}</span>,
      }),
      columnHelper.display({
        id: "submittedAt",
        header: "Diupload",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.submittedAt ? formatDate(row.original.submittedAt, companyTimezone) : "-"}</span>,
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        cell: ({ row }) => {
          const order = row.original;
          const canAct = order.status === "submitted";
          return (
            <div className="flex items-center justify-end gap-1">
              {order.proofUrl && (
                <button
                  type="button"
                  onClick={() => handleViewProof(order.id)}
                  title="Lihat Bukti"
                  aria-label={`Lihat bukti transfer ${order.invoice.invoiceNumber}`}
                  className={buttonVariants("ghost", "h-8 w-8 p-0")}
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
              {canAct && (
                <>
                  <Button onClick={() => handleConfirm(order.id)} disabled={busyId === order.id} className="h-8">
                    Konfirmasi
                  </Button>
                  <button
                    type="button"
                    onClick={() => setRejectingId(order.id)}
                    title="Tolak"
                    aria-label={`Tolak pembayaran ${order.invoice.invoiceNumber}`}
                    className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          );
        },
      }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Konfirmasi Pembayaran" description="Antrian pembayaran manual (transfer bank/QRIS) yang menunggu verifikasi." />

      <Tabs value={queue} onValueChange={(v) => setQueue(v as QueueStatus)}>
        <TabsList>
          {QUEUE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          {!orders ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={orders}
              emptyIcon={CreditCard}
              emptyTitle={queue === "submitted" ? "Tidak ada pembayaran menunggu verifikasi" : "Tidak ada order untuk status ini"}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!proofDialogUrl} onOpenChange={(open) => !open && setProofDialogUrl(null)}>
        <DialogContent>
          <DialogTitle>Bukti Transfer</DialogTitle>
          {proofDialogUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proofDialogUrl} alt="Bukti transfer" className="mt-3 max-h-[70vh] w-full rounded-md border border-border object-contain" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogTitle>Tolak Pembayaran</DialogTitle>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Alasan (wajib, customer akan lihat ini)</span>
              <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="mis. Nominal transfer tidak sesuai kode unik" />
            </label>
            <Button onClick={handleReject} disabled={!rejectReason.trim() || busyId === rejectingId} className="self-end">
              Tolak Pembayaran
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
