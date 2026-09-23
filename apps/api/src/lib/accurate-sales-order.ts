import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-sales-order.md — Sales Order BUKAN transaksi
// akuntansi (tidak ada jurnal GL, tidak ada perubahan stok, mirror
// Sales Quotation), TIDAK ADA "Batal Import" — cuma butuh `save.do`.
export type SalesOrderSaveResult = {
  id: number;
  number: string;
};

export async function saveSalesOrder(ctx: AccurateSessionContext, payload: Record<string, unknown>): Promise<SalesOrderSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-order/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<SalesOrderSaveResult>(res);
  });
}

// § Fase 158, architecture-delivery-order.md § "Auto-resolve Sales Order
// Detail ID" — dipakai `resolveSalesOrderDetailIds` (workers/index.ts)
// untuk membedakan baris detail Sales Order yang `itemNo`-nya duplikat,
// SEBELUM kirim `delivery-order/save.do`. Endpoint `GET
// sales-order/detail.do` TERDAFTAR resmi di spec (params: `id`, `number`),
// TAPI struktur RESPONS-nya TIDAK terdokumentasi di spec (cuma bilang
// "Success", tanpa skema).
//
// § DIKONFIRMASI test call NYATA 2026-09-24 (Data Usaha "Webane Indonesia",
// database "Retail Demo", akun kurikulum.fac@gmail.com):
// - `detailItem[].id` = ID BARIS (BUKAN ID header SO) — dibuktikan pakai
//   "SO-IDR-01" (2 baris, SAMA `itemNo` "9900014") yang balik `id` 102300
//   & 102301 (beda per baris, urut). Kebetulan SO 1-baris punya
//   `detailItem[0].id` == id header SO-nya sendiri (Accurate alokasikan
//   ID baris pertama = ID header, +1 per baris berikutnya) — BUKAN bug
//   baca field yang salah.
// - `detailItem[].item.no` nested — PERSIS pola `getPurchaseInvoiceDetail`
//   (`accurate-purchase-invoice.ts`, ADR-0012), dikonfirmasi ulang di sini.
// - `detailItem[].dataClassification5` — OBJEK nested (`{id, name, ...}`,
//   BUKAN string flat `dataClassification5Name`) — konsisten pola semua
//   field relasi lain di respons ini (`item`, `tax1`, `warehouse`, dst).
//   **Belum ada data uji dengan CLS5 TERISI** (semua SO uji punya
//   `dataClassification5: null`) — bentuk objek saat terisi diasumsikan
//   `{id, name}` mengikuti pola konsisten field lain, TAPI nama fieldnya
//   sendiri (`dataClassification5`) sudah pasti benar dari respons nyata.
type RawSalesOrderDetail = {
  detailItem?: {
    id: number;
    quantity?: number;
    item?: { no?: string };
    dataClassification5?: { name?: string } | null;
  }[];
};

export type SalesOrderDetailItem = {
  id: number;
  itemNo: string;
  quantity: number;
  dataClassification5Name: string | null;
};

export async function getSalesOrderDetailByNumber(ctx: AccurateSessionContext, number: string): Promise<SalesOrderDetailItem[]> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/sales-order/detail.do?${new URLSearchParams({ number })}`, {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
      },
    });
    const raw = await parseAccurateEnvelope<RawSalesOrderDetail>(res);
    return (raw.detailItem ?? []).map((it) => ({
      id: it.id,
      itemNo: it.item?.no ?? "",
      quantity: Number(it.quantity ?? 0),
      dataClassification5Name: it.dataClassification5?.name ?? null,
    }));
  });
}
