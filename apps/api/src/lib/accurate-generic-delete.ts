// § Fase 165 (Batal Import 19 modul) — delete.do di SEMUA modul transaksi
// Accurate punya kontrak IDENTIK (DELETE, query param `id`, envelope polos
// `{s,d}` tanpa field `r`, § `parseAccurateEnvelope`) — beda dari
// `purchase_invoice`/`sales_invoice` yang punya wrapper sendiri
// (`accurate-purchase-invoice.ts`/`accurate-sales-invoice.ts`) KARENA kedua
// modul itu juga butuh logic lain (append/detail.do) yang TIDAK generic.
// 19 modul "sederhana" (1 batch = 1 dokumen Accurate, tanpa merge
// lintas-batch) di bawah ini CUKUP 1 fungsi generic — bukan 19 file nyaris
// identik.
import { parseAccurateEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

export async function deleteAccurateDocument(ctx: AccurateSessionContext, accuratePath: string, id: number): Promise<void> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/${accuratePath}/delete.do?${new URLSearchParams({ id: String(id) })}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
      },
    });
    await parseAccurateEnvelope<unknown>(res);
  });
}

// § module (`import_batches.module`) → path endpoint Accurate (tanpa awalan
// `/accurate/api/`, tanpa `/delete.do`). HARUS sinkron dengan path `save.do`
// masing-masing modul (lihat `accurate-{module}.ts`) — 2 pengecualian yang
// path-nya BEDA dari nama modul: `item_requisition` → `purchase-requisition`
// (Fase 164, rebuild), `inventory_adjustment` → `item-adjustment`.
export const GENERIC_CANCELLABLE_MODULES: Record<string, string> = {
  sales_receipt: "sales-receipt",
  purchase_payment: "purchase-payment",
  journal_voucher: "journal-voucher",
  other_payment: "other-payment",
  other_deposit: "other-deposit",
  purchase_order: "purchase-order",
  receive_item: "receive-item",
  purchase_return: "purchase-return",
  sales_quotation: "sales-quotation",
  sales_order: "sales-order",
  sales_return: "sales-return",
  delivery_order: "delivery-order",
  item_transfer: "item-transfer",
  item_requisition: "purchase-requisition",
  inventory_adjustment: "item-adjustment",
  roll_over: "roll-over",
  work_order: "work-order",
  material_slip: "material-slip",
  finished_good_slip: "finished-good-slip",
};
