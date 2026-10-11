import { Elysia } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { dataUsaha, invoices, orders, plans, roles, subscriptions, userRoles, user as userTable } from "../../db/schema";

// § Fase 189C — fixture BERSAMA tes Insight (DB dev dipakai bersama → semua data uji diberi prefiks unik per run dan diasersi lewat pelanggan uji / delta, bukan total global).
export const DAY = 24 * 60 * 60 * 1000;
export const runId = Date.now();
let seq = 0;
export const nextSeq = () => seq++;

export type AccountOpts = {
  roleName?: "customer" | "admin" | "staff";
  isInternal?: boolean;
  disabled?: boolean;
  name?: string;
  companyName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  createdAt?: Date;
};

/** Akun uji langsung ke DB (tanpa Better Auth — cepat). `tag` masuk email/nama agar bisa dicari lewat `q`. */
export async function insertAccount(tag: string, opts: AccountOpts = {}) {
  const id = `ins-${runId}-${nextSeq()}`;
  const created = opts.createdAt ?? new Date();
  await db.insert(userTable).values({
    id,
    name: opts.name ?? `Insight ${tag}`,
    email: `${id}-${tag}@test.local`,
    emailVerified: true,
    isInternal: opts.isInternal ?? false,
    disabled: opts.disabled ?? false,
    companyName: opts.companyName === undefined ? `PT ${tag}` : opts.companyName,
    phone: opts.phone === undefined ? "+628111111111" : opts.phone,
    whatsapp: opts.whatsapp === undefined ? "+628111111111" : opts.whatsapp,
    createdAt: created,
    updatedAt: created,
  });
  const roleName = opts.roleName ?? "customer";
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: id, roleId: role!.id });
  return { id, email: `${id}-${tag}@test.local` };
}

export async function insertDataUsaha(ownerId: string, name: string, opts: { connected?: boolean } = {}) {
  const [row] = await db.insert(dataUsaha).values({ userId: ownerId, name }).returning();
  void opts;
  return row!.id;
}

export async function insertPlan(moduleKey: string | null, opts: { price?: number; interval?: "monthly" | "yearly"; kind?: "module" | "seat_addon" } = {}) {
  const [plan] = await db
    .insert(plans)
    .values({
      name: `Insight Plan ${moduleKey ?? "seat"} ${runId}-${nextSeq()}`,
      price: opts.price ?? 100_000,
      durationDays: opts.interval === "yearly" ? 365 : 30,
      interval: opts.interval ?? "monthly",
      modules: moduleKey ? [moduleKey] : [],
      kind: opts.kind ?? "module",
    })
    .returning();
  return plan!;
}

export async function insertSub(p: {
  ownerId: string;
  dataUsahaId: string;
  planId: string;
  start: Date;
  end: Date | null;
  status?: string;
  isTrial?: boolean;
  renewalInterval?: "monthly" | "yearly" | null;
  buyerId?: string;
}) {
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId: p.buyerId ?? p.ownerId,
      planId: p.planId,
      status: p.status ?? "active",
      startAt: p.start,
      endAt: p.end,
      dataUsahaId: p.dataUsahaId,
      isTrial: p.isTrial ?? false,
      renewalInterval: p.renewalInterval ?? null,
    })
    .returning();
  return sub!;
}

/** Invoice LUNAS + order (metode: bank_transfer/qris = terverifikasi; manual = dilunasi admin). */
export async function insertPaidInvoice(userId: string, total: number, opts: { method?: "bank_transfer" | "qris" | "manual"; paidAt?: Date; status?: "paid" | "unpaid" | "void" } = {}) {
  const paidAt = opts.paidAt ?? new Date();
  const status = opts.status ?? "paid";
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: `INV/INS/${runId}/${nextSeq()}`,
      userId,
      status,
      billToName: "Insight",
      subtotal: total,
      total,
      dueDate: new Date(paidAt.getTime() + DAY),
      paidAt: status === "paid" ? paidAt : null,
    })
    .returning();
  await db.insert(orders).values({ invoiceId: invoice!.id, status: status === "paid" ? "paid" : "pending", method: opts.method ?? "bank_transfer" });
  return invoice!;
}

// ---- Better Auth: hanya untuk cookie admin/staf/customer yang memanggil API ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipe prefix Elysia bersifat generik; fungsi ini hanya membungkus untuk tes
export function makeTestApp(route: Elysia<any, any, any, any, any, any, any>) {
  return new Elysia().mount(auth.handler).use(route);
}
export async function loginAs(app: Elysia, roleName: "admin" | "staff" | "customer", label = roleName) {
  const email = `ins-login-${label}-${runId}-${nextSeq()}@test.local`;
  const res = await app.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Insight ${label}` }) }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  const signIn = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  return { id: user.id, cookie: signIn.headers.get("set-cookie") ?? "" };
}

export const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi));
export { inArray };
