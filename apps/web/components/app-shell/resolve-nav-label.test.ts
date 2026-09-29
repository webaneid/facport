import { describe, test, expect } from "bun:test";
import { resolveNavLabel } from "./resolve-nav-label";
import type { NavItem } from "./sidebar";
import { Home } from "lucide-react";

// § Fase 159 — bug NYATA ditemukan saat browser-test AutoProduksi: 3 item
// nav ("List Formula"/"Input Produksi"/"Riwayat Produksi") berbagi SATU
// moduleKey ("autoproduksi_production", 1 SKU/plan yang sama) — substitusi
// lama "tampilkan nama Plan" (§ app/(protected)/layout.tsx) bikin KETIGANYA
// tampil teks identik (nama Plan), tidak bisa dibedakan. Ini test guard
// supaya kelas bug ini tidak lolos lagi kalau ada modul lain ke depan yang
// juga bundel beberapa nav item dalam 1 moduleKey.
const item = (href: string, label: string, moduleKey?: string): NavItem => ({ href, label, icon: Home, moduleKey });

describe("resolveNavLabel", () => {
  test("moduleKey UNIK di antara sibling -> tampil nama Plan (perilaku lama, tetap benar)", () => {
    const target = item("/sales-invoice/import", "Import Faktur Penjualan", "sales_invoice");
    const siblings = [target, item("/other-payment/import", "Import Other Payment", "other_payment")];
    expect(resolveNavLabel(target, siblings, { sales_invoice: "Paket Bronze" })).toBe("Paket Bronze");
  });

  test("moduleKey UNIK tapi tidak ada di modulePlanNames -> fallback ke label item", () => {
    const target = item("/sales-invoice/import", "Import Faktur Penjualan", "sales_invoice");
    expect(resolveNavLabel(target, [target], {})).toBe("Import Faktur Penjualan");
  });

  test("moduleKey DIPAKAI >1 sibling (kasus AutoProduksi) -> SELALU label item, BUKAN nama Plan", () => {
    const formulas = item("/autoproduksi/formulas", "List Formula", "autoproduksi_production");
    const input = item("/autoproduksi/input", "Input Produksi", "autoproduksi_production");
    const riwayat = item("/autoproduksi/riwayat", "Riwayat Produksi", "autoproduksi_production");
    const siblings = [formulas, input, riwayat];
    const modulePlanNames = { autoproduksi_production: "AutoProduksi - Input Produksi" };

    expect(resolveNavLabel(formulas, siblings, modulePlanNames)).toBe("List Formula");
    expect(resolveNavLabel(input, siblings, modulePlanNames)).toBe("Input Produksi");
    expect(resolveNavLabel(riwayat, siblings, modulePlanNames)).toBe("Riwayat Produksi");
    // § inti bug-nya: 3 hasil di atas WAJIB berbeda satu sama lain.
    const results = new Set([resolveNavLabel(formulas, siblings, modulePlanNames), resolveNavLabel(input, siblings, modulePlanNames), resolveNavLabel(riwayat, siblings, modulePlanNames)]);
    expect(results.size).toBe(3);
  });

  test("item TANPA moduleKey (mis. Arsip Import) -> selalu label item apa adanya", () => {
    const target = item("/import/arsip", "Arsip Import", undefined);
    expect(resolveNavLabel(target, [target], { autoproduksi_production: "Paket X" })).toBe("Arsip Import");
  });
});
