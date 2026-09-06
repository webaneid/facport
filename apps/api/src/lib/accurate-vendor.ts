import { parseAccurateEnvelope, parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";
import { getCompanyTimezone } from "./company-timezone";

export type VendorPayableAccountResult = {
  id: number;
  name: string;
};

// § architecture-accurate-integration.md § "Vendor (Data Master)" —
// vendor/list.do TIDAK balikin vendorNo/name di response ringkas default,
// WAJIB minta eksplisit lewat `fields` + filter pakai `filter.no.val`
// (TERVERIFIKASI 2026-08-20 via test call nyata).
export async function findVendorByNo(
  ctx: AccurateSessionContext,
  vendorNo: string,
): Promise<{ id: number; name: string } | undefined> {
  return withAccurateRateLimit(async () => {
    const params = new URLSearchParams({ "filter.no.val": vendorNo, fields: "id,vendorNo,name" });
    const res = await fetch(`${ctx.host}/accurate/api/vendor/list.do?${params}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "X-Session-ID": ctx.session },
    });
    const list = await parseAccurateEnvelope<{ id: number; name: string }[]>(res);
    return list[0];
  });
}

// § BUG ditemukan 2026-09-06 (audit timezone menyeluruh, diminta user) —
// versi lama pakai `now.getDate()`/`getMonth()`/`getFullYear()`, SEMUANYA
// menggunakan timezone LOKAL PROSES SERVER, bukan timezone PERUSAHAAN.
// Di production (container `postgres:16-alpine`/`oven/bun` TANPA `TZ` di-
// set eksplisit, default OS timezone-nya UTC), jam 00:00–06:59 WIB (=
// 17:00–23:59 UTC hari SEBELUMNYA) bikin `transDate` vendor/customer
// auto-create TERCATAT SALAH 1 HARI di pembukuan Accurate customer —
// setiap hari, tanpa terkecuali, selama jendela 7 jam itu. Fix: pakai
// `Intl.DateTimeFormat` dengan `timeZone` eksplisit dari `company.timezone`
// (§ lib/company-timezone.ts) — BUKAN UTC, BUKAN local server time.
export async function todayAccurateDate(now: Date = new Date()): Promise<string> {
  const timezone = await getCompanyTimezone();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

async function postVendorSave(ctx: AccurateSessionContext, payload: Record<string, unknown>) {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/vendor/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<VendorPayableAccountResult>(res);
  });
}

// § architecture-accurate-integration.md § "Vendor (Data Master)" —
// `vendor/save.do` WAJIB `id` internal Accurate (bukan `vendorNo` saja)
// untuk update vendor existing, dan WAJIB `name`+`transDate` walau cuma
// mau ubah `vendorPayableAccountListNo` (dikonfirmasi dari test call
// client & Support Accurate — schema resmi menandai keduanya required).
export async function saveVendorPayableAccount(
  ctx: AccurateSessionContext,
  payload: { vendorNo: string; payableAccountNo: string },
): Promise<VendorPayableAccountResult> {
  const vendor = await findVendorByNo(ctx, payload.vendorNo);
  if (!vendor) {
    throw new Error(`Pemasok dengan nomor "${payload.vendorNo}" tidak ditemukan di Accurate`);
  }
  return postVendorSave(ctx, {
    id: vendor.id,
    name: vendor.name,
    transDate: await todayAccurateDate(),
    vendorPayableAccountListNo: payload.payableAccountNo,
  });
}

// § phase-05-purchase-invoice-auto-create.md — TERVERIFIKASI 2026-08-20
// via test call nyata (vendor "CV Sumber Makmur" + kontak WhatsApp +
// akun hutang, semua kesimpan benar sekaligus). Dipanggil SEBELUM
// `savePurchaseInvoice` kalau vendor di Excel belum ada di Accurate.
//
// § revisi 2026-08-22 (keputusan eksplisit user): `vendorPayableAccountListNo`
// (Akun Hutang) SEKARANG boleh update vendor yang SUDAH ADA juga, TIDAK
// cuma saat CREATE — beda dari field opsional lain (nama, kategori,
// telepon, email, WA, alamat, negara) yang TETAP create-only (hindari
// resiko tidak sengaja menimpa data vendor existing yang sudah benar,
// cuma karena kolomnya kebetulan terisi di Excel). Akun Hutang dianggap
// aman untuk kasus ini karena settingnya idempotent & memang tujuan
// eksplisit user mengisi kolom itu — beda dari field identitas vendor.
export async function findOrCreateVendor(
  ctx: AccurateSessionContext,
  vendorNo: string,
  createFields: Record<string, unknown>,
): Promise<{ id: number; name: string }> {
  const existing = await findVendorByNo(ctx, vendorNo);
  if (existing) {
    if (createFields.vendorPayableAccountListNo) {
      return postVendorSave(ctx, {
        id: existing.id,
        name: existing.name,
        transDate: await todayAccurateDate(),
        vendorPayableAccountListNo: createFields.vendorPayableAccountListNo,
      });
    }
    return existing;
  }

  if (!createFields.name) {
    throw new Error(
      `Pemasok dengan nomor "${vendorNo}" belum ada di Accurate, dan kolom "Nama Vendor" kosong — wajib diisi untuk membuat vendor baru`,
    );
  }

  return postVendorSave(ctx, {
    vendorNo,
    transDate: await todayAccurateDate(),
    categoryName: "Umum", // default, di-override kalau createFields punya categoryName sendiri
    ...createFields,
  });
}
