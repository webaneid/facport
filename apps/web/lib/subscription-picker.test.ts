import { describe, test, expect } from "bun:test";
import {
  buildPickerRows,
  filterPickerRows,
  countRowsByFilter,
  selectableKeys,
  previewRow,
  summarizeSelection,
  pruneSelection,
  SEAT_ROW_KEY,
  type PickerPlan,
  type ActiveSubscriptionInfo,
} from "./subscription-picker";

const WIB = "Asia/Jakarta";
const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi));
const iso = (d: Date) => d.toISOString();
let n = 0;
const plan = (moduleKey: string | null, interval: "monthly" | "yearly", price: number, extra: Partial<PickerPlan> = {}): PickerPlan => ({
  id: `p${++n}`,
  name: `${moduleKey ?? "seat"} ${interval}`,
  price,
  durationDays: interval === "yearly" ? 365 : 30,
  interval,
  modules: moduleKey ? [moduleKey] : [],
  isActive: true,
  ...extra,
});

const plans: PickerPlan[] = [
  plan("sales_invoice", "monthly", 100000),
  plan("sales_invoice", "yearly", 1000000),
  plan("purchase_invoice", "monthly", 90000), // hanya bulanan
  plan("konverter_sales_invoice", "monthly", 50000),
  plan("konverter_sales_invoice", "yearly", 500000),
  plan("autoproduksi_production", "yearly", 700000),
  plan(null, "monthly", 20000, { kind: "seat_addon" }),
  plan(null, "yearly", 200000, { kind: "seat_addon" }),
  plan("sales_order", "monthly", 80000, { isActive: false }), // nonaktif → tidak muncul
];

describe("buildPickerRows — fitur → paket menurut periode", () => {
  test("satu baris per fitur (bukan per paket); paket nonaktif tidak muncul; seat satu baris sendiri", () => {
    const rows = buildPickerRows(plans, { interval: "monthly" });
    // urutan mengikuti katalog (Produk → modul), Tambah User terakhir — bukan urutan masuk
    expect(rows.map((r) => r.key)).toEqual(["purchase_invoice", "sales_invoice", "konverter_sales_invoice", "autoproduksi_production", SEAT_ROW_KEY]);
    expect(rows.find((r) => r.key === "sales_order")).toBeUndefined();
    expect(rows.find((r) => r.key === SEAT_ROW_KEY)!.label).toBe("Slot User Tambahan");
  });

  test("periode bulanan → paket bulanan; ganti ke tahunan → paket tahunan fitur yang sama", () => {
    const monthly = buildPickerRows(plans, { interval: "monthly" }).find((r) => r.key === "sales_invoice")!;
    const yearly = buildPickerRows(plans, { interval: "yearly" }).find((r) => r.key === "sales_invoice")!;
    expect(monthly.plan!.price).toBe(100000);
    expect(yearly.plan!.price).toBe(1000000);
    expect(monthly.intervals).toEqual(["monthly", "yearly"]);
  });

  test("fitur tanpa paket di periode terpilih → plan null (tidak tersedia), bukan diganti diam-diam", () => {
    const yearlyRows = buildPickerRows(plans, { interval: "yearly" });
    expect(yearlyRows.find((r) => r.key === "purchase_invoice")!.plan).toBeNull();
    expect(yearlyRows.find((r) => r.key === "purchase_invoice")!.intervals).toEqual(["monthly"]);
    const monthlyRows = buildPickerRows(plans, { interval: "monthly" });
    expect(monthlyRows.find((r) => r.key === "autoproduksi_production")!.plan).toBeNull();
    expect(selectableKeys(yearlyRows)).not.toContain("purchase_invoice");
  });

  test("beberapa paket pada fitur+periode yang sama → yang termurah dipilih (deterministik)", () => {
    const rows = buildPickerRows([plan("sales_invoice", "monthly", 120000), plan("sales_invoice", "monthly", 99000)], { interval: "monthly" });
    expect(rows[0]!.plan!.price).toBe(99000);
  });
});

describe("filter Produk & pencarian", () => {
  const rows = buildPickerRows(plans, { interval: "monthly" });

  test("jumlah per filter: Facport 2, Konverter 1, AutoProduksi 1, Tambah User 1, semua 5", () => {
    const counts = countRowsByFilter(rows);
    expect(counts.all).toBe(5);
    expect(counts.facport).toBe(2);
    expect(counts.konverter).toBe(1);
    expect(counts.autoproduksi).toBe(1);
    expect(counts.seat_addon).toBe(1);
  });

  test("filter Produk menyaring baris; pencarian mencocokkan label/produk/nama paket tanpa peduli huruf besar", () => {
    expect(filterPickerRows(rows, { filterKey: "konverter", search: "" }).map((r) => r.key)).toEqual(["konverter_sales_invoice"]);
    expect(filterPickerRows(rows, { filterKey: "all", search: "  TAMBAH user " }).map((r) => r.key)).toEqual([SEAT_ROW_KEY]);
    expect(filterPickerRows(rows, { filterKey: "facport", search: "purchase" }).map((r) => r.key)).toEqual(["purchase_invoice"]);
    expect(filterPickerRows(rows, { filterKey: "all", search: "tidak-ada" })).toEqual([]);
  });
});

describe("previewRow — tanggal & jam akhir (fungsi periode yang sama dengan server)", () => {
  const now = wib(2026, 10, 6, 14, 35);

  test("baru: bulanan = tanggal & jam sama bulan depan; tahunan = tahun depan", () => {
    const monthly = buildPickerRows(plans, { interval: "monthly" }).find((r) => r.key === "sales_invoice")!;
    const yearly = buildPickerRows(plans, { interval: "yearly" }).find((r) => r.key === "sales_invoice")!;
    expect(previewRow(monthly, now, WIB)).toMatchObject({ mode: "new", previousEndAt: null });
    expect(iso(previewRow(monthly, now, WIB)!.endAt)).toBe(iso(wib(2026, 11, 6, 14, 35)));
    expect(iso(previewRow(yearly, now, WIB)!.endAt)).toBe(iso(wib(2027, 10, 6, 14, 35)));
  });

  test("tanggal 31: dijepit ke hari terakhir bulan tujuan (31 Jan → 28 Feb)", () => {
    const row = buildPickerRows(plans, { interval: "monthly" }).find((r) => r.key === "sales_invoice")!;
    expect(iso(previewRow(row, wib(2026, 1, 31, 10), WIB)!.endAt)).toBe(iso(wib(2026, 2, 28, 10)));
  });

  test("perpanjang: fitur aktif non-trial → dari AKHIR LAMA (bukan sekarang), jam akhir lama terjaga", () => {
    const active = new Map<string, ActiveSubscriptionInfo>([["sales_invoice", { endAt: wib(2027, 1, 1, 20, 0).toISOString(), isTrial: false }]]);
    const row = buildPickerRows(plans, { interval: "monthly", activeByModule: active }).find((r) => r.key === "sales_invoice")!;
    const p = previewRow(row, wib(2026, 12, 28, 9, 0), WIB)!;
    expect(p.mode).toBe("renew");
    expect(iso(p.previousEndAt!)).toBe(iso(wib(2027, 1, 1, 20, 0)));
    expect(iso(p.endAt)).toBe(iso(wib(2027, 2, 1, 20, 0)));
  });

  test("perpanjang memakai jangkar bila selaras (anti-geser): +1 bulan dari 28 Feb dengan jangkar 31 Jan = 31 Mar", () => {
    const active = new Map<string, ActiveSubscriptionInfo>([
      ["sales_invoice", { endAt: wib(2026, 2, 28, 10).toISOString(), isTrial: false, periodAnchorAt: wib(2026, 1, 31, 10).toISOString(), periodMonths: 1 }],
    ]);
    const row = buildPickerRows(plans, { interval: "monthly", activeByModule: active }).find((r) => r.key === "sales_invoice")!;
    expect(iso(previewRow(row, wib(2026, 2, 10, 9), WIB)!.endAt)).toBe(iso(wib(2026, 3, 31, 10)));
  });

  test("trial aktif → digantikan paket asli, mulai sekarang (bukan perpanjangan); aktif tapi sudah lewat → baru", () => {
    const trial = new Map<string, ActiveSubscriptionInfo>([["sales_invoice", { endAt: wib(2026, 10, 20, 10).toISOString(), isTrial: true }]]);
    const trialRow = buildPickerRows(plans, { interval: "monthly", activeByModule: trial }).find((r) => r.key === "sales_invoice")!;
    expect(previewRow(trialRow, now, WIB)!.mode).toBe("replace-trial");
    expect(iso(previewRow(trialRow, now, WIB)!.endAt)).toBe(iso(wib(2026, 11, 6, 14, 35)));

    const stale = new Map<string, ActiveSubscriptionInfo>([["sales_invoice", { endAt: wib(2026, 10, 1, 10).toISOString(), isTrial: false }]]);
    const staleRow = buildPickerRows(plans, { interval: "monthly", activeByModule: stale }).find((r) => r.key === "sales_invoice")!;
    expect(previewRow(staleRow, now, WIB)!.mode).toBe("new");
  });

  test("tanpa paket di periode itu → tidak ada pratinjau", () => {
    const row = buildPickerRows(plans, { interval: "yearly" }).find((r) => r.key === "purchase_invoice")!;
    expect(previewRow(row, now, WIB)).toBeNull();
  });
});

describe("summarizeSelection & pruneSelection", () => {
  const now = wib(2026, 10, 6, 14, 35);

  test("banyak fitur sekaligus: total harga, daftar paket, semua baru satu tanggal akhir yang sama", () => {
    const rows = buildPickerRows(plans, { interval: "monthly" });
    const keys = new Set(selectableKeys(rows));
    const s = summarizeSelection(rows, keys, now, WIB);
    expect(s.count).toBe(keys.size);
    expect(s.planIds).toHaveLength(keys.size);
    expect(s.total).toBe(rows.filter((r) => r.plan).reduce((sum, r) => sum + r.plan!.price, 0));
    expect(s.newCount).toBe(keys.size);
    expect(s.renewCount).toBe(0);
    expect(iso(s.newEndAt!)).toBe(iso(wib(2026, 11, 6, 14, 35)));
  });

  test("campuran perpanjang + baru dihitung terpisah; newEndAt hanya dari yang baru", () => {
    const active = new Map<string, ActiveSubscriptionInfo>([["sales_invoice", { endAt: wib(2026, 10, 25, 20).toISOString(), isTrial: false }]]);
    const rows = buildPickerRows(plans, { interval: "monthly", activeByModule: active });
    const s = summarizeSelection(rows, new Set(["sales_invoice", "purchase_invoice"]), now, WIB);
    expect(s.renewCount).toBe(1);
    expect(s.newCount).toBe(1);
    expect(iso(s.newEndAt!)).toBe(iso(wib(2026, 11, 6, 14, 35)));
  });

  test("kunci yang tidak ada / tanpa paket diabaikan; pilihan kosong = nol", () => {
    const rows = buildPickerRows(plans, { interval: "yearly" });
    const s = summarizeSelection(rows, new Set(["purchase_invoice", "tidak_ada"]), now, WIB);
    expect(s.count).toBe(0);
    expect(s.total).toBe(0);
    expect(s.newEndAt).toBeNull();
  });

  test("ganti periode: pilihan fitur yang tidak punya paket di periode baru dilepas", () => {
    const monthlyRows = buildPickerRows(plans, { interval: "monthly" });
    const chosen = new Set(["sales_invoice", "purchase_invoice"]);
    const yearlyRows = buildPickerRows(plans, { interval: "yearly" });
    expect([...pruneSelection(yearlyRows, chosen)]).toEqual(["sales_invoice"]);
    expect([...pruneSelection(monthlyRows, chosen)].sort()).toEqual(["purchase_invoice", "sales_invoice"]);
  });
});
