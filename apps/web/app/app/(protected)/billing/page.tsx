"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Download, CreditCard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/lib/status-badges";
import { api, apiBaseUrl } from "@/lib/api-client";
import { formatDate, currencyFormatter } from "@/lib/utils";
import { groupInvoiceItemLabels } from "@/lib/group-invoice-items";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

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

// § Fase 15, ADR-0021 — riwayat invoice + unduh PDF. Belum ada jalur
// normal yang bikin invoice (checkout = Fase 16-17), jadi halaman ini
// WAJAR kosong sampai fase itu selesai — EmptyState bukan indikasi bug.
export default function BillingPage() {
  const companyTimezone = useCompanyTimezone();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    async function load() {
      const res = await api.me.invoices.get();
      if (res.data) setInvoices((res.data as unknown as { invoices: Invoice[] }).invoices);
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tagihan" description="Riwayat invoice langganan Facport kamu." />

      <Card>
        <CardHeader>
          <CardTitle>Semua Invoice</CardTitle>
          <CardDescription>Klik &quot;Unduh PDF&quot; untuk lihat/simpan dokumen invoice resmi.</CardDescription>
        </CardHeader>
        <CardContent>
          {!invoices ? (
            <Skeleton className="h-40 w-full" />
          ) : invoices.length === 0 ? (
            <EmptyState icon={FileText} title="Belum ada invoice" description="Invoice muncul di sini setelah kamu berlangganan fitur." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Fitur</TableHead>
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
                    <TableCell className="text-muted-foreground">{groupInvoiceItemLabels(inv.items) || "-"}</TableCell>
                    <TableCell>{currencyFormatter.format(inv.total)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.dueDate, companyTimezone)}</TableCell>
                    <TableCell>
                      <StatusBadge domain="invoice" status={inv.status} />
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
