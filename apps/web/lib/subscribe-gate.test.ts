import { describe, expect, test } from "bun:test";
import { hasAnyRealActiveSubscription } from "./subscribe-gate";

describe("hasAnyRealActiveSubscription", () => {
  test("map kosong (belum subscribe apa pun) -> false", () => {
    expect(hasAnyRealActiveSubscription(new Map())).toBe(false);
  });

  test("cuma trial aktif (semua isTrial: true) -> false (trial belum dianggap 'membeli')", () => {
    expect(hasAnyRealActiveSubscription(new Map([["autoproduksi_production", true]]))).toBe(false);
  });

  test("ada 1 subscription ASLI (isTrial: false) -> true", () => {
    expect(hasAnyRealActiveSubscription(new Map([["sales_invoice", false]]))).toBe(true);
  });

  test("campuran trial + asli -> true (minimal 1 asli sudah cukup)", () => {
    expect(
      hasAnyRealActiveSubscription(
        new Map([
          ["autoproduksi_production", true],
          ["konverter_sales_invoice", false],
        ]),
      ),
    ).toBe(true);
  });
});
