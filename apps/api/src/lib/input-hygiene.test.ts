import { describe, expect, test } from "bun:test";
import { cleanCell, cleanRawData, hygieneHint, isKeyField, normalizeKeyColumns, normalizeKeyValue, oddCharsHint, visibleChars, makeRowPreparer } from "./input-hygiene";

describe("cleanCell", () => {
  test("spasi di awal/akhir dipangkas", () => {
    expect(cleanCell("CUST IN ")).toBe("CUST IN");
    expect(cleanCell("  A ")).toBe("A");
  });
  test("NBSP & spasi Unicode lain -> spasi biasa, di mana pun posisinya", () => {
    expect(cleanCell("A\u00a0B")).toBe("A B");
    expect(cleanCell("A\u2009B\u3000C")).toBe("A B C");
    expect(cleanCell("\u00a0A\u00a0")).toBe("A");
  });
  test("zero-width, BOM, soft hyphen, bidi dibuang, juga di tengah", () => {
    expect(cleanCell("CU\u200bST")).toBe("CUST");
    expect(cleanCell("\ufeffC.001")).toBe("C.001");
    expect(cleanCell("C\u00ad.001\u200f")).toBe("C.001");
    expect(cleanCell("A\u202eB")).toBe("AB");
  });
  test("karakter kontrol dibuang, tab/baris baru di tengah dipertahankan", () => {
    expect(cleanCell("A\u0000B\u001fC")).toBe("ABC");
    expect(cleanCell("baris1\nbaris2")).toBe("baris1\nbaris2");
    expect(cleanCell("a\tb")).toBe("a\tb");
    expect(cleanCell("x\u2028y")).toBe("x\ny");
  });
  test("karakter TERLIHAT tidak diubah (en dash, kutip lengkung, huruf Cyrillic)", () => {
    expect(cleanCell("C\u2013001")).toBe("C\u2013001");
    expect(cleanCell("\u201ctes\u201d")).toBe("\u201ctes\u201d");
    expect(cleanCell("\u0421-001")).toBe("\u0421-001");
  });
  test("spasi ganda di tengah TIDAK dikolaps (itu lapis 2, hanya kolom kunci)", () => {
    expect(cleanCell("A  B")).toBe("A  B");
  });
  test("bukan string: tidak berubah (angka, tanggal, null)", () => {
    const d = new Date(0);
    expect(cleanCell(5)).toBe(5);
    expect(cleanCell(d)).toBe(d);
    expect(cleanCell(null)).toBeNull();
  });
  test("idempoten", () => {
    const once = cleanCell("\u00a0A\u200b B ");
    expect(cleanCell(once)).toBe(once);
  });
});

describe("cleanRawData", () => {
  test("kunci dan nilai dibersihkan, angka dan kosong dibiarkan", () => {
    expect(cleanRawData({ " Cust No\u200b": "CUST IN ", Qty: 3, Kosong: "" })).toEqual({ "Cust No": "CUST IN", Qty: 3, Kosong: "" });
  });
});

describe("visibleChars / hygieneHint", () => {
  test("menampakkan spasi, NBSP, dan zero-width", () => {
    expect(visibleChars("CUST IN ")).toBe("CUST\u2420IN\u2420");
    expect(visibleChars("A\u00a0B")).toBe("A\u237dB");
    expect(visibleChars("A\u200bB")).toBe("A<U+200B>B");
  });
  test("petunjuk hanya muncul kalau ada karakter bermasalah", () => {
    expect(hygieneHint("C.001")).toBe("");
    expect(hygieneHint("C.001 ")).toContain("C.001\u2420");
  });
});

describe("oddCharsHint", () => {
  test("kosong untuk nilai biasa", () => {
    expect(oddCharsHint("C.001")).toBe("");
  });
  test("menyebut karakter non-ASCII beserta kode-nya", () => {
    expect(oddCharsHint("\u0421-001")).toContain("U+0421");
    expect(oddCharsHint("C\u2013001")).toContain("U+2013");
  });
  test("menyebut spasi ganda", () => {
    expect(oddCharsHint("CUST  IN")).toContain("spasi ganda");
  });
});

describe("isKeyField (lapis 2)", () => {
  test("kode/nama master & nomor rujukan = kunci", () => {
    for (const f of ["customerNo", "vendorNo", "itemNo", "rmItemNo", "expenseAccountNo", "lineAccountNo", "bankNo", "warehouseName", "departmentName", "lineDepartmentName", "deptName", "branchName", "projectNo", "itemUnitName", "paymentTermName", "currencyCode", "salesOrderNumber", "itemSalesOrderNo", "reverseInvoiceNumber", "invoiceNumber", "rmUnit"]) {
      expect(isKeyField(f)).toBe(true);
    }
  });
  test("nomor milik dokumen sendiri & teks bebas BUKAN kunci", () => {
    for (const f of ["number", "transNo", "billNumber", "poNumber", "paymentNumber", "receiptNumber", "journalNumber", "taxNumber", "chequeNo", "itemSerialNo", "description", "itemName", "expenseName", "itemNotes", "toAddress", "quantity", "unitPrice"]) {
      expect(isKeyField(f)).toBe(false);
    }
  });
});

describe("normalizeKeyValue / normalizeKeyColumns (lapis 2)", () => {
  test("huruf & angka lebar penuh -> biasa (NFKC)", () => {
    expect(normalizeKeyValue("\uff23\uff0e\uff10\uff10\uff11")).toBe("C.001");
  });
  test("spasi ganda & baris baru di tengah -> satu spasi", () => {
    expect(normalizeKeyValue("CUST   IN")).toBe("CUST IN");
    expect(normalizeKeyValue("CUST\nIN\t01")).toBe("CUST IN 01");
  });
  test("hanya kolom yang dipetakan ke field kunci yang disentuh", () => {
    const raw = { "Cust No": "C  001", Description: "dua  spasi dipertahankan", "Trans No": "INV  1", Qty: 5 };
    const mapping = { "Cust No": "customerNo", Description: "description", "Trans No": "number", Qty: "quantity" };
    expect(normalizeKeyColumns(raw, mapping)).toEqual({ "Cust No": "C 001", Description: "dua  spasi dipertahankan", "Trans No": "INV  1", Qty: 5 });
  });
  test("tidak mengubah objek asli", () => {
    const raw = { "Cust No": "C  001" };
    normalizeKeyColumns(raw, { "Cust No": "customerNo" });
    expect(raw["Cust No"]).toBe("C  001");
  });
});

describe("makeRowPreparer (Fase 215) - hasil identik dengan pipeline lama untuk kolom yang dipetakan, kolom lain dibuang", () => {
  const mapping = { "Customer No": "customerNo", "Item No": "itemNo", Quantity: "quantity", "Unit Price": "unitPrice", "Catatan Baris": "itemNotes" };
  const raw = {
    "Customer No": "CUST\u00a0IN  ",
    "Item No": "BRG\u200b-1 ",
    Quantity: 3,
    "Unit Price": " 1000 ",
    "Catatan Baris": " catatan\u00a0bebas ",
    "Kolom Tak Dipetakan 1": "isi panjang yang tidak dipakai",
    "Kolom Tak Dipetakan 2": 123,
  };

  test("setiap kolom yang dipetakan SAMA PERSIS dengan normalizeKeyColumns(cleanRawData(...))", () => {
    const legacy = normalizeKeyColumns(cleanRawData(raw), mapping);
    const prepared = makeRowPreparer(mapping)(raw);
    for (const column of Object.keys(mapping)) expect(prepared[column]).toEqual(legacy[column]);
    expect(prepared["Customer No"]).toBe("CUST IN"); // kolom kunci dinormalkan
    expect(prepared["Item No"]).toBe("BRG-1");
    expect(prepared["Catatan Baris"]).toBe("catatan bebas"); // bukan kolom kunci: dibersihkan saja, tidak dinormalkan ke satu spasi
    expect(prepared.Quantity).toBe(3);
  });

  test("kolom yang tidak dipetakan dibuang", () => {
    const prepared = makeRowPreparer(mapping)(raw);
    expect(Object.keys(prepared).sort()).toEqual(Object.keys(mapping).sort());
    expect("Kolom Tak Dipetakan 1" in prepared).toBe(false);
  });

  test("nama kolom dengan karakter tak terlihat tetap cocok dengan pemetaan setelah dibersihkan", () => {
    const prepared = makeRowPreparer(mapping)({ "Item\u00a0No ": "X-1", "Customer No": "C" } as Record<string, unknown>);
    expect(prepared["Item No"]).toBe("X-1");
  });

  test("kolom dipetakan yang tidak ada di baris tidak muncul (sama dengan pipeline lama)", () => {
    const prepared = makeRowPreparer(mapping)({ "Customer No": "C-1" });
    expect(prepared).toEqual({ "Customer No": "C-1" });
  });

  test("pemetaan KOSONG → perilaku lama persis (semua kolom dipertahankan)", () => {
    const prepared = makeRowPreparer({})(raw);
    expect(prepared).toEqual(normalizeKeyColumns(cleanRawData(raw), {}));
    expect(prepared["Kolom Tak Dipetakan 1"]).toBe("isi panjang yang tidak dipakai");
  });

  test("memori: baris 67 kolom dengan 7 dipetakan → hasil hanya 7 kunci", () => {
    const wide: Record<string, unknown> = {};
    const m: Record<string, string> = {};
    for (let i = 0; i < 67; i++) wide[`Kolom ${i}`] = `isi-${i}`;
    for (let i = 0; i < 7; i++) m[`Kolom ${i}`] = `field${i}`;
    expect(Object.keys(makeRowPreparer(m)(wide)).length).toBe(7);
  });
});
