import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-accurate-integration.md § "Sales Invoice — Fase 13" —
// mirror 1:1 `accurate-purchase-invoice.ts`. Pakai save.do PER-BARIS
// (bukan bulk-save.do), sama alasan PI (§ phase-02 doc "Keputusan Kecil").
export type SalesInvoiceSaveResult = {
  id: number;
  number: string;
  detailItem: { id: number }[];
};

export async function saveSalesInvoice(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<SalesInvoiceSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-invoice/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<SalesInvoiceSaveResult>(res);
  });
}

// § mirror `getPurchaseInvoiceDetail` — belum diverifikasi empiris shape
// `customer.customerNo` di response `detail.do` sales-invoice (PI dulu
// ketemu field asli `vendor.vendorNo`, BUKAN `vendor.no`, via test call
// nyata 2026-08-28 — lihat komentar accurate-purchase-invoice.ts). WAJIB
// diverifikasi sama untuk `customer` sebelum retry cerdas SI dianggap
// production-ready (§ Known Limitations phase-13 doc) — kalau nama field
// asli beda, safety check vendor/customer-match di
// `appendToExistingSalesInvoice` akan selalu gagal diam-diam seperti
// yang pernah kejadian di PI.
type RawSalesInvoiceDetail = {
  customer?: { customerNo?: string };
  detailItem?: { id: number; unitPrice?: number; quantity?: number; item?: { no?: string } }[];
};

export type SalesInvoiceDetail = {
  customer: { no: string };
  detailItem: { id: number; itemNo: string; unitPrice: number; quantity: number }[];
};

export async function getSalesInvoiceDetail(ctx: AccurateSessionContext, id: number): Promise<SalesInvoiceDetail> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-invoice/detail.do?${new URLSearchParams({ id: String(id) })}`, {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
      },
    });
    const raw = await parseAccurateEnvelope<RawSalesInvoiceDetail>(res);
    return {
      customer: { no: raw.customer?.customerNo ?? "" },
      detailItem: (raw.detailItem ?? []).map((it) => ({
        id: it.id,
        itemNo: it.item?.no ?? "",
        unitPrice: Number(it.unitPrice ?? 0),
        quantity: Number(it.quantity ?? 0),
      })),
    };
  });
}

export async function deleteSalesInvoice(ctx: AccurateSessionContext, id: number): Promise<void> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-invoice/delete.do?${new URLSearchParams({ id: String(id) })}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
      },
    });
    await parseAccurateEnvelope<unknown>(res);
  });
}
