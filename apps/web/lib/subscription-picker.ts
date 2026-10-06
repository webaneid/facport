import { MODULE_OPTIONS, moduleCategory, moduleLabel } from "./module-options";
import { PLAN_PRODUCT_FILTERS, SEAT_FILTER_KEY, planFilterKey, planProductLabel } from "./classify-plans";
import { addCalendarPeriod, computeRenewalEnd, inferIntervalFromDays, type SubscriptionInterval } from "./subscription-period";

// § Fase 177, ADR-0041 — logika murni di balik komponen `SubscriptionPicker` (pilih BANYAK paket sekaligus, satu periode untuk semua, pratinjau tanggal+jam
// akhir). Dipisah dari komponen supaya bisa diuji tanpa DOM dan dipakai ulang di halaman lain (admin Tambah User, Kelola Langganan, app pelanggan).
// Satu BARIS = satu fitur (modul) — paketnya diturunkan dari periode yang dipilih (bulanan/tahunan), bukan dipilih per paket satu-satu.

export type PickerPlan = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  interval?: SubscriptionInterval;
  modules: string[];
  isActive: boolean;
  productLine?: string;
  kind?: string;
};

/** Langganan yang SUDAH ADA untuk sebuah fitur di Data Usaha tujuan (dasar mode Perpanjang). */
export type ActiveSubscriptionInfo = {
  endAt: string | null;
  isTrial: boolean;
  periodAnchorAt?: string | null;
  periodMonths?: number | null;
};

export const SEAT_ROW_KEY = "seat_addon";

export type PickerRow = {
  /** moduleKey, atau `SEAT_ROW_KEY` untuk slot user tambahan. */
  key: string;
  label: string;
  filterKey: string;
  productLabel: string;
  categoryLabel: string;
  /** Periode yang tersedia untuk fitur ini (ada paket aktifnya). */
  intervals: SubscriptionInterval[];
  /** Paket untuk periode yang dipilih; null = fitur ini tidak punya paket di periode itu. */
  plan: PickerPlan | null;
  active: ActiveSubscriptionInfo | null;
};

export function planPeriod(plan: Pick<PickerPlan, "interval" | "durationDays">): SubscriptionInterval {
  return plan.interval ?? inferIntervalFromDays(plan.durationDays);
}

function cheapest(plans: PickerPlan[]): PickerPlan | null {
  return [...plans].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))[0] ?? null;
}

/** Semua baris (belum difilter), terurut mengikuti katalog (Produk → modul), Tambah User terakhir. */
export function buildPickerRows(plans: PickerPlan[], opts: { interval: SubscriptionInterval; activeByModule?: Map<string, ActiveSubscriptionInfo> }): PickerRow[] {
  const groups = new Map<string, PickerPlan[]>();
  for (const plan of plans) {
    if (!plan.isActive) continue;
    const key = plan.kind === "seat_addon" ? SEAT_ROW_KEY : plan.modules[0];
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), plan]);
  }

  const rows: PickerRow[] = [];
  for (const [key, group] of groups) {
    const seat = key === SEAT_ROW_KEY;
    const sample = group[0]!;
    rows.push({
      key,
      label: seat ? "Slot User Tambahan" : moduleLabel(key),
      filterKey: planFilterKey(sample),
      productLabel: planProductLabel(sample),
      categoryLabel: seat ? "Tambah User" : (moduleCategory(key) ?? "Lainnya"),
      intervals: (["monthly", "yearly"] as const).filter((i) => group.some((p) => planPeriod(p) === i)),
      plan: cheapest(group.filter((p) => planPeriod(p) === opts.interval)),
      active: seat ? null : (opts.activeByModule?.get(key) ?? null),
    });
  }

  const filterRank = (r: PickerRow) => PLAN_PRODUCT_FILTERS.findIndex((f) => f.key === r.filterKey);
  const moduleRank = (r: PickerRow) => {
    const i = MODULE_OPTIONS.findIndex((m) => m.key === r.key);
    return i === -1 ? 9999 : i;
  };
  return rows.sort((a, b) => filterRank(a) - filterRank(b) || moduleRank(a) - moduleRank(b) || a.label.localeCompare(b.label));
}

export function filterPickerRows(rows: PickerRow[], opts: { filterKey: string; search: string }): PickerRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.filterKey !== "all" && r.filterKey !== opts.filterKey) return false;
    if (!q) return true;
    return [r.label, r.productLabel, r.categoryLabel, r.plan?.name ?? ""].some((text) => text.toLowerCase().includes(q));
  });
}

/** Jumlah baris per filter Produk (+ "all"), untuk chip filter. */
export function countRowsByFilter(rows: PickerRow[]): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) counts[r.filterKey] = (counts[r.filterKey] ?? 0) + 1;
  return counts;
}

/** Baris yang BISA dipilih (punya paket di periode terpilih). */
export function selectableKeys(rows: PickerRow[]): string[] {
  return rows.filter((r) => r.plan !== null).map((r) => r.key);
}

export type RowPreview = {
  /** `new` = langganan baru mulai sekarang; `renew` = diperpanjang dari akhir lama; `replace-trial` = trial digantikan paket asli (mulai sekarang). */
  mode: "new" | "renew" | "replace-trial";
  endAt: Date;
  previousEndAt: Date | null;
};

/** Pratinjau akhir langganan untuk satu baris — fungsi periode yang SAMA dengan server (`addCalendarPeriod`/`computeRenewalEnd`). */
export function previewRow(row: PickerRow, now: Date, timeZone: string): RowPreview | null {
  if (!row.plan) return null;
  const interval = planPeriod(row.plan);
  const active = row.active;
  if (active && active.endAt && new Date(active.endAt).getTime() > now.getTime()) {
    if (active.isTrial) return { mode: "replace-trial", endAt: addCalendarPeriod(now, interval, 1, timeZone), previousEndAt: null };
    const previousEndAt = new Date(active.endAt);
    const next = computeRenewalEnd(
      { endAt: previousEndAt, periodAnchorAt: active.periodAnchorAt ? new Date(active.periodAnchorAt) : null, periodMonths: active.periodMonths ?? null },
      interval,
      timeZone,
    );
    return { mode: "renew", endAt: next.endAt, previousEndAt };
  }
  return { mode: "new", endAt: addCalendarPeriod(now, interval, 1, timeZone), previousEndAt: null };
}

export type SelectionSummary = {
  count: number;
  total: number;
  planIds: string[];
  renewCount: number;
  newCount: number;
  /** Semua langganan BARU berakhir di instan yang sama (satu `now`) → satu tanggal untuk ditampilkan; null bila tidak ada yang baru. */
  newEndAt: Date | null;
};

export function summarizeSelection(rows: PickerRow[], selectedKeys: Set<string>, now: Date, timeZone: string): SelectionSummary {
  const chosen = rows.filter((r) => selectedKeys.has(r.key) && r.plan);
  const previews = chosen.map((r) => previewRow(r, now, timeZone)!);
  const fresh = previews.filter((p) => p.mode !== "renew");
  // `newEndAt` hanya bermakna bila semua yang baru satu periode; campuran bulanan/tahunan → tiap baris menampilkan tanggalnya sendiri.
  const distinctNewEnds = new Set(fresh.map((p) => p.endAt.getTime()));
  return {
    count: chosen.length,
    total: chosen.reduce((sum, r) => sum + r.plan!.price, 0),
    planIds: chosen.map((r) => r.plan!.id),
    renewCount: previews.filter((p) => p.mode === "renew").length,
    newCount: fresh.length,
    newEndAt: distinctNewEnds.size === 1 ? fresh[0]!.endAt : null,
  };
}

/** Saat periode diganti: pilihan yang fiturnya TIDAK punya paket di periode baru dilepas (tidak diam-diam dibiarkan terpilih tanpa paket). */
export function pruneSelection(rows: PickerRow[], selectedKeys: Set<string>): Set<string> {
  const valid = new Set(selectableKeys(rows));
  return new Set([...selectedKeys].filter((k) => valid.has(k)));
}
