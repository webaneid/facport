import { describe, test, expect } from "bun:test";
import {
  parseInvoiceLines,
  isInvoiceReturnRow,
  missingRequiredFieldsForReturnRow,
  fillReturnPricesFromInvoice,
  MAX_INVOICE_LINES,
  type InvoiceLine,
} from "./return-from-invoice";

const line = (o: Partial<InvoiceLine> = {}): InvoiceLine => ({ itemNo: "A-1", unitPrice: 10000, quantity: 10, discPercent: null, cashDiscount: null, ...o });
const payloadOf = (o: Record<string, unknown>, entries: Record<string, unknown>[]) => ({ returnType: "INVOICE", invoiceNumber: "INV-1", detailItem: entries, ...o });

describe("parseInvoiceLines (parser KETAT)", () => {
  const raw = { item: { no: "A-1" }, unitPrice: 10000, quantity: 10, itemDiscPercent: "10", itemCashDiscount: 5000 };
  test("baca harga/qty/diskon; angka string dikonversi; diskon 0 / kosong → null; diskon persen angka → string", () => {
    expect(parseInvoiceLines({ detailItem: [raw, { ...raw, item: { no: "B" }, unitPrice: "2500.5", quantity: "2", itemDiscPercent: 0, itemCashDiscount: 0 }, { ...raw, item: { no: "C" }, itemDiscPercent: 7.5, itemCashDiscount: null }] }, "INV-1")).toEqual([
      { itemNo: "A-1", unitPrice: 10000, quantity: 10, discPercent: "10", cashDiscount: 5000 },
      { itemNo: "B", unitPrice: 2500.5, quantity: 2, discPercent: null, cashDiscount: null },
      { itemNo: "C", unitPrice: 10000, quantity: 10, discPercent: "7.5", cashDiscount: null },
    ]);
  });
  test("harga 0 yang SAH diterima; kode barang/harga/qty hilang → ditolak dengan nomor baris & field; faktur kosong / terlalu banyak baris → error jelas", () => {
    expect(parseInvoiceLines({ detailItem: [{ ...raw, unitPrice: 0 }] }, "INV-1")[0]!.unitPrice).toBe(0);
    expect(() => parseInvoiceLines({ detailItem: [{ ...raw, unitPrice: undefined }] }, "INV-1")).toThrow(/Baris ke-1.*INV-1.*harga/);
    expect(() => parseInvoiceLines({ detailItem: [raw, { ...raw, quantity: 0 }] }, "INV-1")).toThrow(/Baris ke-2.*qty/);
    expect(() => parseInvoiceLines({ detailItem: [{ ...raw, item: null }] }, "INV-1")).toThrow(/kode barang/);
    expect(() => parseInvoiceLines({ detailItem: [] }, "INV-9")).toThrow('Faktur "INV-9" tidak punya baris item');
    expect(() => parseInvoiceLines({ detailItem: Array.from({ length: MAX_INVOICE_LINES + 1 }, () => raw) }, "INV-1")).toThrow(/melebihi batas/);
  });
});

describe("isInvoiceReturnRow & missingRequiredFieldsForReturnRow", () => {
  const mapping = { "Return Type": "returnType", "Invoice No": "invoiceNumber", "Item No": "itemNo", "Unit Price": "unitPrice", Qty: "quantity" };
  const required = ["returnType", "itemNo", "unitPrice", "quantity"];
  test("INVOICE/INVOICE_DP + Invoice No terisi = baris retur-faktur (huruf kecil juga); tipe lain atau tanpa Invoice No = bukan", () => {
    expect(isInvoiceReturnRow({ "Return Type": "invoice", "Invoice No": "INV-1" }, mapping)).toBe(true);
    expect(isInvoiceReturnRow({ "Return Type": "INVOICE_DP", "Invoice No": "INV-1" }, mapping)).toBe(true);
    expect(isInvoiceReturnRow({ "Return Type": "INVOICE", "Invoice No": " " }, mapping)).toBe(false);
    for (const t of ["DELIVERY", "RECEIVE", "NO_INVOICE", ""]) expect(isInvoiceReturnRow({ "Return Type": t, "Invoice No": "INV-1" }, mapping)).toBe(false);
  });
  test("Unit Price dikecualikan HANYA untuk baris retur-faktur; field wajib lain tetap wajib", () => {
    const base = { "Item No": "A-1", Qty: 1 };
    expect(missingRequiredFieldsForReturnRow(required, { ...base, "Return Type": "INVOICE", "Invoice No": "INV-1" }, mapping)).toEqual([]);
    expect(missingRequiredFieldsForReturnRow(required, { ...base, "Return Type": "NO_INVOICE" }, mapping)).toEqual(["unitPrice"]);
    expect(missingRequiredFieldsForReturnRow(required, { "Return Type": "INVOICE", "Invoice No": "INV-1" }, mapping).sort()).toEqual(["itemNo", "quantity"]);
  });
});

describe("fillReturnPricesFromInvoice", () => {
  test("harga kosong diisi dari baris faktur ber-Item No sama; harga di Excel tidak disentuh; faktur dibaca SEKALI", async () => {
    const entries = [{ itemNo: "A-1", quantity: 2 }, { itemNo: "B-2", quantity: 1, unitPrice: 999 }, { itemNo: "a-1", quantity: 3 }];
    let fetched = 0;
    await fillReturnPricesFromInvoice(payloadOf({}, entries), async (n) => {
      fetched++;
      expect(n).toBe("INV-1");
      return [line(), line({ itemNo: "B-2", unitPrice: 1 })];
    });
    expect(fetched).toBe(1);
    expect(entries.map((e) => e.unitPrice)).toEqual([10000, 999, 10000]);
  });

  test("tidak ada baris dengan harga kosong → faktur TIDAK dibaca sama sekali", async () => {
    let fetched = 0;
    await fillReturnPricesFromInvoice(payloadOf({}, [{ itemNo: "A-1", quantity: 1, unitPrice: 5 }]), async () => {
      fetched++;
      return [];
    });
    expect(fetched).toBe(0);
  });

  test("DISKON baris faktur ikut disalin: persen apa adanya, nominal di-pro-rata (1000 untuk qty 10 → retur qty 4 = 400)", async () => {
    const entries: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: 4 }];
    await fillReturnPricesFromInvoice(payloadOf({}, entries), async () => [line({ discPercent: "10", cashDiscount: 1000 })]);
    expect(entries[0]).toMatchObject({ unitPrice: 10000, itemDiscPercent: "10", itemCashDiscount: 400 });
  });

  test("diskon di Excel (salah satu kolom) → diskon faktur TIDAK disalin (Excel menang), harga tetap diisi", async () => {
    const e1: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: 4, itemDiscPercent: "5" }];
    const e2: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: 4, itemCashDiscount: 100 }];
    const fetchLines = async () => [line({ discPercent: "10", cashDiscount: 1000 })];
    await fillReturnPricesFromInvoice(payloadOf({}, e1), fetchLines);
    await fillReturnPricesFromInvoice(payloadOf({}, e2), fetchLines);
    expect(e1[0]).toMatchObject({ unitPrice: 10000, itemDiscPercent: "5" });
    expect(e1[0]!.itemCashDiscount).toBeUndefined();
    expect(e2[0]).toMatchObject({ unitPrice: 10000, itemCashDiscount: 100 });
    expect(e2[0]!.itemDiscPercent).toBeUndefined();
  });

  test("faktur tanpa diskon → tidak ada field diskon; qty retur tak valid → diskon nominal tidak diisi (tidak NaN)", async () => {
    const a: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: 1 }];
    await fillReturnPricesFromInvoice(payloadOf({}, a), async () => [line()]);
    expect("itemDiscPercent" in a[0]!).toBe(false);
    expect("itemCashDiscount" in a[0]!).toBe(false);
    const b: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: "abc" }];
    await fillReturnPricesFromInvoice(payloadOf({}, b), async () => [line({ cashDiscount: 1000 })]);
    expect(b[0]).toMatchObject({ unitPrice: 10000 });
    expect("itemCashDiscount" in b[0]!).toBe(false);
  });

  test("GAGAL jelas (tidak pernah 0): barang tidak ada di faktur; barang sama dengan harga/diskon berbeda (ambigu); barang sama dengan harga & diskon sama = aman", async () => {
    await expect(fillReturnPricesFromInvoice(payloadOf({}, [{ itemNo: "Z-9", quantity: 1 }]), async () => [line()])).rejects.toThrow('Item "Z-9" tidak ada di faktur "INV-1"');
    await expect(fillReturnPricesFromInvoice(payloadOf({}, [{ itemNo: "A-1", quantity: 1 }]), async () => [line(), line({ unitPrice: 12000 })])).rejects.toThrow(/2× di faktur.*berbeda/);
    await expect(fillReturnPricesFromInvoice(payloadOf({}, [{ itemNo: "A-1", quantity: 1 }]), async () => [line(), line({ discPercent: "5" })])).rejects.toThrow(/berbeda/);
    const ok: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: 1 }];
    await fillReturnPricesFromInvoice(payloadOf({}, ok), async () => [line(), line()]);
    expect(ok[0]!.unitPrice).toBe(10000);
  });

  test("return type bukan INVOICE/INVOICE_DP atau tanpa Invoice No + ada harga kosong → error jelas, faktur tidak dibaca; INVOICE_DP & huruf kecil diterima", async () => {
    for (const p of [payloadOf({ returnType: "DELIVERY" }, [{ itemNo: "A", quantity: 1 }]), payloadOf({ returnType: "RECEIVE" }, [{ itemNo: "A", quantity: 1 }]), payloadOf({ returnType: "NO_INVOICE" }, [{ itemNo: "A", quantity: 1 }]), payloadOf({ invoiceNumber: undefined }, [{ itemNo: "A", quantity: 1 }])]) {
      await expect(fillReturnPricesFromInvoice(p, async () => { throw new Error("tidak boleh dipanggil"); })).rejects.toThrow(/Unit Price wajib diisi/);
    }
    const dp: Record<string, unknown>[] = [{ itemNo: "A-1", quantity: 1 }];
    await fillReturnPricesFromInvoice(payloadOf({ returnType: "invoice_dp" }, dp), async () => [line()]);
    expect(dp[0]!.unitPrice).toBe(10000);
  });

  test("error dari pembaca faktur (tidak ketemu / tidak terbaca) diteruskan apa adanya", async () => {
    await expect(fillReturnPricesFromInvoice(payloadOf({}, [{ itemNo: "A-1", quantity: 1 }]), async () => { throw new Error('Faktur "INV-1" tidak ditemukan di Accurate'); })).rejects.toThrow("tidak ditemukan");
  });
});
