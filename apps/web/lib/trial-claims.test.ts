import { describe, test, expect } from "bun:test";
import { parseExemptDbIds, formatExemptDbIds, trialClaimReleaseError } from "./trial-claims";

describe("parseExemptDbIds", () => {
  test("memisah koma/spasi/baris baru, membuang duplikat, memisahkan yang tidak valid", () => {
    expect(parseExemptDbIds("2672480, 3066559\n3066559;abc_1  bad!id")).toEqual({ ids: ["2672480", "3066559", "abc_1"], invalid: ["bad!id"] });
  });
  test("kosong → daftar kosong", () => {
    expect(parseExemptDbIds("  \n ")).toEqual({ ids: [], invalid: [] });
  });
});

describe("formatExemptDbIds", () => {
  test("array → satu id per baris; nilai lain → kosong", () => {
    expect(formatExemptDbIds(["1", 2])).toBe("1\n2");
    expect(formatExemptDbIds(undefined)).toBe("");
    expect(formatExemptDbIds("x")).toBe("");
  });
});

describe("trialClaimReleaseError", () => {
  test("memetakan kode dan punya fallback", () => {
    expect(trialClaimReleaseError("CLAIM_ALREADY_RELEASED")).toContain("sudah dilepas");
    expect(trialClaimReleaseError("APA_SAJA")).toContain("Gagal");
    expect(trialClaimReleaseError(undefined)).toContain("Gagal");
  });
});
