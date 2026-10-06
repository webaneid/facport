import { describe, test, expect } from "bun:test";
import { planFilterKey, planProductLabel } from "./classify-plans";

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
  test("seat add-on = Tambah User (bukan Facport); nama sama di Facport vs Konverter dibedakan lewat label produk", () => {
    expect(planFilterKey(plans[0]!)).toBe("seat_addon");
    expect(planProductLabel(plans[0]!)).toBe("Tambah User");
    expect(planProductLabel(plans[3]!)).toBe("Facport");
    expect(planProductLabel(plans[2]!)).toBe("Konverter");
  });
});

describe("produk diturunkan dari modul, bukan kolom product_line", () => {
  test("paket AutoProduksi yang kolom product_line-nya 'facport' (default/tidak sinkron) tetap terhitung AutoProduksi", () => {
    const mislabeled = plan("ap-old", "Input Produksi Bulanan", ["autoproduksi_production"], "facport");
    expect(planFilterKey(mislabeled)).toBe("autoproduksi");
    expect(planProductLabel(mislabeled)).toBe("AutoProduksi");
  });

  test("modul tak dikenal jatuh ke kolom product_line (lalu 'facport')", () => {
    expect(planFilterKey(plan("x", "X", ["modul_baru"], "konverter"))).toBe("konverter");
    expect(planFilterKey(plan("y", "Y", [], undefined as unknown as string))).toBe("facport");
  });
});
