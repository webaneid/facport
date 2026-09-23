import { describe, test, expect } from "bun:test";
import { escapeXml, str, flag1, num, normDate, reserved, envelope, checkHeaders } from "./shared";

// § Fase 150-151, ADR-0038 — verifikasi kesetaraan LOGIKA (bukan cuma bahasa program) dengan
// `/Users/webane/sites/konverter/tool.html` (baris 457-491). Kasus tepi di bawah SEMUA diverifikasi manual
// terhadap regex/kondisi sumbernya — jangan "perbaiki" hasil yang kelihatan aneh (mis. `num("1.234")` = 1234,
// bukan 1.234) tanpa mengubah juga sumber pembandingnya, itu bukan bug, itu konvensi format Indonesia.
describe("escapeXml", () => {
  test("escape 5 karakter XML, urutan & TIDAK di-escape ganda (& duluan)", () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe("a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;");
  });
  test("null/undefined → string kosong", () => {
    expect(escapeXml(null)).toBe("");
    expect(escapeXml(undefined)).toBe("");
  });
  test("angka/boolean di-stringify apa adanya", () => {
    expect(escapeXml(5)).toBe("5");
  });
});

describe("str", () => {
  test("trim whitespace, null/undefined → string kosong", () => {
    expect(str("  hai  ")).toBe("hai");
    expect(str(null)).toBe("");
    expect(str(undefined)).toBe("");
    expect(str(5)).toBe("5");
  });
});

describe("flag1 — parse boolean gaya Indonesia", () => {
  test.each(["1", "ya", "iya", "y", "yes", "true", "benar", "YA", "Benar"])("%s → 1", (v) => {
    expect(flag1(v)).toBe(1);
  });
  test.each(["0", "tidak", "no", "false", "salah", "", "2"])("%s → 0", (v) => {
    expect(flag1(v)).toBe(0);
  });
});

describe("num — parse angka format Indonesia", () => {
  test("angka JS asli dikembalikan apa adanya (bukan string)", () => {
    expect(num(5)).toBe(5);
    expect(num(2.5)).toBe(2.5);
  });
  test("null/undefined/string kosong → NaN", () => {
    expect(num(null)).toBeNaN();
    expect(num(undefined)).toBeNaN();
    expect(num("")).toBeNaN();
  });
  test("koma SATU-SATUNYA pemisah → desimal gaya Indonesia", () => {
    expect(num("2,5")).toBe(2.5);
  });
  test("titik DAN koma ada → titik = ribuan, koma = desimal (\"3.500,75\")", () => {
    expect(num("3.500,75")).toBe(3500.75);
  });
  test("cuma titik, pola ribuan 3-digit (\"2.500\", \"3.500.000\") → ribuan, BUKAN desimal", () => {
    expect(num("2.500")).toBe(2500);
    expect(num("3.500.000")).toBe(3500000);
  });
  test("cuma titik, BUKAN pola ribuan (\"2.5\") → tetap desimal (parseFloat apa adanya)", () => {
    expect(num("2.5")).toBe(2.5);
  });
  test(">1 koma tanpa titik → pemisah ribuan gaya Inggris (\"1,234,567\")", () => {
    expect(num("1,234,567")).toBe(1234567);
  });
  test("spasi di dalam angka dihapus (\"1 000\")", () => {
    expect(num("1 000")).toBe(1000);
  });
});

describe("normDate — normalisasi tanggal → YYYY-MM-DD", () => {
  test("null/undefined/string kosong → null", () => {
    expect(normDate(null)).toBeNull();
    expect(normDate(undefined)).toBeNull();
    expect(normDate("")).toBeNull();
  });
  test("string ISO (YYYY-MM-DD, termasuk tanpa zero-pad) → dinormalisasi zero-pad", () => {
    expect(normDate("2026-01-17")).toBe("2026-01-17");
    expect(normDate("2026-1-7")).toBe("2026-01-07");
  });
  test("string DD/MM/YYYY atau DD-MM-YYYY → dikonversi ke YYYY-MM-DD", () => {
    expect(normDate("17/01/2026")).toBe("2026-01-17");
    expect(normDate("17-01-2026")).toBe("2026-01-17");
  });
  test("format tidak dikenal → null", () => {
    expect(normDate("bukan tanggal")).toBeNull();
    expect(normDate("2026/01/17")).toBeNull(); // slash TAPI urutan ISO (YYYY/MM/DD) — regex sumber tidak menangani ini
  });
  test("Excel serial number (hari sejak 1899-12-30) → tanggal UTC benar", () => {
    // § serial 46000 = 2025-12-09 (diverifikasi via rumus legacy: new Date(Math.round((46000-25569)*86400*1000)), UTC)
    expect(normDate(46000)).toBe("2025-12-09");
  });
  test("Date object (dianggap sudah lokal, dikoreksi +30 menit drift SheetJS) → tanggal lokal benar", () => {
    expect(normDate(new Date(2026, 0, 17, 0, 0, 0))).toBe("2026-01-17");
  });
});

describe("reserved", () => {
  test("10x <ITEMRESERVEDn/> berurutan 1-10", () => {
    expect(reserved()).toBe(Array.from({ length: 10 }, (_, i) => `<ITEMRESERVED${i + 1}/>`).join(""));
  });
});

describe("envelope", () => {
  test("bungkus branch (escaped) + inner XML dalam struktur NMEXML/TRANSACTIONS", () => {
    const xml = envelope("HO & Cabang", "<FOO/>");
    expect(xml).toBe('<?xml version="1.0"?>\r\n<NMEXML EximID="1" BranchCode="HO &amp; Cabang" ACCOUNTANTCOPYID=""><TRANSACTIONS OnError="CONTINUE"><FOO/></TRANSACTIONS></NMEXML>\r\n');
  });
});

describe("checkHeaders", () => {
  test("rows kosong → [] (tidak ada yang bisa dicek)", () => {
    expect(checkHeaders([], ["A", "B"])).toEqual([]);
  });
  test("semua kolom wajib ada → []", () => {
    expect(checkHeaders([{ A: 1, B: 2, C: 3 }], ["A", "B"])).toEqual([]);
  });
  test("kolom wajib hilang → 1 pesan error berisi nama kolom yang hilang", () => {
    const result = checkHeaders([{ A: 1 }], ["A", "B", "C"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("B, C");
  });
});
