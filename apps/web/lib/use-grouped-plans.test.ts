import { describe, test, expect } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useGroupedPlans, type PlanLike } from "./use-grouped-plans";

const purchaseInvoiceMonthly: PlanLike = { id: "pi-monthly", price: 100_000, durationDays: 30, modules: ["purchase_invoice"] };
const purchaseInvoiceYearly: PlanLike = { id: "pi-yearly", price: 1_000_000, durationDays: 360, modules: ["purchase_invoice"] };
const salesInvoiceSingle: PlanLike = { id: "si-only", price: 150_000, durationDays: 30, modules: ["sales_invoice"] };

describe("useGroupedPlans", () => {
  test("mengelompokkan plan berdasarkan modules[0], modul 1-tier tetap 1 grup 1 tier", () => {
    const { result } = renderHook(() => useGroupedPlans([purchaseInvoiceMonthly, purchaseInvoiceYearly, salesInvoiceSingle]));
    expect(result.current.groups).toHaveLength(2);
    const piGroup = result.current.groups.find((g) => g.moduleKey === "purchase_invoice");
    const siGroup = result.current.groups.find((g) => g.moduleKey === "sales_invoice");
    expect(piGroup?.tiers).toHaveLength(2);
    expect(siGroup?.tiers).toHaveLength(1);
  });

  test("tiers diurutkan ASC by durationDays (bulanan sebelum tahunan)", () => {
    // sengaja dibalik urutan input, hook yang harus urutkan
    const { result } = renderHook(() => useGroupedPlans([purchaseInvoiceYearly, purchaseInvoiceMonthly]));
    const piGroup = result.current.groups.find((g) => g.moduleKey === "purchase_invoice")!;
    expect(piGroup.tiers[0]!.id).toBe("pi-monthly");
    expect(piGroup.tiers[1]!.id).toBe("pi-yearly");
  });

  test("default tier aktif = tier durasi terpendek (tiers[0])", () => {
    const { result } = renderHook(() => useGroupedPlans([purchaseInvoiceYearly, purchaseInvoiceMonthly]));
    const piGroup = result.current.groups.find((g) => g.moduleKey === "purchase_invoice")!;
    expect(result.current.activePlanFor(piGroup)?.id).toBe("pi-monthly");
  });

  test("selectTier mengganti tier aktif tanpa mengubah status selected modul", () => {
    const { result } = renderHook(() => useGroupedPlans([purchaseInvoiceMonthly, purchaseInvoiceYearly]));
    const piGroup = result.current.groups.find((g) => g.moduleKey === "purchase_invoice")!;

    act(() => result.current.toggleModule("purchase_invoice"));
    expect(result.current.isModuleSelected("purchase_invoice")).toBe(true);
    expect(result.current.selectedPlanIds).toEqual(["pi-monthly"]);

    act(() => result.current.selectTier("purchase_invoice", "pi-yearly"));
    expect(result.current.isModuleSelected("purchase_invoice")).toBe(true); // tetap terpilih, cuma tier-nya ganti
    expect(result.current.isTierActive(piGroup, "pi-yearly")).toBe(true);
    expect(result.current.selectedPlanIds).toEqual(["pi-yearly"]);
  });

  test("toggleModule menambah lalu menghapus dari selectedPlanIds", () => {
    const { result } = renderHook(() => useGroupedPlans([purchaseInvoiceMonthly, salesInvoiceSingle]));
    act(() => result.current.toggleModule("purchase_invoice"));
    act(() => result.current.toggleModule("sales_invoice"));
    expect(result.current.selectedPlanIds.sort()).toEqual(["pi-monthly", "si-only"]);

    act(() => result.current.toggleModule("purchase_invoice"));
    expect(result.current.selectedPlanIds).toEqual(["si-only"]);
  });

  test("setSelectedModules mengganti seluruh set (bukan toggle) — aman dipanggil ganda", () => {
    const { result } = renderHook(() => useGroupedPlans([purchaseInvoiceMonthly, salesInvoiceSingle]));
    act(() => result.current.setSelectedModules(new Set(["purchase_invoice"])));
    act(() => result.current.setSelectedModules(new Set(["purchase_invoice"]))); // panggil 2x, hasil harus sama (bukan toggle-off)
    expect(result.current.selectedPlanIds).toEqual(["pi-monthly"]);
  });
});
