import { describe, expect, test } from "bun:test";
import { normalizeAccurateNo } from "./accurate-no";

describe("normalizeAccurateNo", () => {
  test("membuang spasi di ujung/depan", () => {
    expect(normalizeAccurateNo("CUST IN ")).toBe("CUST IN");
    expect(normalizeAccurateNo("  C.001")).toBe("C.001");
  });
  test("membuang non-breaking space & zero-width di ujung", () => {
    expect(normalizeAccurateNo("C.001 ")).toBe("C.001");
    expect(normalizeAccurateNo("﻿C.001​")).toBe("C.001");
  });
  test("spasi di tengah tidak diubah; angka jadi string; null jadi kosong", () => {
    expect(normalizeAccurateNo("CUST IN 01")).toBe("CUST IN 01");
    expect(normalizeAccurateNo(123)).toBe("123");
    expect(normalizeAccurateNo(null)).toBe("");
  });
});
