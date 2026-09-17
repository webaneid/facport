import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-item-transfer.md — save.do PER-GRUP (bukan bulk-save.do,
// konsisten pola modul lain). DI-SHARE literal oleh 2 Facport module
// ("Item Transfer" DAN "Item Requisition", § architecture doc "Konteks")
// karena keduanya panggil endpoint Accurate yang SAMA PERSIS — bukan
// duplikasi logika bisnis yang perlu dipisah seperti Other Payment/Other
// Deposit (yang endpoint-nya beda), murni 1 HTTP call dipakai 2 modul.
// TIDAK ada lookup item/gudang sebelum panggil ini — `itemNo`/
// `warehouseName` dikirim APA ADANYA, Accurate yang validasi eksistensi.
export type ItemTransferSaveResult = {
  id: number;
  number: string;
};

export async function saveItemTransfer(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<ItemTransferSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/item-transfer/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<ItemTransferSaveResult>(res);
  });
}
