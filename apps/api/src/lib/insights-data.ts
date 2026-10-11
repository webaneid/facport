import { and, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auditLogs, dataUsaha, invoices, memberSeats, orders, plans, roles, subscriptions, user as userTable, userRoles } from "../db/schema";
import { commercialCustomerIdsSubquery, customerUserIdsSubquery, deriveInternalReason, internalUserIdsSubquery } from "./internal-accounts";
import { activeOwnersInMonth, addMonths, buildTrend, firstStartByOwner, monthBounds, monthKey, monthOf, tenureBreakdown, type CountedSubscription, type MonthRef, type TrendPoint } from "./admin-insights";
import { MODULE_CATALOG, moduleLabel } from "./module-catalog";
import { openRenewalOrdersBySubscription } from "./renewal-billing";

// § Fase 189C — lapisan DATA API Insight: query mentah (tanpa rumus). Rumus ada di `lib/admin-insights.ts` (murni). Definisi baku — phase-189c-api-insight.md:
// pelanggan = akun PEMILIK Data Usaha SAAT INI (`data_usaha.user_id`); langganan yang dihitung = modul, bukan trial/seat, status active/expired, sudah dimulai; semua tren/uang
// hanya akun KOMERSIL (`commercialCustomerIdsSubquery`).

/** Kondisi "langganan yang dihitung" (butuh join `plans`). */
export const COUNTED_SUBSCRIPTION = and(
  eq(plans.kind, "module"),
  eq(subscriptions.isTrial, false),
  isNotNull(subscriptions.startAt),
  inArray(subscriptions.status, ["active", "expired"]),
);

/** Langganan yang dihitung DAN sedang berjalan pada `now`. */
export function activeNow(now: Date): SQL {
  return and(
    eq(subscriptions.status, "active"),
    lte(subscriptions.startAt, now),
    or(isNull(subscriptions.endAt), gt(subscriptions.endAt, now)),
  )!;
}

/** Pola LIKE dari input pengguna: wildcard `% _ \` dinetralkan (input = teks biasa, bukan pola). */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- uang ----------
// Tanpa join ke `orders` (konvensi 1 invoice = 1 order tidak dijaga constraint): "dilunasi admin" = ada order metode `manual` (mode paid_invoice); selain itu terverifikasi.
const isAdminSettled = sql`exists (select 1 from ${orders} where ${orders.invoiceId} = ${invoices.id} and ${orders.method} = 'manual')`;

export type MoneySplit = { verified: number; adminSettled: number; total: number };

export async function moneyBetween(start: Date, end: Date): Promise<MoneySplit> {
  const [row] = await db
    .select({
      verified: sql<string>`coalesce(sum(${invoices.total}) filter (where not ${isAdminSettled}), 0)`,
      adminSettled: sql<string>`coalesce(sum(${invoices.total}) filter (where ${isAdminSettled}), 0)`,
    })
    .from(invoices)
    .where(and(eq(invoices.status, "paid"), isNotNull(invoices.paidAt), gte(invoices.paidAt, start), lt(invoices.paidAt, end), inArray(invoices.userId, commercialCustomerIdsSubquery())));
  const verified = Number(row?.verified ?? 0);
  const adminSettled = Number(row?.adminSettled ?? 0);
  return { verified, adminSettled, total: verified + adminSettled };
}

/** Faktur lunas KOMERSIL dalam rentang [start, end): tanggal bayar, jumlah, dan apakah dilunasi admin — dasar tren uang bulanan. */
export async function paidInvoiceRows(start: Date, end: Date): Promise<{ paidAt: Date; total: number; adminSettled: boolean }[]> {
  const rows = await db
    .select({ paidAt: invoices.paidAt, total: invoices.total, adminSettled: sql<boolean>`${isAdminSettled}` })
    .from(invoices)
    .where(and(eq(invoices.status, "paid"), isNotNull(invoices.paidAt), gte(invoices.paidAt, start), lt(invoices.paidAt, end), inArray(invoices.userId, commercialCustomerIdsSubquery())));
  return rows.map((r) => ({ paidAt: r.paidAt!, total: r.total, adminSettled: !!r.adminSettled }));
}

// ---------- langganan ----------
/** Semua langganan yang DIHITUNG milik pemilik KOMERSIL (pemilik = `data_usaha.user_id` saat ini). Basis tren aktif/baru/berhenti dan usia langganan. */
export async function fetchCountedSubscriptions(): Promise<CountedSubscription[]> {
  const rows = await db
    .select({ ownerId: dataUsaha.userId, startAt: subscriptions.startAt, endAt: subscriptions.endAt })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .where(and(COUNTED_SUBSCRIPTION, inArray(dataUsaha.userId, commercialCustomerIdsSubquery())));
  return rows.map((r) => ({ ownerId: r.ownerId, startAt: r.startAt!, endAt: r.endAt }));
}

// ---------- ringkasan ----------
// `accounts.disabled` adalah HIMPUNAN BAGIAN akun customer (komersil maupun internal) yang dinonaktifkan — bukan kategori terpisah dari `commercial`/`internal`.
export async function getSummary(now: Date, timeZone: string) {
  const customers = customerUserIdsSubquery();
  const [commercial, internal, disabled, duRows, activeRows, exp14, exp30] = await Promise.all([
    db.select({ n: count() }).from(userTable).where(inArray(userTable.id, commercialCustomerIdsSubquery())),
    db.select({ n: count() }).from(userTable).where(and(inArray(userTable.id, customers), inArray(userTable.id, internalUserIdsSubquery()))),
    db.select({ n: count() }).from(userTable).where(and(inArray(userTable.id, customers), eq(userTable.disabled, true))),
    db.select({ total: count(), connected: sql<number>`count(${dataUsaha.accurateConnectionId})` }).from(dataUsaha),
    db
      .select({ owners: sql<number>`count(distinct ${dataUsaha.userId})`, features: count() })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
      .where(and(COUNTED_SUBSCRIPTION, activeNow(now), inArray(dataUsaha.userId, commercialCustomerIdsSubquery()))),
    expiringCounts(now, 14),
    expiringCounts(now, 30),
  ]);

  const month = monthBounds(monthOf(now, timeZone), timeZone);
  const yearStart = monthBounds({ year: monthOf(now, timeZone).year, month: 1 }, timeZone).start;
  const yearEnd = monthBounds({ year: monthOf(now, timeZone).year, month: 12 }, timeZone).end;
  const [thisMonth, thisYear] = await Promise.all([moneyBetween(month.start, month.end), moneyBetween(yearStart, yearEnd)]);

  return {
    accounts: { commercial: commercial[0]?.n ?? 0, internal: internal[0]?.n ?? 0, disabled: disabled[0]?.n ?? 0 },
    dataUsaha: { total: duRows[0]?.total ?? 0, connected: Number(duRows[0]?.connected ?? 0) },
    customers: { active: Number(activeRows[0]?.owners ?? 0), activeFeatures: activeRows[0]?.features ?? 0 },
    expiring: { owners14: exp14.owners, subscriptions14: exp14.subscriptions, owners30: exp30.owners, subscriptions30: exp30.subscriptions },
    money: { thisMonth, thisYear },
  };
}

async function expiringCounts(now: Date, windowDays: number) {
  const [row] = await db
    .select({ owners: sql<number>`count(distinct ${dataUsaha.userId})`, subscriptions: count() })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .where(
      and(
        COUNTED_SUBSCRIPTION,
        activeNow(now),
        isNotNull(subscriptions.endAt),
        lte(subscriptions.endAt, new Date(now.getTime() + windowDays * DAY_MS)),
        inArray(dataUsaha.userId, commercialCustomerIdsSubquery()),
      ),
    );
  return { owners: Number(row?.owners ?? 0), subscriptions: row?.subscriptions ?? 0 };
}

// ---------- daftar akun ----------
export type CustomerType = "all" | "commercial" | "internal";

export async function listCustomers(p: { q?: string; type: CustomerType; page: number; pageSize: number; now: Date }) {
  const q = p.q?.trim();
  const search = q ? or(ilike(userTable.name, likePattern(q)), ilike(userTable.email, likePattern(q)), ilike(userTable.companyName, likePattern(q))) : undefined;
  const typeCondition =
    p.type === "internal"
      ? and(inArray(userTable.id, customerUserIdsSubquery()), inArray(userTable.id, internalUserIdsSubquery()))
      : p.type === "commercial"
        ? inArray(userTable.id, commercialCustomerIdsSubquery())
        : inArray(userTable.id, customerUserIdsSubquery());
  const where = and(typeCondition, search);

  const [rows, totalRows] = await Promise.all([
    db.select().from(userTable).where(where).orderBy(desc(userTable.createdAt), userTable.id).limit(p.pageSize).offset(p.page * p.pageSize),
    db.select({ n: count() }).from(userTable).where(where),
  ]);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { items: [], total: totalRows[0]?.n ?? 0, page: p.page, pageSize: p.pageSize };

  const [roleRows, duRows, featureRows, seatRows] = await Promise.all([
    db.select({ userId: userRoles.userId, name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(inArray(userRoles.userId, ids)),
    db
      .select({ userId: dataUsaha.userId, total: count(), connected: sql<number>`count(${dataUsaha.accurateConnectionId})` })
      .from(dataUsaha)
      .where(inArray(dataUsaha.userId, ids))
      .groupBy(dataUsaha.userId),
    db
      .select({ ownerId: dataUsaha.userId, moduleKey: sql<string>`${plans.modules}->>0`, endAt: subscriptions.endAt })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
      .where(and(COUNTED_SUBSCRIPTION, activeNow(p.now), inArray(dataUsaha.userId, ids))),
    db
      .select({ memberUserId: memberSeats.memberUserId, n: count() })
      .from(memberSeats)
      .where(and(eq(memberSeats.status, "active"), inArray(memberSeats.memberUserId, ids)))
      .groupBy(memberSeats.memberUserId),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.name]);
  const duByUser = new Map(duRows.map((r) => [r.userId, { total: r.total, connected: Number(r.connected) }]));
  const seatsByUser = new Map(seatRows.map((r) => [r.memberUserId!, r.n]));
  const featuresByUser = new Map<string, { keys: Set<string>; nearestEnd: Date | null }>();
  for (const f of featureRows) {
    const entry = featuresByUser.get(f.ownerId) ?? { keys: new Set<string>(), nearestEnd: null };
    if (f.moduleKey) entry.keys.add(f.moduleKey);
    if (f.endAt && (!entry.nearestEnd || f.endAt.getTime() < entry.nearestEnd.getTime())) entry.nearestEnd = f.endAt;
    featuresByUser.set(f.ownerId, entry);
  }

  const items = rows.map((u) => {
    const owned = duByUser.get(u.id)?.total ?? 0;
    const feature = featuresByUser.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      disabled: u.disabled,
      companyName: u.companyName,
      phone: u.phone,
      whatsapp: u.whatsapp,
      internalReason: deriveInternalReason(u.isInternal, rolesByUser.get(u.id) ?? []),
      kind: owned > 0 ? ("pemilik" as const) : (seatsByUser.get(u.id) ?? 0) > 0 ? ("tambahan" as const) : ("belum" as const),
      ownedDataUsaha: owned,
      connectedDataUsaha: duByUser.get(u.id)?.connected ?? 0,
      activeFeatures: [...(feature?.keys ?? [])].sort(),
      nearestEndAt: feature?.nearestEnd ?? null,
      createdAt: u.createdAt,
    };
  });
  return { items, total: totalRows[0]?.n ?? 0, page: p.page, pageSize: p.pageSize };
}

// ---------- pemilik (kontak) ----------
export type OwnerContact = { id: string; name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null };
const ownerColumns = { id: userTable.id, name: userTable.name, email: userTable.email, companyName: userTable.companyName, phone: userTable.phone, whatsapp: userTable.whatsapp };
const moduleKeyOf = sql<string>`${plans.modules}->>0`;

// ---------- pengguna per fitur ----------
export async function listFeatures(now: Date) {
  const rows = await db
    .select({
      moduleKey: moduleKeyOf,
      dataUsaha: sql<number>`count(distinct ${dataUsaha.id})`,
      customers: sql<number>`count(distinct ${dataUsaha.userId})`,
      subscriptions: count(),
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .where(and(COUNTED_SUBSCRIPTION, activeNow(now), inArray(dataUsaha.userId, commercialCustomerIdsSubquery())))
    .groupBy(moduleKeyOf);
  return rows
    .filter((r) => !!r.moduleKey)
    .map((r) => ({ moduleKey: r.moduleKey, label: moduleLabel(r.moduleKey), dataUsaha: Number(r.dataUsaha), customers: Number(r.customers), subscriptions: r.subscriptions }))
    .sort((a, b) => b.customers - a.customers || a.label.localeCompare(b.label));
}

export const isKnownModule = (key: string): boolean => MODULE_CATALOG.some((m) => m.key === key);

export async function listFeatureCustomers(p: { moduleKey: string; now: Date; page: number; pageSize: number }) {
  const where = and(COUNTED_SUBSCRIPTION, activeNow(p.now), sql`${moduleKeyOf} = ${p.moduleKey}`, inArray(dataUsaha.userId, commercialCustomerIdsSubquery()));
  const base = db
    .select({
      owner: ownerColumns,
      dataUsahaId: dataUsaha.id,
      dataUsahaName: dataUsaha.name,
      planName: plans.name,
      startAt: subscriptions.startAt,
      endAt: subscriptions.endAt,
      renewalInterval: subscriptions.renewalInterval,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
    .where(where);
  const [items, totalRows] = await Promise.all([
    base.orderBy(asc(userTable.name), asc(subscriptions.endAt), asc(subscriptions.id)).limit(p.pageSize).offset(p.page * p.pageSize),
    db
      .select({ n: count() })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
      .where(where),
  ]);
  return { moduleKey: p.moduleKey, label: moduleLabel(p.moduleKey), items, total: totalRows[0]?.n ?? 0, page: p.page, pageSize: p.pageSize };
}

// ---------- pelanggan / langganan baru ----------
export async function listNewSubscriptions(p: { start: Date; endExclusive: Date; page: number; pageSize: number }) {
  const rows = await db
    .select({
      owner: ownerColumns,
      moduleKey: moduleKeyOf,
      dataUsahaName: dataUsaha.name,
      startAt: subscriptions.startAt,
      endAt: subscriptions.endAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
    .where(and(COUNTED_SUBSCRIPTION, gte(subscriptions.startAt, p.start), lt(subscriptions.startAt, p.endExclusive), inArray(dataUsaha.userId, commercialCustomerIdsSubquery())))
    .orderBy(asc(subscriptions.startAt));

  // awal pertama SEPANJANG WAKTU per pemilik (D13) → pelanggan baru = awal pertamanya jatuh di rentang ini
  const ownerIds = [...new Set(rows.map((r) => r.owner.id))];
  const firsts = ownerIds.length
    ? await db
        .select({ ownerId: dataUsaha.userId, first: sql<Date>`min(${subscriptions.startAt})` })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
        .where(and(COUNTED_SUBSCRIPTION, inArray(dataUsaha.userId, ownerIds)))
        .groupBy(dataUsaha.userId)
    : [];
  const firstByOwner = new Map(firsts.map((f) => [f.ownerId, new Date(f.first)]));

  const grouped = new Map<string, { owner: OwnerContact; firstStartAt: Date; features: { moduleKey: string; label: string; dataUsahaName: string; startAt: Date; endAt: Date | null }[] }>();
  for (const r of rows) {
    const entry = grouped.get(r.owner.id) ?? { owner: r.owner, firstStartAt: r.startAt!, features: [] };
    entry.features.push({ moduleKey: r.moduleKey, label: moduleLabel(r.moduleKey), dataUsahaName: r.dataUsahaName, startAt: r.startAt!, endAt: r.endAt });
    grouped.set(r.owner.id, entry);
  }
  const all = [...grouped.values()]
    .map((g) => {
      const global = firstByOwner.get(g.owner.id);
      return { ...g, isNewCustomer: !!global && global.getTime() >= p.start.getTime() && global.getTime() < p.endExclusive.getTime() };
    })
    .sort((a, b) => b.firstStartAt.getTime() - a.firstStartAt.getTime());
  return {
    summary: { customers: all.length, newCustomers: all.filter((g) => g.isNewCustomer).length, subscriptions: rows.length },
    items: all.slice(p.page * p.pageSize, (p.page + 1) * p.pageSize),
    total: all.length,
    page: p.page,
    pageSize: p.pageSize,
  };
}

// ---------- akan berakhir ----------
export type RenewalState = { status: "terbit" | "terjadwal" | "tidak_terjadwal"; interval?: string; invoiceNumber?: string; amountDue?: number };

export async function listExpiring(p: { now: Date; windowDays: 14 | 30; page: number; pageSize: number }) {
  const rows = await db
    .select({
      id: subscriptions.id,
      owner: ownerColumns,
      moduleKey: moduleKeyOf,
      dataUsahaId: dataUsaha.id,
      dataUsahaName: dataUsaha.name,
      endAt: subscriptions.endAt,
      renewalInterval: subscriptions.renewalInterval,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
    .where(
      and(
        COUNTED_SUBSCRIPTION,
        activeNow(p.now),
        isNotNull(subscriptions.endAt),
        lte(subscriptions.endAt, new Date(p.now.getTime() + p.windowDays * DAY_MS)),
        inArray(dataUsaha.userId, commercialCustomerIdsSubquery()),
      ),
    )
    .orderBy(asc(subscriptions.endAt), asc(subscriptions.id));

  const openOrders = await openRenewalOrdersBySubscription(rows.map((r) => ({ id: r.id, dataUsahaId: r.dataUsahaId, moduleKey: r.moduleKey })));
  const grouped = new Map<string, { owner: OwnerContact; nearestEndAt: Date; subscriptions: { id: string; moduleKey: string; label: string; dataUsahaId: string; dataUsahaName: string; endAt: Date; daysLeft: number; renewal: RenewalState }[] }>();
  for (const r of rows) {
    const open = openOrders.get(r.id);
    const renewal: RenewalState = open
      ? { status: "terbit", invoiceNumber: open.invoiceNumber, amountDue: open.amountDue }
      : r.renewalInterval
        ? { status: "terjadwal", interval: r.renewalInterval }
        : { status: "tidak_terjadwal" };
    const entry = grouped.get(r.owner.id) ?? { owner: r.owner, nearestEndAt: r.endAt!, subscriptions: [] };
    entry.subscriptions.push({
      id: r.id,
      moduleKey: r.moduleKey,
      label: moduleLabel(r.moduleKey),
      dataUsahaId: r.dataUsahaId,
      dataUsahaName: r.dataUsahaName,
      endAt: r.endAt!,
      daysLeft: Math.max(0, Math.ceil((r.endAt!.getTime() - p.now.getTime()) / DAY_MS)),
      renewal,
    });
    grouped.set(r.owner.id, entry);
  }
  const all = [...grouped.values()]; // urutan kemunculan = pemilik dengan akhir terdekat dulu
  return {
    window: p.windowDays,
    summary: { owners: all.length, subscriptions: rows.length },
    items: all.slice(p.page * p.pageSize, (p.page + 1) * p.pageSize),
    total: all.length,
    page: p.page,
    pageSize: p.pageSize,
  };
}

// ---------- tren bulanan ----------
export type TrendMetric = "registered" | "active" | "new" | "stopped" | "money";

async function commercialAccountCreatedAts(start: Date, end: Date): Promise<Date[]> {
  const rows = await db.select({ createdAt: userTable.createdAt }).from(userTable).where(and(inArray(userTable.id, commercialCustomerIdsSubquery()), gte(userTable.createdAt, start), lt(userTable.createdAt, end)));
  return rows.map((r) => r.createdAt);
}

async function commercialAccountsBefore(before: Date): Promise<number> {
  const [row] = await db.select({ n: count() }).from(userTable).where(and(inArray(userTable.id, commercialCustomerIdsSubquery()), lt(userTable.createdAt, before)));
  return row?.n ?? 0;
}

const tally = (items: Date[], timeZone: string): Map<string, number> => {
  const byMonth = new Map<string, number>();
  for (const d of items) byMonth.set(monthKey(monthOf(d, timeZone)), (byMonth.get(monthKey(monthOf(d, timeZone))) ?? 0) + 1);
  return byMonth;
};

/** Tren 12 bulan untuk SATU tahun (zona waktu perusahaan). `summary.kind`: "stock" (aktif: nilai terakhir) atau "flow" (jumlah bulan-bulan yang sudah berjalan). */
export async function getTrend(p: { year: number; metric: TrendMetric; now: Date; timeZone: string }) {
  const nowMonth = monthOf(p.now, p.timeZone);
  const rangeStart = monthBounds({ year: p.year - 1, month: 12 }, p.timeZone).start; // Desember tahun lalu = pembanding Januari
  const rangeEnd = monthBounds({ year: p.year, month: 12 }, p.timeZone).end;
  const flowSum = (points: TrendPoint[]) => points.reduce((sum, pt) => sum + (pt.value ?? 0), 0);

  if (p.metric === "active" || p.metric === "new" || p.metric === "stopped") {
    const subs = await fetchCountedSubscriptions();
    const activeCache = new Map<string, Set<string>>();
    const activeOf = (ref: MonthRef) => {
      const key = monthKey(ref);
      if (!activeCache.has(key)) activeCache.set(key, activeOwnersInMonth(subs, monthBounds(ref, p.timeZone)));
      return activeCache.get(key)!;
    };
    let valueOf: (ref: MonthRef) => number;
    if (p.metric === "active") valueOf = (ref) => activeOf(ref).size;
    else if (p.metric === "new") {
      const newByMonth = tally([...firstStartByOwner(subs).values()], p.timeZone);
      valueOf = (ref) => newByMonth.get(monthKey(ref)) ?? 0;
    } else {
      valueOf = (ref) => {
        const current = activeOf(ref);
        let stopped = 0;
        for (const owner of activeOf(addMonths(ref, -1))) if (!current.has(owner)) stopped += 1;
        return stopped;
      };
    }
    const points = buildTrend(p.year, valueOf, nowMonth);
    const stock = p.metric === "active";
    const last = [...points].reverse().find((pt) => !pt.future);
    return { year: p.year, metric: p.metric, points, summary: { kind: stock ? ("stock" as const) : ("flow" as const), value: stock ? (last?.value ?? 0) : flowSum(points) } };
  }

  if (p.metric === "registered") {
    const [createdAts, baseline] = await Promise.all([commercialAccountCreatedAts(rangeStart, rangeEnd), commercialAccountsBefore(monthBounds({ year: p.year, month: 1 }, p.timeZone).start)]);
    const byMonth = tally(createdAts, p.timeZone);
    const points = buildTrend(p.year, (ref) => byMonth.get(monthKey(ref)) ?? 0, nowMonth);
    let running = baseline;
    const cumulative = points.map((pt) => (pt.future ? null : (running += pt.value ?? 0)));
    return { year: p.year, metric: p.metric, points, cumulative, summary: { kind: "flow" as const, value: flowSum(points) } };
  }

  // money
  const rows = await paidInvoiceRows(rangeStart, rangeEnd);
  const sum = (filter: (r: (typeof rows)[number]) => boolean) => {
    const byMonth = new Map<string, number>();
    for (const r of rows) if (filter(r)) byMonth.set(monthKey(monthOf(r.paidAt, p.timeZone)), (byMonth.get(monthKey(monthOf(r.paidAt, p.timeZone))) ?? 0) + r.total);
    return (ref: MonthRef) => byMonth.get(monthKey(ref)) ?? 0;
  };
  const points = buildTrend(p.year, sum(() => true), nowMonth);
  return {
    year: p.year,
    metric: p.metric,
    points,
    parts: { verified: buildTrend(p.year, sum((r) => !r.adminSettled), nowMonth), adminSettled: buildTrend(p.year, sum((r) => r.adminSettled), nowMonth) },
    summary: { kind: "flow" as const, value: flowSum(points) },
  };
}

// ---------- usia langganan ----------
export async function getTenure(month: MonthRef, timeZone: string) {
  const breakdown = tenureBreakdown(await fetchCountedSubscriptions(), month, timeZone);
  const byYear = Object.entries(breakdown.byYear)
    .map(([year, n]) => ({ year: Number(year), count: n }))
    .sort((a, b) => a.year - b.year);
  return { month: monthKey(month), aktif: breakdown.aktif, baru: breakdown.baru, lanjutanTahun1: breakdown.lanjutanTahun1, byYear, berhenti: breakdown.berhenti, kembali: breakdown.kembali };
}

// ---------- riwayat koneksi lintas pelanggan ----------
export const CONNECTION_EVENT_ACTIONS = ["connect_accurate", "select_database", "confirm_database", "reset_database", "disconnect_accurate"];
/** Koreksi = pelanggan memperbaiki sendiri ("Pilih yang Lain") atau admin memutus koneksi — indikator "salah koneksi" (butir 9). */
export const CORRECTION_ACTIONS = ["reset_database", "disconnect_accurate"];

export async function getConnectionHistory(p: { q?: string; kind: "all" | "koreksi"; range?: { start: Date; endExclusive: Date }; page: number; pageSize: number }) {
  const owner = userTable;
  const actor = alias(userTable, "actor");
  const q = p.q?.trim();
  // audit_logs.entity_id bertipe teks, data_usaha.id uuid → cocokkan sebagai teks
  const joinDu = sql`${dataUsaha.id}::text = ${auditLogs.entityId}`;
  const base = and(
    eq(auditLogs.entityType, "data_usaha"),
    inArray(auditLogs.action, CONNECTION_EVENT_ACTIONS),
    p.range ? gte(auditLogs.createdAt, p.range.start) : undefined,
    p.range ? lt(auditLogs.createdAt, p.range.endExclusive) : undefined,
    inArray(dataUsaha.userId, commercialCustomerIdsSubquery()),
    q ? or(ilike(dataUsaha.name, likePattern(q)), ilike(owner.name, likePattern(q)), ilike(owner.email, likePattern(q)), ilike(owner.companyName, likePattern(q))) : undefined,
  );
  const filtered = and(base, p.kind === "koreksi" ? inArray(auditLogs.action, CORRECTION_ACTIONS) : undefined);

  const [items, totalRows, byActionRows, correctionRows] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        changes: auditLogs.changes,
        createdAt: auditLogs.createdAt,
        actor: { id: actor.id, name: actor.name },
        dataUsaha: { id: dataUsaha.id, name: dataUsaha.name },
        owner: { id: owner.id, name: owner.name, email: owner.email, companyName: owner.companyName, phone: owner.phone, whatsapp: owner.whatsapp },
      })
      .from(auditLogs)
      .innerJoin(dataUsaha, joinDu)
      .innerJoin(owner, eq(owner.id, dataUsaha.userId))
      .leftJoin(actor, eq(actor.id, auditLogs.actorId))
      .where(filtered)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(p.pageSize)
      .offset(p.page * p.pageSize),
    db.select({ n: count() }).from(auditLogs).innerJoin(dataUsaha, joinDu).innerJoin(owner, eq(owner.id, dataUsaha.userId)).where(filtered),
    db.select({ action: auditLogs.action, n: count() }).from(auditLogs).innerJoin(dataUsaha, joinDu).innerJoin(owner, eq(owner.id, dataUsaha.userId)).where(base).groupBy(auditLogs.action),
    db
      .select({ dataUsahaId: auditLogs.entityId, ownerId: dataUsaha.userId, n: count() })
      .from(auditLogs)
      .innerJoin(dataUsaha, joinDu)
      .innerJoin(owner, eq(owner.id, dataUsaha.userId))
      .where(and(base, inArray(auditLogs.action, CORRECTION_ACTIONS)))
      .groupBy(auditLogs.entityId, dataUsaha.userId),
  ]);

  return {
    items: items.map((i) => ({ ...i, actor: i.actor?.id ? i.actor : null })),
    total: totalRows[0]?.n ?? 0,
    page: p.page,
    pageSize: p.pageSize,
    summary: {
      byAction: Object.fromEntries(byActionRows.map((r) => [r.action, r.n])),
      dataUsahaWithCorrection: correctionRows.length,
      ownersWithCorrection: new Set(correctionRows.map((r) => r.ownerId)).size,
      repeatedCorrection: correctionRows.filter((r) => r.n >= 2).length,
    },
  };
}
