import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-accurate-integration.md § 3 — Purchase Invoice VERIFIED.
// Pakai save.do PER-BARIS (bukan bulk-save.do) — lihat phase-02 doc
// "Keputusan Kecil" untuk alasannya (response schema bulk-save.do tidak
// terverifikasi Accurate).
// Record hasil save.do (field `r`) punya PULUHAN field turunan Accurate —
// cuma ambil yang dipakai. `detailItem[].id` ditambahkan Fase 09
// (ADR-0013) — DIKONFIRMASI via test call nyata 2026-08-28 bahwa `r`
// SELALU menyertakan `detailItem[].id` per item (bukan cuma di respons
// `detail.do`), urutan SAMA dengan `detailItem[]` yang dikirim di
// payload — dipakai buat tracking id per-item (`accurateDetailItemId`)
// tanpa perlu fetch ulang `detail.do` setelah tiap save.
export type PurchaseInvoiceSaveResult = {
  id: number;
  number: string;
  detailItem: { id: number }[];
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
// § koreksi 2026-08-28 — field vendor asli adalah `vendor.vendorNo`, BUKAN
// `vendor.no` (yang tidak pernah ada di response, bikin safety check
// vendor-match di `appendToExistingPurchaseInvoice` selalu gagal dengan
// vendor "" kosong). Dikonfirmasi via inspeksi raw JSON nyata faktur #150
// (Data Usaha "PT Frozen Food") 2026-08-28.
type RawPurchaseInvoiceDetail = {
  vendor?: { vendorNo?: string };
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
      vendor: { no: raw.vendor?.vendorNo ?? "" },
      detailItem: (raw.detailItem ?? []).map((it) => ({
        id: it.id,
        itemNo: it.item?.no ?? "",
        unitPrice: Number(it.unitPrice ?? 0),
        quantity: Number(it.quantity ?? 0),
      })),
    };
  });
}

// § Fase 09, ADR-0013 — hapus SELURUH faktur (semua detailItem-nya
// sekaligus). DIKONFIRMASI via test call nyata 2026-08-28: envelope
// respons `{s, d}` BIASA (TIDAK ada field `r` seperti save.do — pakai
// `parseAccurateEnvelope`, bukan `parseAccurateSaveEnvelope`), dan
// BENAR-BENAR menghapus record (bukan soft-delete — `detail.do` sesudah
// delete mengembalikan `s:false`). Cuma terima SATU id per panggilan
// (bukan bulk) — caller WAJIB loop kalau ada banyak faktur.
export async function deletePurchaseInvoice(ctx: AccurateSessionContext, id: number): Promise<void> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/purchase-invoice/delete.do?${new URLSearchParams({ id: String(id) })}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
      },
    });
    await parseAccurateEnvelope<unknown>(res);
  });
}
