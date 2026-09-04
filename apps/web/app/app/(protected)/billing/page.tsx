"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Download, CreditCard } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiBaseUrl } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

type InvoiceItem = { id: string; label: string; moduleKey: string; price: number };
type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate: string;
  createdAt: string;
  items: InvoiceItem[];
  orderId: string | null;
};

const INVOICE_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  unpaid: { label: "Belum Dibayar", variant: "warning" },
  paid: { label: "Lunas", variant: "success" },
  void: { label: "Dibatalkan", variant: "default" },
  expired: { label: "Kadaluarsa", variant: "destructive" },
};

const currencyFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

// § Fase 15, ADR-0021 — riwayat invoice + unduh PDF. Belum ada jalur
// normal yang bikin invoice (checkout = Fase 16-17), jadi halaman ini
// WAJAR kosong sampai fase itu selesai — EmptyState bukan indikasi bug.
export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    async function load() {
      const res = await api.me.invoices.get();
      if (res.data) setInvoices((res.data as unknown as { invoices: Invoice[] }).invoices);
    }
    load();
  }, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tagihan</h1>
        <p className="text-sm text-muted-foreground">Riwayat invoice langganan Facport kamu.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Semua Invoice</CardTitle>
          <CardDescription>Klik &quot;Unduh PDF&quot; untuk lihat/simpan dokumen invoice resmi.</CardDescription>
        </CardHeader>
        <CardContent>
          {!invoices ? (
            <Skeleton className="h-40 w-full" />
          ) : invoices.length === 0 ? (
            <EmptyState icon={FileText} title="Belum ada invoice" description="Invoice muncul di sini setelah kamu berlangganan sub-modul." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Modul</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-foreground">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.items.map((i) => i.label).join(", ") || "-"}</TableCell>
                    <TableCell>{currencyFormatter.format(inv.total)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant={(INVOICE_STATUS[inv.status] ?? { variant: "default" }).variant}>
                        {INVOICE_STATUS[inv.status]?.label ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status === "unpaid" && inv.orderId && (
                          <Link href={`/billing/${inv.orderId}/pay`} className={buttonVariants("default", "h-8 gap-1.5")}>
                            <CreditCard className="h-3.5 w-3.5" />
                            Bayar Sekarang
                          </Link>
                        )}
                        <a
                          href={`${apiBaseUrl}/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants("outline", "h-8 gap-1.5")}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Unduh PDF
                        </a>
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
