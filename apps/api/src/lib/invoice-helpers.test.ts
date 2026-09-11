import { describe, test, expect } from "bun:test";
import { groupIdenticalInvoiceItems } from "./invoice-helpers";

// § Fase 110, architecture-user-tambahan.md — logic murni, tidak butuh DB
// (pola sama `lib/use-grouped-plans.test.ts` di apps/web).
describe("groupIdenticalInvoiceItems", () => {
  test("baris identik (planId+price sama) digabung jadi 1 dengan label 'Nx'", () => {
    const items = [
      { planId: "plan-seat", price: 20000, label: "Tambahan User" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User" },
    ];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped).toEqual([{ label: "3x Tambahan User", price: 60000 }]);
  });

  test("baris TIDAK identik (planId beda) TIDAK digabung, urutan kemunculan pertama dipertahankan", () => {
    const items = [
      { planId: "plan-pi", price: 20000, label: "Purchase Invoice" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User" },
      { planId: "plan-seat", price: 20000, label: "Tambahan User" },
    ];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped).toEqual([
      { label: "Purchase Invoice", price: 20000 },
      { label: "2x Tambahan User", price: 40000 },
    ]);
  });

  test("planId sama TAPI price beda (mis. harga naik antar pembelian) TIDAK digabung", () => {
    const items = [
      { planId: "plan-seat", price: 20000, label: "Tambahan User" },
      { planId: "plan-seat", price: 25000, label: "Tambahan User" },
    ];
    const grouped = groupIdenticalInvoiceItems(items);
    expect(grouped).toEqual([
      { label: "Tambahan User", price: 20000 },
      { label: "Tambahan User", price: 25000 },
    ]);
  });

  test("array kosong balikin array kosong", () => {
    expect(groupIdenticalInvoiceItems([])).toEqual([]);
  });

  test("1 baris tunggal TIDAK dapat prefix 'Nx' (cuma muncul kalau quantity > 1)", () => {
    const grouped = groupIdenticalInvoiceItems([{ planId: "plan-pi", price: 20000, label: "Purchase Invoice" }]);
    expect(grouped).toEqual([{ label: "Purchase Invoice", price: 20000 }]);
  });
});
