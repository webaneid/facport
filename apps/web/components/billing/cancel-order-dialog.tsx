"use client";

import { useState } from "react";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";

// § Fase 178 — batalkan invoice/pesanan yang BELUM lunas. 1 invoice = 1 Data Usaha = 1 pembayaran → pembatalan selalu untuk SELURUH invoice.
//  - mode "customer": pemilik membatalkan pesanannya sendiri (hanya saat belum ada bukti yang menunggu admin — pending/rejected); tanpa alasan.
//  - mode "admin": alasan WAJIB (tampil ke customer lewat notifikasi); boleh untuk pending/submitted/rejected.
// Membatalkan membuka blokir pembelian/perpanjangan fitur yang sama (pesanan yang belum selesai memblokirnya).
export const CUSTOMER_CANCELLABLE = ["pending", "rejected"];
export const ADMIN_CANCELLABLE = ["pending", "submitted", "rejected"];

const ERROR_MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "Pesanan tidak ditemukan.",
  ORDER_NOT_CANCELLABLE: "Pesanan ini sudah tidak bisa dibatalkan (bukti pembayaran sudah dikirim, atau sudah dibatalkan/kedaluwarsa).",
  INVOICE_ALREADY_PAID: "Invoice ini sudah lunas dan tidak bisa dibatalkan.",
};

export function CancelOrderDialog({
  mode,
  orderId,
  invoiceNumber,
  onCancelled,
  trigger = "icon",
}: {
  mode: "customer" | "admin";
  orderId: string;
  invoiceNumber: string;
  onCancelled: () => void;
  /** "icon" = tombol ikon (kolom Aksi tabel); "button" = tombol bertulisan (halaman pembayaran). */
  trigger?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (mode === "admin" && !reason.trim()) {
      setError("Alasan pembatalan wajib diisi (akan dibaca customer).");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = mode === "admin" ? await api.admin.orders({ id: orderId }).cancel.post({ reason: reason.trim() }) : await api.orders({ id: orderId }).cancel.post();
    setSubmitting(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code ?? "";
      setError(ERROR_MESSAGES[code] ?? "Gagal membatalkan invoice — coba lagi.");
      return;
    }
    toast.success(`Invoice ${invoiceNumber} dibatalkan.`);
    setOpen(false);
    setReason("");
    onCancelled();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      {trigger === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Batalkan invoice"
          aria-label={`Batalkan invoice ${invoiceNumber}`}
          className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
        >
          <XCircle className="h-4 w-4" />
        </button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="text-destructive">
          Batalkan Pesanan
        </Button>
      )}
      <DialogContent>
        <DialogTitle>Batalkan Invoice {invoiceNumber}</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            {mode === "customer"
              ? "Pesanan ini akan dibatalkan dan tidak bisa dibayar lagi. Kamu bisa membuat pesanan baru kapan saja."
              : "Seluruh invoice dan pesanannya akan dibatalkan; customer diberi tahu beserta alasannya. Invoice yang sudah lunas tidak bisa dibatalkan di sini."}
          </p>
          {mode === "admin" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Alasan (wajib, customer akan membaca ini)</span>
              <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Salah pilih paket, dibuatkan ulang" />
            </label>
          )}
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Tidak
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting || (mode === "admin" && !reason.trim())} className="bg-destructive text-white hover:bg-destructive/90">
              {submitting ? "Membatalkan..." : "Ya, Batalkan Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
