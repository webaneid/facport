import { describe, test, expect } from "bun:test";
import { plansAvailableForDataUsaha } from "./available-plans";

const plans = [
  { id: "p-si", modules: ["sales_invoice"] },
  { id: "p-po", modules: ["purchase_order"] },
  { id: "p-seat", modules: [] },
];

describe("plansAvailableForDataUsaha", () => {
  test("modul yang sudah aktif di Data Usaha itu disembunyikan; paket lain & seat add-on tetap tersedia", () => {
    const subs = [{ status: "active", moduleKey: "sales_invoice", dataUsahaId: "du1" }];
    const res = plansAvailableForDataUsaha(plans, subs, "du1");
    expect(res.hidden.map((p) => p.id)).toEqual(["p-si"]);
    expect(res.available.map((p) => p.id)).toEqual(["p-po", "p-seat"]);
  });

  test("modul aktif di Data Usaha LAIN tidak menyembunyikan paketnya di Data Usaha ini", () => {
    const subs = [{ status: "active", moduleKey: "sales_invoice", dataUsahaId: "du2" }];
    expect(plansAvailableForDataUsaha(plans, subs, "du1").hidden).toEqual([]);
  });

  test("langganan yang sudah berakhir/dibatalkan tidak dihitung; belum pilih Data Usaha → semua tersedia", () => {
    const subs = [
      { status: "expired", moduleKey: "sales_invoice", dataUsahaId: "du1" },
      { status: "cancelled", moduleKey: "purchase_order", dataUsahaId: "du1" },
    ];
    expect(plansAvailableForDataUsaha(plans, subs, "du1").hidden).toEqual([]);
    expect(plansAvailableForDataUsaha(plans, [{ status: "active", moduleKey: "sales_invoice", dataUsahaId: "du1" }], "").available).toHaveLength(3);
  });
});
