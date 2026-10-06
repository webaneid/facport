"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FileDown, Banknote } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TruncateText } from "@/components/ui/truncate-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/lib/status-badges";
import { api, apiBaseUrl } from "@/lib/api-client";
import { formatDate, currencyFormatter } from "@/lib/utils";
import { groupInvoiceItemLabels } from "@/lib/group-invoice-items";
import { InvoiceDetailDialog, type BillingInvoice } from "@/components/billing/invoice-detail-dialog";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

type Invoice = BillingInvoice;

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
          <CardDescription>Ikon di kolom Aksi: mata = lihat detail invoice, uang = bayar sekarang, dokumen = unduh PDF invoice resmi.</CardDescription>
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
                  <TableHead className="w-[14%]">Nomor</TableHead>
                  <TableHead className="w-[30%]">Fitur</TableHead>
                  <TableHead className="w-[12%]">Total</TableHead>
                  <TableHead className="w-[14%]">Jatuh Tempo</TableHead>
                  <TableHead className="w-[10%]">Status</TableHead>
                  <TableHead className="w-[144px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-foreground">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <TruncateText>{groupInvoiceItemLabels(inv.items) || "-"}</TruncateText>
                    </TableCell>
                    <TableCell>{currencyFormatter.format(inv.total)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.dueDate, companyTimezone)}</TableCell>
                    <TableCell>
                      <StatusBadge domain="invoice" status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* § diminta user 2026-10-06 — semua aksi berupa ikon saja (tooltip + label akses menjelaskan fungsinya). */}
                      <div className="flex items-center justify-end gap-1">
                        <InvoiceDetailDialog invoice={inv} />
                        {inv.status === "unpaid" && inv.orderId && (
                          <Link
                            href={`/billing/${inv.orderId}/pay`}
                            title="Bayar sekarang"
                            aria-label={`Bayar sekarang invoice ${inv.invoiceNumber}`}
                            className={buttonVariants("ghost", "h-8 w-8 p-0 text-green-700 hover:bg-green-50")}
                          >
                            <Banknote className="h-4 w-4" />
                          </Link>
                        )}
                        <a
                          href={`${apiBaseUrl}/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Unduh PDF"
                          aria-label={`Unduh PDF invoice ${inv.invoiceNumber}`}
                          className={buttonVariants("ghost", "h-8 w-8 p-0")}
                        >
                          <FileDown className="h-4 w-4" />
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
