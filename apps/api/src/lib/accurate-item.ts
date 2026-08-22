import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

export type ItemResult = {
  id: number;
  no: string;
  name: string;
};

// § pola sama findVendorByNo (accurate-vendor.ts) — item/list.do juga
// TIDAK balikin `no`/`name` di response ringkas default, WAJIB
// `filter.no.val` + `fields` eksplisit.
export async function findItemByNo(
  ctx: AccurateSessionContext,
  itemNo: string,
): Promise<{ id: number; no: string; name: string } | undefined> {
  return withAccurateRateLimit(async () => {
    const params = new URLSearchParams({ "filter.no.val": itemNo, fields: "id,no,name" });
    const res = await fetch(`${ctx.host}/accurate/api/item/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    const list = await parseAccurateEnvelope<{ id: number; no: string; name: string }[]>(res);
    return list[0];
  });
}

// § phase-05-purchase-invoice-auto-create.md — TERVERIFIKASI 2026-08-20.
// Dipanggil SEBELUM `savePurchaseInvoice` kalau item di Excel belum ada
// di Accurate. `itemType` SENGAJA selalu `NON_INVENTORY` (default, tidak
// ada kolom Excel untuk ini) — hindari kompleksitas tracking stok/gudang
// yang belum relevan buat kasus "auto-lengkapi item saat import faktur".
export async function findOrCreateItem(
  ctx: AccurateSessionContext,
  itemNo: string,
  createFields: Record<string, unknown>,
): Promise<{ id: number; no: string; name: string }> {
  const existing = await findItemByNo(ctx, itemNo);
  if (existing) return existing;

  if (!createFields.name || !createFields.unit1Name) {
    throw new Error(
      `Barang dengan kode "${itemNo}" belum ada di Accurate, dan "Nama Barang"/"Satuan Barang" kosong — wajib diisi untuk membuat barang baru`,
    );
  }

  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/item/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        no: itemNo,
        itemType: "NON_INVENTORY",
        itemCategoryName: "Umum",
        ...createFields,
      }),
    });
    return parseAccurateSaveEnvelope<ItemResult>(res);
  });
}
