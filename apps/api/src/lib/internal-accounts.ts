import { and, count, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { dataUsaha, invoices, roles, subscriptions, user as userTable, userRoles } from "../db/schema";

// § Fase 189G, ADR-0044, architecture-internal-accounts.md — SATU sumber kebenaran "akun internal vs komersil". JANGAN baca `user.is_internal` langsung di
// laporan/guard lain: status EFEKTIF = flag `is_internal` (ditetapkan Super Admin; trainer/karyawan/mitra) ATAU memegang role `admin`/`staff` (D16, otomatis,
// tanpa flag manual). Komersil = akun role `customer` yang BUKAN internal — ditentukan status AKUN, bukan trial/langganan. Laporan uang (189C–E) WAJIB memakai
// `commercialCustomerIdsSubquery()` / `internalUserIdsSubquery()` dari sini.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

export const INTERNAL_ROLE_NAMES = ["admin", "staff"] as const;

/** "role" = internal karena role admin/staf (tidak bisa dicabut lewat flag); "flag" = ditandai Super Admin; null = komersil. Role mengalahkan flag. */
export type InternalReason = "role" | "flag" | null;

/** Murni (tanpa DB) — dipakai daftar admin yang sudah punya nama role tiap akun. */
export function deriveInternalReason(isInternalFlag: boolean, roleNames: readonly string[]): InternalReason {
  if (roleNames.some((r) => (INTERNAL_ROLE_NAMES as readonly string[]).includes(r))) return "role";
  return isInternalFlag ? "flag" : null;
}

function roleHolderIds() {
  return db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.name, [...INTERNAL_ROLE_NAMES]));
}

/** Subquery id akun internal efektif (flag ATAU role admin/staff). */
export function internalUserIdsSubquery() {
  return db.select({ id: userTable.id }).from(userTable).where(or(eq(userTable.isInternal, true), inArray(userTable.id, roleHolderIds())));
}

/** Subquery id SEMUA akun ber-role customer (komersil maupun internal) — daftar akun manusia pengguna produk (D12). */
export function customerUserIdsSubquery() {
  return db.select({ id: userRoles.userId }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(roles.name, "customer"));
}

/** Subquery id pelanggan KOMERSIL: role customer dan bukan internal. Dasar semua hitungan/laporan uang pengguna komersil. */
export function commercialCustomerIdsSubquery() {
  const customerIds = db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.name, "customer"));
  return db
    .select({ id: userTable.id })
    .from(userTable)
    .where(and(inArray(userTable.id, customerIds), notInArray(userTable.id, internalUserIdsSubquery())));
}

export async function getInternalReason(userId: string, executor: Executor = db, opts: { lockUser?: boolean } = {}): Promise<InternalReason> {
  // `lockUser`: kunci BERBAGI atas baris user selama transaksi pemanggil — penanda internal (`/admin/users/internal`) memakai FOR UPDATE pada baris yang sama,
  // jadi penandaan dan pembuatan invoice saling menunggu (tidak ada invoice lolos di celah antara cek dan commit). Di luar transaksi tidak berefek.
  const base = executor.select({ isInternal: userTable.isInternal }).from(userTable).where(eq(userTable.id, userId)).limit(1);
  const [row] = opts.lockUser ? await base.for("share") : await base;
  if (!row) return null;
  const roleRows = await executor
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), inArray(roles.name, [...INTERNAL_ROLE_NAMES])))
    .limit(1);
  return deriveInternalReason(row.isInternal, roleRows.map((r) => r.name));
}

/**
 * Dilempar guard pembuatan invoice saat penagih adalah akun internal. `status`/`toResponse()` membuat Elysia memetakannya ke 403 JSON sendiri (aman di aplikasi
 * tes tanpa `.onError`); `app.ts` `.onError` punya cabang eksplisit supaya tidak berakhir 500 + Sentry.
 */
export class InternalAccountBillingError extends Error {
  readonly status = 403;
  readonly code = "INTERNAL_ACCOUNT_NO_BILLING";
  constructor() {
    super("Akun internal tidak memerlukan langganan berbayar. Hubungi admin untuk akses.");
    this.name = "InternalAccountBillingError";
  }
  toBody() {
    return { code: this.code, message: this.message };
  }
  toResponse() {
    return Response.json(this.toBody(), { status: this.status });
  }
}

/** Guard: lempar `InternalAccountBillingError` bila `userId` internal. User yang tidak ada TIDAK melempar (FK invoice yang menolaknya). */
export async function assertBillable(executor: Executor, userId: string): Promise<void> {
  if (await getInternalReason(userId, executor, { lockUser: true })) throw new InternalAccountBillingError();
}

// Dampak perubahan status komersil↔internal pada akun `ids`: uang lunas yang akan keluar dari/masuk ke laporan, langganan berbayar aktif, tagihan perpanjangan
// terjadwal yang akan berhenti/berlanjut (penerima tagihan = pemilik Data Usaha, ADR-0042), dan invoice belum dibayar yang tertinggal (tidak dibatalkan otomatis).
export async function internalChangeImpact(ids: string[]) {
  if (ids.length === 0) return { paidInvoiceCount: 0, paidTotal: 0, unpaidInvoices: 0, activePaidSubscriptions: 0, scheduledRenewals: 0, activeInternalGrants: 0 };
  const [inv] = await db
    .select({
      paidInvoiceCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid')`,
      paidTotal: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.status} = 'paid'), 0)`,
      unpaidInvoices: sql<number>`count(*) filter (where ${invoices.status} = 'unpaid')`,
    })
    .from(invoices)
    .where(inArray(invoices.userId, ids));
  const [subs] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(and(inArray(subscriptions.userId, ids), eq(subscriptions.status, "active"), eq(subscriptions.isTrial, false)));
  const [renewals] = await db
    .select({ n: count() })
    .from(subscriptions)
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .where(and(inArray(dataUsaha.userId, ids), eq(subscriptions.status, "active"), eq(subscriptions.isTrial, false), isNotNull(subscriptions.renewalInterval)));
  return {
    paidInvoiceCount: Number(inv?.paidInvoiceCount ?? 0),
    paidTotal: Number(inv?.paidTotal ?? 0),
    unpaidInvoices: Number(inv?.unpaidInvoices ?? 0),
    activePaidSubscriptions: Number(subs?.n ?? 0),
    scheduledRenewals: Number(renewals?.n ?? 0),
    // § Fase 191 — hibah akses internal aktif (tanpa tanggal akhir) yang akan DICABUT bila akun kembali komersil
    activeInternalGrants: Number((await db.select({ n: count() }).from(subscriptions).where(and(inArray(subscriptions.userId, ids), eq(subscriptions.status, "active"), eq(subscriptions.internalGrant, true))))[0]?.n ?? 0),
  };
}
