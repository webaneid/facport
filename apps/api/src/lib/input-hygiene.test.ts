import { describe, expect, test } from "bun:test";
import { cleanCell, cleanRawData, hygieneHint, oddCharsHint, visibleChars } from "./input-hygiene";

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
