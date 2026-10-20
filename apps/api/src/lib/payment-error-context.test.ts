import { describe, test, expect } from "bun:test";
import { annotatePaymentFailure } from "./payment-error-context";

// Kasus nyata production 2026-10-19: Excel "Invoice No" = PIN-2606-172, Accurate menyebut faktur "351-09061110" (nomor lain).
const mapping = { "Invoice No": "invoiceNo", Payment: "chequeAmount", "No. Supplier": "vendorNo" };
const row = (invoice: string, payment: unknown) => ({ rawData: { "Invoice No": invoice, Payment: payment, "No. Supplier": "21101-00322" } as Record<string, unknown> });
const accurateMsg = 'Pembayaran faktur "351-09061110" melebihi nilai utang fakturnya';

describe("annotatePaymentFailure", () => {
  test("galat 'melebihi nilai utang' → ditambah daftar faktur MENURUT EXCEL (nomor Excel + Payment) agar bisa dicocokkan", () => {
    const out = annotatePaymentFailure(accurateMsg, [row("PIN-2606-172", 610900), row("PIN-2606-173", 1250000)], mapping);
    expect(out.startsWith(accurateMsg)).toBe(true); // pesan asli Accurate tetap utuh di depan
    expect(out).toContain("PIN-2606-172 (Payment 610.900)");
    expect(out).toContain("PIN-2606-173 (Payment 1.250.000)");
    expect(out).toContain("nomor lain");
  });

  test("juga untuk 'melebihi nilai piutang' (Sales Receipt) dan 'tidak ditemukan atau sudah dihapus'", () => {
    expect(annotatePaymentFailure('Pembayaran faktur "X" melebihi nilai piutang fakturnya', [row("INV-1", 5)], mapping)).toContain("INV-1 (Payment 5)");
    expect(annotatePaymentFailure("Faktur Pembelian tidak ditemukan atau sudah dihapus", [row("INV-2", 7)], mapping)).toContain("INV-2 (Payment 7)");
  });

  test("galat LAIN tidak disentuh (timeout, pajak, dll.) — pesan identik", () => {
    for (const m of ['PPh ID "X" tidak ditemukan di Data Master Pajak Accurate', "Accurate belum membalas setelah 6 menit", "Kolom wajib kosong"]) {
      expect(annotatePaymentFailure(m, [row("INV-1", 5)], mapping)).toBe(m);
    }
  });

  test("faktur sama di beberapa baris → satu entri; angka SAMA ditampilkan sekali (diskon tambahan), angka berbeda dijumlahkan", () => {
    const same = annotatePaymentFailure(accurateMsg, [row("INV-1", 1000), row("INV-1", 1000)], mapping);
    expect(same).toContain("INV-1 (Payment 1.000)");
    expect(same.match(/INV-1/g)).toHaveLength(1);
    expect(annotatePaymentFailure(accurateMsg, [row("INV-1", 1000), row("INV-1", 500)], mapping)).toContain("INV-1 (Payment 1.500)");
  });

  test("daftar dipotong (default 15) dengan 'dan N faktur lain'", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`INV-${i}`, 100));
    const out = annotatePaymentFailure(accurateMsg, rows, mapping);
    expect(out).toContain("INV-14 (Payment 100)");
    expect(out).not.toContain("INV-15 ");
    expect(out).toContain("dan 5 faktur lain");
  });

  test("kolom faktur tidak dipetakan / baris tanpa nomor → pesan apa adanya (tidak pernah merusak pesan asli)", () => {
    expect(annotatePaymentFailure(accurateMsg, [row("INV-1", 5)], { Payment: "chequeAmount" })).toBe(accurateMsg);
    expect(annotatePaymentFailure(accurateMsg, [row("", 5)], mapping)).toBe(accurateMsg);
  });

  test("Payment tidak terisi → hanya nomor faktur; nilai non-angka ditampilkan apa adanya", () => {
    expect(annotatePaymentFailure(accurateMsg, [{ rawData: { "Invoice No": "INV-1" } }], mapping)).toContain("INV-1.");
    expect(annotatePaymentFailure(accurateMsg, [row("INV-1", "abc")], mapping)).toContain("INV-1 (Payment abc)");
  });
});
