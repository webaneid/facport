"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, CreditCard, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

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

const currencyFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

// § Fase 16, ADR-0022 — antrian konfirmasi pembayaran manual. Default
// filter status="submitted" (yang butuh aksi admin) — TIDAK menampilkan
// SEMUA order dari awal, sesuai pola antrian di endpoint backend.
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [proofDialogUrl, setProofDialogUrl] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api.admin.orders.get({ query: {} });
    if (res.data) setOrders((res.data as unknown as { orders: OrderRow[] }).orders);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, []);

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
    load();
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
    load();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Konfirmasi Pembayaran</h1>
        <p className="text-sm text-muted-foreground">Antrian pembayaran manual (transfer bank/QRIS) yang menunggu verifikasi.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menunggu Verifikasi</CardTitle>
          <CardDescription>Cocokkan nominal (termasuk kode unik) & nama pengirim dengan foto bukti sebelum konfirmasi.</CardDescription>
        </CardHeader>
        <CardContent>
          {!orders ? (
            <Skeleton className="h-40 w-full" />
          ) : orders.length === 0 ? (
            <EmptyState icon={CreditCard} title="Tidak ada pembayaran menunggu verifikasi" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Nominal (+kode unik)</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Diupload</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium text-foreground">{order.invoice.invoiceNumber}</TableCell>
                    <TableCell>{order.invoice.billToName}</TableCell>
                    <TableCell>
                      {currencyFormatter.format(order.amountDue)}
                      <span className="ml-1 text-xs text-muted-foreground">(+{order.uniqueCode})</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{order.method === "qris" ? "QRIS" : "Transfer Bank"}</TableCell>
                    <TableCell className="text-muted-foreground">{order.submittedAt ? formatDate(order.submittedAt) : "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleViewProof(order.id)}
                          title="Lihat Bukti"
                          aria-label={`Lihat bukti transfer ${order.invoice.invoiceNumber}`}
                          className={buttonVariants("ghost", "h-8 w-8 p-0")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              <textarea
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-shadow focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="mis. Nominal transfer tidak sesuai kode unik"
              />
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
