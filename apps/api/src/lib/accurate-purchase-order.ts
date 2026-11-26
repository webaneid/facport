import { parseAccurateEnvelope, parseAccurateSaveEnvelope, isAccurateRecordNotFound } from "./accurate";
import { parseSalesQuotationDetail, type RawQuotation } from "./accurate-sales-quotation";
import type { PurchaseSourceDoc } from "./import-mapping/source-doc-lines";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { accurateFetch } from "./accurate-http";

// § architecture-purchase-order.md — Purchase Order BUKAN transaksi
// akuntansi (tidak ada jurnal GL, sekadar "pesanan"/komitmen ke vendor),
// dan konsisten pola Purchase Payment/Sales Receipt: TIDAK ADA "Batal
// Import" (2 PO nominal sama bukan duplikat, bisa jadi 2 pesanan sah
// beda) — jadi cuma butuh `save.do`, TIDAK butuh `detail.do`/`delete.do`
// seperti Purchase Invoice.
export type PurchaseOrderSaveResult = {
  id: number;
  number: string;
};

export async function savePurchaseOrder(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<PurchaseOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await accurateFetch(`${ctx.host}/accurate/api/purchase-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<PurchaseOrderSaveResult>(res);
  });
}

// § Fase 225/226 — sisa PO / Penerimaan Barang beserta ID baris & pemasok. Baris yang ditutup manual dilewati.
export async function getPurchaseSourceDoc(
  ctx: AccurateSessionContext,
  path: string,
  number: string,
  docLabel: "Pesanan Pembelian" | "Penerimaan Barang",
  notFound: string,
): Promise<PurchaseSourceDoc> {
  return withAccurateRateLimit(async () => {
    const res = await accurateFetch(`${ctx.host}/accurate/api/${path}/detail.do?${new URLSearchParams({ number })}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    let raw: RawQuotation & { vendor?: { vendorNo?: string } };
    try {
      raw = await parseAccurateEnvelope<typeof raw>(res);
    } catch (err) {
      if (isAccurateRecordNotFound(err)) throw new Error(notFound);
      throw err;
    }
    const detailItem = (raw.detailItem ?? []).filter((line) => line.manualClosed !== true);
    return { ...parseSalesQuotationDetail({ ...raw, detailItem }, number, docLabel), vendorNo: raw.vendor?.vendorNo };
  });
}

export const getPurchaseOrderByNumber = (ctx: AccurateSessionContext, number: string) =>
  getPurchaseSourceDoc(ctx, "purchase-order", number, "Pesanan Pembelian", `Purchase Order "${number}" tidak ditemukan di Accurate — cek kolom "ITEM: Purchase Order No".`);

export const getReceiveItemByNumber = (ctx: AccurateSessionContext, number: string) =>
  getPurchaseSourceDoc(ctx, "receive-item", number, "Penerimaan Barang", `Penerimaan Barang "${number}" tidak ditemukan di Accurate — cek kolom "ITEM: Receive Item No".`);
