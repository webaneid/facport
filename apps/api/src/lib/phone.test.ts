import { describe, test, expect } from "bun:test";
import { normalizePhone, isValidE164, parseContact, hasContactKeys, isContactComplete } from "./phone";

// Kasus normalisasi SAMA dengan `apps/web/lib/phone.test.ts` (paritas dua salinan).
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
  test("menerima format E.164 sah (8–15 digit)", () => {
    expect(isValidE164("+628123456789")).toBe(true);
    expect(isValidE164("+60123456789")).toBe(true);
    expect(isValidE164("+62274123456")).toBe(true); // landline
    expect(isValidE164("+12345678")).toBe(true); // 8 digit = batas bawah
    expect(isValidE164("+123456789012345")).toBe(true); // 15 digit = batas atas
  });

  test("menolak: tanpa +, terlalu pendek/panjang, huruf, spasi, awalan 0", () => {
    expect(isValidE164("628123456789")).toBe(false);
    expect(isValidE164("+1234567")).toBe(false);
    expect(isValidE164("+1234567890123456")).toBe(false);
    expect(isValidE164("+62abc123456")).toBe(false);
    expect(isValidE164("+62 812 3456")).toBe(false);
    expect(isValidE164("+0812345678")).toBe(false);
    expect(isValidE164("")).toBe(false);
  });
});

describe("parseContact", () => {
  const valid = { companyName: "PT Maju Jaya", phone: "08123456789", whatsapp: "08123456789" };

  test("sah → nilai ternormalisasi (E.164, nama dirapikan)", () => {
    const r = parseContact({ companyName: "  PT   Maju   Jaya ", phone: "0812-3456-789", whatsapp: "+6281234567890" });
    expect(r).toEqual({ ok: true, value: { companyName: "PT Maju Jaya", phone: "+628123456789", whatsapp: "+6281234567890" } });
  });

  test("nama perusahaan kosong / hanya spasi / terlalu panjang / bukan string → gagal di companyName", () => {
    expect(parseContact({ ...valid, companyName: "" })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: "   " })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: "a".repeat(201) })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: 123 })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: "a".repeat(200) }).ok).toBe(true);
  });

  test("karakter kontrol / zero-width / penimpa arah (bidi) di nama perusahaan ditolak; huruf non-Latin dan tanda baca biasa tetap boleh", () => {
    expect(parseContact({ ...valid, companyName: "PT\u0000Evil" })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: "PT \u202Eatad" })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: "PT\u200BMaju" })).toEqual({ ok: false, field: "companyName" });
    expect(parseContact({ ...valid, companyName: "PT Maju\tJaya\n" })).toEqual({ ok: true, value: { companyName: "PT Maju Jaya", phone: "+628123456789", whatsapp: "+628123456789" } });
    expect(parseContact({ ...valid, companyName: "CV. Berkah & Sons (Persero) — 株式会社" }).ok).toBe(true);
  });

  test("telepon salah → gagal di phone; WhatsApp salah → gagal di whatsapp", () => {
    expect(parseContact({ ...valid, phone: "abc" })).toEqual({ ok: false, field: "phone" });
    expect(parseContact({ ...valid, phone: "" })).toEqual({ ok: false, field: "phone" });
    expect(parseContact({ ...valid, phone: "+62123" })).toEqual({ ok: false, field: "phone" });
    expect(parseContact({ ...valid, whatsapp: "12" })).toEqual({ ok: false, field: "whatsapp" });
    expect(parseContact({ ...valid, whatsapp: undefined })).toEqual({ ok: false, field: "whatsapp" });
  });

  test("injeksi/karakter aneh ditolak, tidak lolos jadi nomor", () => {
    expect(parseContact({ ...valid, phone: "+62812345678<script>" }).ok).toBe(false);
    expect(parseContact({ ...valid, whatsapp: "0812345678; DROP" }).ok).toBe(false);
  });
});

describe("hasContactKeys", () => {
  test("true bila salah satu kunci kontak ada", () => {
    expect(hasContactKeys({ phone: "" })).toBe(true);
    expect(hasContactKeys({ companyName: undefined })).toBe(true);
    expect(hasContactKeys({ email: "a@b.c", name: "x", whatsapp: "1" })).toBe(true);
  });
  test("false untuk body tanpa kunci kontak / bukan objek", () => {
    expect(hasContactKeys({ email: "a@b.c", password: "x", name: "n" })).toBe(false);
    expect(hasContactKeys(null)).toBe(false);
    expect(hasContactKeys("x")).toBe(false);
  });
});

describe("isContactComplete", () => {
  const ok = { companyName: "PT A", phone: "+628123456789", whatsapp: "+628123456789" };
  test("lengkap bila ketiganya terisi dan nomor E.164 sah", () => {
    expect(isContactComplete(ok)).toBe(true);
  });
  test("tidak lengkap: null/kosong/spasi, atau nomor tidak sah (mis. data lama format lokal)", () => {
    expect(isContactComplete({ companyName: null, phone: null, whatsapp: null })).toBe(false);
    expect(isContactComplete({ ...ok, companyName: "   " })).toBe(false);
    expect(isContactComplete({ ...ok, phone: null })).toBe(false);
    expect(isContactComplete({ ...ok, whatsapp: "" })).toBe(false);
    expect(isContactComplete({ ...ok, phone: "08123456789" })).toBe(false);
    expect(isContactComplete({})).toBe(false);
  });
});
