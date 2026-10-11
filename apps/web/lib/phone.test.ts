import { describe, test, expect } from "bun:test";
import { normalizePhone, isValidE164, displayPhone, toWaDigits, waLink } from "./phone";

// Kasus normalisasi SAMA dengan `apps/api/src/lib/phone.test.ts` (paritas dua salinan).
describe("normalizePhone", () => {
  test.each([
    ["08123456789", "+628123456789"],
    ["+628123456789", "+628123456789"],
    ["628123456789", "+628123456789"],
    ["8123456789", "+628123456789"],
    ["0812-3456-789", "+628123456789"],
    ["(0812) 3456 789", "+628123456789"],
    ["  +60 12-345 6789 ", "+60123456789"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
  test("kosong/null/undefined → null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("isValidE164", () => {
  test("menerima 8–15 digit dengan +", () => {
    for (const v of ["+628123456789", "+60123456789", "+62274123456", "+12345678", "+123456789012345"]) expect(isValidE164(v)).toBe(true);
  });
  test("menolak tanpa +, terlalu pendek/panjang, huruf, spasi, awalan 0", () => {
    for (const v of ["628123456789", "+1234567", "+1234567890123456", "+62abc123456", "+62 812 3456", "+0812345678", ""]) expect(isValidE164(v)).toBe(false);
  });
});

describe("displayPhone", () => {
  test("Indonesia dilokalkan, internasional apa adanya, kosong → em dash", () => {
    expect(displayPhone("+628123456789")).toBe("08123456789");
    expect(displayPhone("+60123456789")).toBe("+60123456789");
    expect(displayPhone(null)).toBe("—");
    expect(displayPhone("")).toBe("—");
  });
});

describe("toWaDigits & waLink", () => {
  test("dari E.164 asli → digit tanpa + (kode negara TIDAK hilang)", () => {
    expect(toWaDigits("+628123456789")).toBe("628123456789");
    expect(waLink("+628123456789")).toBe("https://wa.me/628123456789");
    expect(waLink("+60123456789")).toBe("https://wa.me/60123456789");
  });
  test("regresi bug Jalajogja: hasil displayPhone (08…) dinormalisasi ulang jadi 62…, bukan wa.me/0812…", () => {
    expect(toWaDigits(displayPhone("+628123456789"))).toBe("628123456789");
  });
  test("nomor tidak sah / kosong → tidak ada tautan (cegah tautan rusak atau suntikan)", () => {
    expect(waLink(null)).toBeNull();
    expect(waLink("")).toBeNull();
    expect(waLink("abc")).toBeNull();
    expect(waLink("+62123")).toBeNull();
    expect(waLink("+62812345678<script>")).toBeNull();
  });
});
