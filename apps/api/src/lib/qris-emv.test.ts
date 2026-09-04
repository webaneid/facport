import { describe, test, expect } from "bun:test";
import { buildDynamicQris, isValidQrisPayload } from "./qris-emv";

// § Fase 16 — fixture QRIS statis dibangun PROGRAMATIS (bukan hand-typed
// hex), supaya length-prefix TLV selalu benar by construction. Struktur
// field sesuai EMV spec QRIS Indonesia publik: 00=Payload Format,
// 01=Point of Initiation, 26=Merchant Account Info, 52=MCC,
// 53=Currency, 58=Country, 59=Merchant Name, 60=City, 61=Postal Code,
// 62=Additional Data (sub-tag 05=Reference), 63=CRC (placeholder, TIDAK
// perlu valid kriptografis — `buildDynamicQris` strip via regex, bukan
// verifikasi checksum).
function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

function buildStaticFixture(): string {
  const merchantAccountInfo = tlv("00", "ID.CO.QRIS.WWW") + tlv("15", "ID10200123456") + tlv("03", "UMI");
  const additionalData = tlv("05", "OLDREF");
  return [
    tlv("00", "01"), // Payload Format Indicator
    tlv("01", "11"), // Point of Initiation Method — statis
    tlv("26", merchantAccountInfo),
    tlv("52", "5411"), // MCC
    tlv("53", "360"), // Currency IDR
    tlv("58", "ID"), // Country
    tlv("59", "Jakarta"), // Merchant Name
    tlv("60", "Jakarta"), // City
    tlv("61", "12345"), // Postal Code
    tlv("62", additionalData),
    tlv("63", "ABCD"), // CRC placeholder
  ].join("");
}

const STATIC_QRIS = buildStaticFixture();

describe("buildDynamicQris", () => {
  test("ubah Tag 01 dari statis (11) ke dinamis (12)", () => {
    const result = buildDynamicQris(STATIC_QRIS, 150234, "INV-TEST-0001");
    expect(result).toContain(tlv("01", "12"));
  });

  test("inject Tag 54 (nominal) dengan amount yang diminta", () => {
    const result = buildDynamicQris(STATIC_QRIS, 150234, "INV-TEST-0001");
    expect(result).toContain(tlv("54", "150234"));
  });

  test("amount di-round ke integer (QRIS tidak dukung desimal rupiah)", () => {
    const result = buildDynamicQris(STATIC_QRIS, 150234.7, "REF");
    expect(result).toContain(tlv("54", "150235")); // Math.round(150234.7) = 150235
  });

  test("inject Tag 62 sub-tag 05 (reference label), MENGGANTI yang lama, dipotong maks 25 karakter", () => {
    const longRef = "A".repeat(40);
    const result = buildDynamicQris(STATIC_QRIS, 10000, longRef);
    const expectedSub = tlv("05", "A".repeat(25));
    expect(result).toContain(tlv("62", expectedSub));
    expect(result).not.toContain("OLDREF"); // reference lama harus TERGANTI, bukan ditambah
  });

  test("hasil akhir selalu diakhiri CRC 4 hex char valid (tag 63, length 04)", () => {
    const result = buildDynamicQris(STATIC_QRIS, 50000, "REF");
    expect(result).toMatch(/6304[0-9A-F]{4}$/);
  });

  test("CRC hasil BEDA dari CRC placeholder input (benar-benar dihitung ulang, bukan disalin)", () => {
    const result = buildDynamicQris(STATIC_QRIS, 50000, "REF");
    expect(result.endsWith("ABCD")).toBe(false);
  });

  test("field lain (merchant name, MCC, dst) tetap utuh tidak berubah", () => {
    const result = buildDynamicQris(STATIC_QRIS, 50000, "REF");
    expect(result).toContain(tlv("59", "Jakarta")); // Merchant Name tidak disentuh
    expect(result).toContain(tlv("52", "5411")); // MCC tidak disentuh
  });

  test("payload tanpa Tag 62 sama sekali — tag 62 baru ditambahkan di akhir", () => {
    const withoutTag62 = [
      tlv("00", "01"),
      tlv("01", "11"),
      tlv("52", "5411"),
      tlv("53", "360"),
      tlv("58", "ID"),
      tlv("59", "Jakarta"),
      tlv("63", "ABCD"),
    ].join("");
    const result = buildDynamicQris(withoutTag62, 10000, "REFNEW");
    expect(result).toContain(tlv("62", tlv("05", "REFNEW")));
  });

  test("2 kali panggil dengan input SAMA menghasilkan output SAMA (deterministik)", () => {
    const a = buildDynamicQris(STATIC_QRIS, 75000, "SAME-REF");
    const b = buildDynamicQris(STATIC_QRIS, 75000, "SAME-REF");
    expect(a).toBe(b);
  });

  // § security review 2026-09-04 (Medium) — payload EMV TANPA Tag 53
  // MAUPUN Tag 54 (malformed/salah salin admin) SEBELUMNYA lolos tanpa
  // nominal ter-inject sama sekali — QR tetap ditandai "dinamis" (Tag
  // 01="12") tapi nominal tidak pernah dikunci, customer diam-diam
  // harus ketik manual TANPA tahu itu. WAJIB throw, bukan silent.
  test("throw kalau payload TIDAK punya Tag 53 maupun Tag 54 (nominal tidak bisa ter-inject)", () => {
    const withoutAmountOrCurrency = [tlv("00", "01"), tlv("01", "11"), tlv("52", "5411"), tlv("58", "ID"), tlv("59", "Jakarta"), tlv("63", "ABCD")].join("");
    expect(() => buildDynamicQris(withoutAmountOrCurrency, 50000, "REF")).toThrow();
  });
});

describe("isValidQrisPayload", () => {
  test("terima payload yang mulai '0002' dan diakhiri CRC valid", () => {
    expect(isValidQrisPayload(STATIC_QRIS)).toBe(true);
  });

  test("tolak payload tanpa prefix '0002'", () => {
    expect(isValidQrisPayload("99990102" + STATIC_QRIS.slice(8))).toBe(false);
  });

  test("tolak payload tanpa CRC di akhir", () => {
    expect(isValidQrisPayload(STATIC_QRIS.slice(0, -8))).toBe(false);
  });
});
