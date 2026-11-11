import { describe, test, expect, afterEach } from "bun:test";
import { appendToExistingPurchaseInvoice } from "./index";
import type { AccurateSessionContext } from "../lib/accurate-session";
import type { PurchaseInvoiceGroup } from "../lib/import-mapping/purchase-invoice.mapping";

// § Regresi 2026-11-11 — guard "baris hanya-Beban" (Fase 214) menolak faktur yang SUDAH DIHAPUS di Accurate karena jalan SEBELUM verifikasi ke Accurate
// (catatan lokal `#382` basi). Urutan yang benar: verifikasi `detail.do` dulu; faktur tak ada → jalur CREATE; faktur ada → baru tolak baris hanya-Beban.
const ctx: AccurateSessionContext = { accessToken: "t", session: "s", host: "http://accurate.test" };
const mapping = { "Vendor No": "vendorNo", Tanggal: "transDate", "Trans No": "number", "Akun Beban": "expenseAccountNo", "Jumlah Beban": "expenseAmount" };
const group: PurchaseInvoiceGroup = {
  groupKey: "14719",
  groupColumn: "Trans No",
  rows: [{ id: "r1", rowNumber: 1, rawData: { "Vendor No": "10508", Tanggal: "25/02/2025", "Trans No": "14719", "Akun Beban": "1100.36", "Jumlah Beban": 800000 } } as PurchaseInvoiceGroup["rows"][number]],
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Accurate palsu: `detail.do` dibalas `detailBody`; panggilan LAIN (jalur CREATE) dicatat lalu dilempar sentinel agar tes berhenti di situ. */
function stubAccurate(detailBody: unknown) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: Request | string | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/purchase-invoice/detail.do")) return new Response(JSON.stringify(detailBody), { status: 200, headers: { "Content-Type": "application/json" } });
    throw new Error("SENTINEL_CREATE_PATH");
  }) as unknown as typeof fetch;
  return urls;
}

describe("appendToExistingPurchaseInvoice — baris hanya-Beban", () => {
  test("faktur lama SUDAH DIHAPUS di Accurate → jatuh ke jalur CREATE, bukan galat 'sudah punya Faktur'", async () => {
    const urls = stubAccurate({ s: false, d: ["Faktur Pembelian tidak tepat"] });
    const err = await appendToExistingPurchaseInvoice(ctx, 382, "old-batch", "new-batch", group, mapping).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("SENTINEL_CREATE_PATH");
    expect((err as Error).message).not.toContain("hanya berisi Beban");
    expect(urls.some((u) => u.includes("/purchase-invoice/detail.do"))).toBe(true);
  });

  test("faktur lama MASIH ADA di Accurate → tetap ditolak dengan pesan Beban", async () => {
    stubAccurate({ s: true, d: { vendor: { vendorNo: "10508" }, detailItem: [] } });
    const err = await appendToExistingPurchaseInvoice(ctx, 382, "old-batch", "new-batch", group, mapping).catch((e: unknown) => e as Error);
    expect((err as Error).message).toContain('Nomor grup "14719" sudah punya Faktur Pembelian #382');
    expect((err as Error).message).toContain("hanya berisi Beban");
  });
});
