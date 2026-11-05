import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { todayAccurateDate } from "./accurate-vendor";
import { accurateFetch } from "./accurate-http";
import { runExclusive } from "./keyed-lock";
import { lookupCacheGet, lookupCacheSet } from "./accurate-lookup-cache";
import { oddCharsHint } from "./input-hygiene";
import { normalizeAccurateNo } from "./accurate-no";

// § architecture-accurate-integration.md § "Sales Invoice — Fase 13" —
// mirror 1:1 `accurate-vendor.ts` (Customer setara Vendor untuk sisi
// penjualan). `todayAccurateDate` di-reuse dari accurate-vendor.ts, bukan
// diduplikasi — fungsi generik (format tanggal Accurate), tidak spesifik
// vendor.
export type CustomerResult = {
  id: number;
  name: string;
};

export async function findCustomerByNo(ctx: AccurateSessionContext, customerNo: string): Promise<{ id: number; name: string } | undefined> {
  return withAccurateRateLimit(async () => {
    const params = new URLSearchParams({ "filter.no.val": normalizeAccurateNo(customerNo), fields: "id,customerNo,name" });
    const res = await accurateFetch(`${ctx.host}/accurate/api/customer/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    const list = await parseAccurateEnvelope<{ id: number; name: string }[]>(res);
    return list[0];
  });
}

async function postCustomerSave(ctx: AccurateSessionContext, payload: Record<string, unknown>) {
  return withAccurateRateLimit(async () => {
    const res = await accurateFetch(`${ctx.host}/accurate/api/customer/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<CustomerResult>(res);
  });
}

// § mirror `findOrCreateVendor` — `customerReceivableAccountListNo` boleh
// update customer yang SUDAH ADA juga (setara `vendorPayableAccountListNo`
// di sisi vendor, § revisi 2026-08-22), field lain create-only.
export async function findOrCreateCustomer(
  ctx: AccurateSessionContext,
  customerNo: string,
  createFields: Record<string, unknown>,
): Promise<{ id: number; name: string }> {
  return runExclusive(`${ctx.session}|customer|${String(customerNo).trim().toLowerCase()}`, () => findOrCreateCustomerImpl(ctx, customerNo, createFields));
}

async function findOrCreateCustomerImpl(
  ctx: AccurateSessionContext,
  customerNo: string,
  createFields: Record<string, unknown>,
): Promise<{ id: number; name: string }> {
  // § Fase 215 — cache hasil positif per sesi. `applied` = nilai akun piutang yang SUDAH diterapkan di sesi ini: update akun HANYA dilewati bila nilainya sama persis;
  // nilai berbeda tetap dikirim (perilaku lama tidak berubah).
  const wanted = createFields.customerReceivableAccountListNo ? String(createFields.customerReceivableAccountListNo) : undefined;
  const cached = lookupCacheGet<{ result: { id: number; name: string }; applied?: string }>(ctx, "customer", customerNo);
  if (cached && (wanted === undefined || cached.applied === wanted)) return cached.result;
  const existing = cached?.result ?? (await findCustomerByNo(ctx, customerNo));
  if (existing) {
    if (wanted !== undefined) {
      const updated = await postCustomerSave(ctx, {
        id: existing.id,
        name: existing.name,
        transDate: await todayAccurateDate(),
        customerReceivableAccountListNo: createFields.customerReceivableAccountListNo,
      });
      lookupCacheSet(ctx, "customer", customerNo, { result: updated, applied: wanted });
      return updated;
    }
    lookupCacheSet(ctx, "customer", customerNo, { result: existing });
    return existing;
  }

  if (!createFields.name) {
    throw new Error(`Customer dengan nomor "${customerNo}" belum ada di Accurate, dan kolom "Nama Customer" kosong — wajib diisi untuk membuat customer baru.${oddCharsHint(customerNo)}`);
  }

  const created = await postCustomerSave(ctx, {
    customerNo,
    transDate: await todayAccurateDate(),
    categoryName: "Umum", // default, di-override kalau createFields punya categoryName sendiri
    ...createFields,
  });
  lookupCacheSet(ctx, "customer", customerNo, { result: created, ...(wanted !== undefined ? { applied: wanted } : {}) });
  return created;
}
