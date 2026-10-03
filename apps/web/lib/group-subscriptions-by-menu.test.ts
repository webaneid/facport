import { describe, test, expect } from "bun:test";
import { groupByMenu } from "./group-subscriptions-by-menu";

const sub = (moduleKey: string | null, id = moduleKey ?? "seat") => ({ moduleKey, id });

describe("groupByMenu", () => {
  test("dikelompokkan per Produk · Kategori dengan urutan katalog (bukan urutan masukan)", () => {
    const groups = groupByMenu([sub("sales_invoice"), sub("purchase_invoice"), sub("other_payment"), sub("sales_order"), sub("purchase_order")]);
    expect(groups.map((g) => g.label)).toEqual(["Facport · Cash & Bank", "Facport · Purchase", "Facport · Sales"]);
    // urutan modul di dalam grup mengikuti katalog: Purchase Order sebelum Purchase Invoice; Sales Order sebelum Sales Invoice
    expect(groups[1]!.items.map((i) => i.moduleKey)).toEqual(["purchase_order", "purchase_invoice"]);
    expect(groups[2]!.items.map((i) => i.moduleKey)).toEqual(["sales_order", "sales_invoice"]);
  });

  test("tanpa modul (paket User Tambahan) atau modul tak dikenal masuk 'Lainnya' di paling akhir", () => {
    const groups = groupByMenu([sub(null), sub("sales_invoice"), sub("modul_tak_dikenal", "x")]);
    expect(groups.map((g) => g.label)).toEqual(["Facport · Sales", "Lainnya"]);
    expect(groups[1]!.items).toHaveLength(2);
  });

  test("daftar kosong → tanpa grup", () => {
    expect(groupByMenu([])).toEqual([]);
  });
});
