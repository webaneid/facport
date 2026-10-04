import { describe, test, expect } from "bun:test";
import { breadcrumbLabel, isIdSegment } from "./breadcrumb-label";

describe("breadcrumbLabel", () => {
  test("segmen biasa tetap di-title-case seperti sebelumnya", () => {
    expect(breadcrumbLabel("import-faktur-pembelian")).toEqual({ label: "Import Faktur Pembelian" });
    expect(breadcrumbLabel("riwayat")).toEqual({ label: "Riwayat" });
    expect(breadcrumbLabel("import")).toEqual({ label: "Import" });
  });

  test("UUID dan ID user/invoice panjang dipendekkan; nilai lengkap di title", () => {
    expect(breadcrumbLabel("3f2a8c1d-1234-4abc-9def-0123456789ab")).toEqual({ label: "#3f2a8c1d…", title: "3f2a8c1d-1234-4abc-9def-0123456789ab" });
    expect(breadcrumbLabel("wbEE2zd69MtoysyVYOYmaiDjtWQZ6Xwq")).toEqual({ label: "#wbEE2zd6…", title: "wbEE2zd69MtoysyVYOYmaiDjtWQZ6Xwq" });
    expect(breadcrumbLabel("20260930123456")).toMatchObject({ label: "#20260930…" });
  });

  test("kata biasa yang panjang tapi memakai tanda hubung / pendek BUKAN dianggap ID", () => {
    expect(isIdSegment("import-faktur-penjualan-berulang")).toBe(false);
    expect(isIdSegment("autoproduksi")).toBe(false);
    expect(isIdSegment("12345")).toBe(false);
  });
});
