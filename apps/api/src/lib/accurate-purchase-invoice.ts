import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-accurate-integration.md § 3 — Purchase Invoice VERIFIED.
// Pakai save.do PER-BARIS (bukan bulk-save.do) — lihat phase-02 doc
// "Keputusan Kecil" untuk alasannya (response schema bulk-save.do tidak
// terverifikasi Accurate).
// Record hasil save.do (field `r`) punya PULUHAN field turunan Accurate —
// cuma ambil yang dipakai (`id`, `number`), sisanya diabaikan.
export type PurchaseInvoiceSaveResult = {
  id: number;
  number: string;
};

export async function savePurchaseInvoice(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<PurchaseInvoiceSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-invoice/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchaseInvoiceSaveResult>(res);
  });
}

// § Fase 08, ADR-0012 — dipakai jalur update/append (`appendToExistingPurchaseInvoice`
// di workers/index.ts): fetch state TERBARU faktur existing SEBELUM susun
// payload update, karena `detailItem` di-REPLACE (bukan merge) tiap kali
// save.do dipanggil dengan `id`. `detail.do` adalah endpoint view/list
// (`GET`), ikut pola envelope generik `{s, d: T}` — pakai
// `parseAccurateEnvelope`, BUKAN `parseAccurateSaveEnvelope` (itu khusus
// endpoint save/mutasi, § accurate.ts).
// Response mentah `detail.do` taruh kode barang di `detailItem[].item.no`
// (object bersarang), BUKAN `detailItem[].itemNo` langsung — dikonfirmasi
// via test call nyata 2026-08-28 (ADR-0012). Dinormalisasi di sini supaya
// caller tidak perlu tahu bentuk mentah Accurate.
type RawPurchaseInvoiceDetail = {
  vendor?: { no?: string };
  detailItem?: { id: number; unitPrice?: number; quantity?: number; item?: { no?: string } }[];
};

export type PurchaseInvoiceDetail = {
  vendor: { no: string };
  detailItem: { id: number; itemNo: string; unitPrice: number; quantity: number }[];
};

export async function getPurchaseInvoiceDetail(ctx: AccurateSessionContext, id: number): Promise<PurchaseInvoiceDetail> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-invoice/detail.do?${new URLSearchParams({ id: String(id) })}`, {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
      },
    });
    const raw = await parseAccurateEnvelope<RawPurchaseInvoiceDetail>(res);
    return {
      vendor: { no: raw.vendor?.no ?? "" },
      detailItem: (raw.detailItem ?? []).map((it) => ({
        id: it.id,
        itemNo: it.item?.no ?? "",
        unitPrice: Number(it.unitPrice ?? 0),
        quantity: Number(it.quantity ?? 0),
      })),
    };
  });
}
