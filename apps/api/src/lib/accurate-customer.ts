import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { todayAccurateDate } from "./accurate-vendor";

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
    const params = new URLSearchParams({ "filter.no.val": customerNo, fields: "id,customerNo,name" });
    const res = await fetch(`${ctx.host}/accurate/api/customer/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    const list = await parseAccurateEnvelope<{ id: number; name: string }[]>(res);
    return list[0];
  });
}

async function postCustomerSave(ctx: AccurateSessionContext, payload: Record<string, unknown>) {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/customer/save.do`, {
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
  const existing = await findCustomerByNo(ctx, customerNo);
  if (existing) {
    if (createFields.customerReceivableAccountListNo) {
      return postCustomerSave(ctx, {
        id: existing.id,
        name: existing.name,
        transDate: todayAccurateDate(),
        customerReceivableAccountListNo: createFields.customerReceivableAccountListNo,
      });
    }
    return existing;
  }

  if (!createFields.name) {
    throw new Error(`Customer dengan nomor "${customerNo}" belum ada di Accurate, dan kolom "Nama Customer" kosong — wajib diisi untuk membuat customer baru`);
  }

  return postCustomerSave(ctx, {
    customerNo,
    transDate: todayAccurateDate(),
    categoryName: "Umum", // default, di-override kalau createFields punya categoryName sendiri
    ...createFields,
  });
}
