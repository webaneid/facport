"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/lib/status-badges";
import { formatDate, currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { moduleCategory, moduleLabel, productLineLabel } from "@/lib/module-options";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

// § diminta user 2026-10-06 — halaman /billing: aksi jadi ikon saja; ikon mata membuka detail invoice (sebelumnya customer hanya bisa unduh PDF).
// Isi dari data `GET /me/invoices` yang sudah ada (tanpa endpoint baru). Menampilkan KEDUA tanggal (Tanggal Invoice & Jatuh Tempo) — daftar hanya
// menampilkan Jatuh Tempo.
export type BillingInvoiceItem = { id: string; label: string; moduleKey: string; price: number; productLine?: string; durationDays?: number };
export type BillingInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate: string;
  createdAt: string;
  billToName?: string;
  items: BillingInvoiceItem[];
  orderId: string | null;
};

export function InvoiceDetailDialog({ invoice }: { invoice: BillingInvoice }) {
  const timezone = useCompanyTimezone();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Lihat detail invoice"
        aria-label={`Lihat detail invoice ${invoice.invoiceNumber}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0")}
      >
        <Eye className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Invoice {invoice.invoiceNumber}</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Tanggal Invoice</p>
              <p className="text-foreground">{formatDate(invoice.createdAt, timezone)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Jatuh Tempo</p>
              <p className="text-foreground">{formatDate(invoice.dueDate, timezone)}</p>
            </div>
          </div>
          {invoice.billToName && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Ditagihkan Ke</p>
              <p className="text-foreground">{invoice.billToName}</p>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Yang Dibeli</p>
            <div className="flex flex-col gap-1 rounded-md border border-border p-3">
              {invoice.items.map((item) => {
                // "seat_addon" = sentinel paket User Tambahan (bukan modul/produk sungguhan) — tanpa label modul/produk.
                const isSeat = item.moduleKey === "seat_addon";
                const meta = isSeat ? [] : [item.productLine ? productLineLabel(item.productLine) : null, moduleCategory(item.moduleKey), moduleLabel(item.moduleKey)].filter((v): v is string => !!v);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-foreground">{item.label}</span>
                      {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>}
                      {item.durationDays ? <p className="text-xs text-muted-foreground">Durasi: {formatDuration(item.durationDays)}</p> : null}
                    </div>
                    <span className="shrink-0 text-muted-foreground">{currencyFormatter.format(item.price)}</span>
                  </div>
                );
              })}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 font-medium text-foreground">
                <span>Total</span>
                <span>{currencyFormatter.format(invoice.total)}</span>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Status</p>
            <StatusBadge domain="invoice" status={invoice.status} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
