import { describe, test, expect } from "bun:test";
import { sortPlansByCatalog, filterPlansByProduct, planOptionLabel, countPlansByFilter, planFilterKey, summarizeHiddenPlans } from "./classify-plans";

const plan = (id: string, name: string, modules: string[], productLine = "facport", kind = "module", durationDays = 30) => ({ id, name, modules, productLine, kind, durationDays });

const plans = [
  plan("seat", "User Tambahan", [], "facport", "seat_addon"),
  plan("ap", "Input Produksi", ["autoproduksi_production"], "autoproduksi"),
  plan("kv-do", "Delivery Order", ["konverter_delivery_order"], "konverter"),
  plan("fp-do", "Delivery Order", ["delivery_order"], "facport"),
  plan("fp-si", "Sales Invoice", ["sales_invoice"], "facport"),
  plan("fp-po", "Purchase Order", ["purchase_order"], "facport"),
];

describe("classify-plans", () => {
  test("urutan: Facport → Konverter → AutoProduksi → Tambah User; di dalam produk mengikuti katalog modul", () => {
    const ids = sortPlansByCatalog(plans).map((p) => p.id);
    expect(ids.indexOf("fp-po")).toBeLessThan(ids.indexOf("fp-si")); // Purchase sebelum Sales (urutan katalog)
    expect(ids.slice(-3)).toEqual(["kv-do", "ap", "seat"]);
    expect(Math.max(ids.indexOf("fp-do"), ids.indexOf("fp-si"), ids.indexOf("fp-po"))).toBeLessThan(ids.indexOf("kv-do"));
  });

  test("nama sama di Facport vs Konverter dibedakan lewat awalan produk di label", () => {
    expect(planOptionLabel(plans[3]!)).toBe("Facport · Delivery Order — 30 hari");
    expect(planOptionLabel(plans[2]!)).toBe("Konverter · Delivery Order — 30 hari");
    expect(planOptionLabel(plans[0]!)).toBe("Tambah User · User Tambahan — 30 hari");
  });

  test("filter produk & hitungan per filter (seat add-on = Tambah User, bukan Facport)", () => {
    expect(filterPlansByProduct(plans, "konverter").map((p) => p.id)).toEqual(["kv-do"]);
    expect(filterPlansByProduct(plans, "seat_addon").map((p) => p.id)).toEqual(["seat"]);
    expect(filterPlansByProduct(plans, "all")).toHaveLength(6);
    expect(planFilterKey(plans[0]!)).toBe("seat_addon");
    expect(countPlansByFilter(plans)).toEqual({ all: 6, seat_addon: 1, autoproduksi: 1, konverter: 1, facport: 3 });
  });
});

describe("produk diturunkan dari modul, bukan kolom product_line", () => {
  test("paket AutoProduksi yang kolom product_line-nya 'facport' (default/tidak sinkron) tetap terhitung AutoProduksi", () => {
    const mislabeled = plan("ap-old", "Input Produksi Bulanan", ["autoproduksi_production"], "facport");
    expect(planFilterKey(mislabeled)).toBe("autoproduksi");
    expect(planOptionLabel(mislabeled)).toBe("AutoProduksi · Input Produksi Bulanan — 30 hari");
    expect(countPlansByFilter([mislabeled, plan("fp", "Sales Invoice", ["sales_invoice"])])).toEqual({ all: 2, autoproduksi: 1, facport: 1 });
  });

  test("modul tak dikenal jatuh ke kolom product_line (lalu 'facport')", () => {
    expect(planFilterKey(plan("x", "X", ["modul_baru"], "konverter"))).toBe("konverter");
    expect(planFilterKey(plan("y", "Y", [], undefined as unknown as string))).toBe("facport");
  });
});

describe("summarizeHiddenPlans", () => {
  test("merangkum per modul: nama produk · modul + jumlah paketnya", () => {
    const hidden = [plan("a", "Input Produksi 30", ["autoproduksi_production"], "autoproduksi"), plan("b", "Input Produksi 365", ["autoproduksi_production"], "autoproduksi", "module", 365), plan("c", "SI", ["sales_invoice"])];
    expect(summarizeHiddenPlans(hidden)).toEqual(["AutoProduksi · Input Produksi (2 paket)", "Facport · Sales Invoice (1 paket)"]);
  });
});
