import { describe, test, expect } from "bun:test";
import { parseQuantityInput } from "./parse-quantity";

describe("parseQuantityInput", () => {
  test("koma dan titik desimal sama-sama diterima", () => {
    expect(parseQuantityInput("0,5")).toBe(0.5);
    expect(parseQuantityInput("0.5")).toBe(0.5);
    expect(parseQuantityInput(" 12 ")).toBe(12);
    expect(parseQuantityInput("0.8000")).toBe(0.8);
  });

  test("nol, kosong, huruf, dan format ambigu ditolak (null)", () => {
    for (const bad of ["", "0", "0,0", "abc", "1.000,5", "1,2,3", "-1", ",5"]) expect(parseQuantityInput(bad)).toBeNull();
  });
});
