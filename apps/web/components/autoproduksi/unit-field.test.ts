import { describe, test, expect } from "bun:test";
import { unitOptionLabel } from "./unit-field";

describe("unitOptionLabel", () => {
  test("satuan dasar tampil polos, satuan lain menyertakan rasio ke satuan dasar", () => {
    expect(unitOptionLabel({ name: "KG", ratio: 1 }, "KG")).toBe("KG");
    expect(unitOptionLabel({ name: "Pouch", ratio: 10 }, "KG")).toBe("Pouch (= 10 KG)");
  });
});
