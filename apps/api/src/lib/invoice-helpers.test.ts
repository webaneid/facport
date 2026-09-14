import { describe, test, expect } from "bun:test";
import { groupIdenticalInvoiceItems } from "./invoice-helpers";

// § Fase 110, architecture-user-tambahan.md — logic murni, tidak butuh DB
// (pola sama `lib/use-grouped-plans.test.ts` di apps/web).
// § Fase 118 — fixture ditambah `moduleKey`/`productLine` (§ ADR-0033),
// dibawa serta lewat grouping — cek juga nilai itu keluar utuh di output.
describe("groupIdenticalInvoiceItems", () => {
  test("baris identik (planId+price sama) digabung jadi 1 dengan label 'Nx'", () => {
    const items = [
      { planId: "plan-seat", price: 20000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
    ];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped).toEqual([{ label: "3x Tambahan User", price: 60000, moduleKey: "seat_addon", productLine: "facport" }]);
  });

  test("baris TIDAK identik (planId beda) TIDAK digabung, urutan kemunculan pertama dipertahankan", () => {
    const items = [
      { planId: "plan-pi", price: 20000, label: "Purchase Invoice", moduleKey: "purchase_invoice", productLine: "facport" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
    ];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped).toEqual([
      { label: "Purchase Invoice", price: 20000, moduleKey: "purchase_invoice", productLine: "facport" },
      { label: "2x Tambahan User", price: 40000, moduleKey: "seat_addon", productLine: "facport" },
    ]);
  });

  test("planId sama TAPI price beda (mis. harga naik antar pembelian) TIDAK digabung", () => {
    const items = [
      { planId: "plan-seat", price: 20000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
      { planId: "plan-seat", price: 25000, label: "Tambahan User", moduleKey: "seat_addon", productLine: "facport" },
    ];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped).toEqual([
      { label: "Tambahan User", price: 20000, moduleKey: "seat_addon", productLine: "facport" },
      { label: "Tambahan User", price: 25000, moduleKey: "seat_addon", productLine: "facport" },
    ]);
  });

  test("array kosong balikin array kosong", () => {
    expect(groupIdenticalInvoiceItems([])).toEqual([]);
  });

  test("1 baris tunggal TIDAK dapat prefix 'Nx' (cuma muncul kalau quantity > 1)", () => {
    const grouped = groupIdenticalInvoiceItems([
      { planId: "plan-pi", price: 20000, label: "Purchase Invoice", moduleKey: "purchase_invoice", productLine: "facport" },
    ]);
    expect(grouped).toEqual([{ label: "Purchase Invoice", price: 20000, moduleKey: "purchase_invoice", productLine: "facport" }]);
  });

  test("moduleKey/productLine beda TAPI planId+price sama TIDAK PERNAH terjadi secara nyata (1 plan = 1 moduleKey tetap), tapi tetap ikut nilai baris PERTAMA kalau dipaksa", () => {
    // § dokumentasi perilaku edge-case yang secara bisnis tidak mungkin
    // terjadi (planId sama pasti moduleKey/productLine sama, § ADR-0019/0033) —
    // dicatat di sini supaya jelas fungsi ini TIDAK memvalidasi konsistensi
    // itu sendiri, cuma group by (planId, price) apa adanya.
    const items = [{ planId: "plan-x", price: 10000, label: "X", moduleKey: "sales_invoice", productLine: "facport" }];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped[0]!.moduleKey).toBe("sales_invoice");
  });
});
