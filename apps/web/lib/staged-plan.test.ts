import { describe, test, expect } from "bun:test";
import { formatStagedEstimate, extractStagedPlan } from "./staged-plan";

describe("formatStagedEstimate", () => {
  test("detik, menit, jam", () => {
    expect(formatStagedEstimate(10)).toBe("sekitar 10 detik");
    expect(formatStagedEstimate(0)).toBe("sekitar 1 detik");
    expect(formatStagedEstimate(900)).toBe("sekitar 15 menit");
    expect(formatStagedEstimate(3.5 * 3600)).toBe("sekitar 3,5 jam");
    expect(formatStagedEstimate(30 * 3600)).toBe("sekitar 30 jam");
  });
});

describe("extractStagedPlan", () => {
  const plan = { items: [{ number: "A", rows: 300, entries: 300, steps: 1, estimatedSeconds: 47 }], estimatedSeconds: 47, chunkEntries: 500, thresholdRows: 200 };
  test("kode benar + rencana berisi → rencana", () => {
    expect(extractStagedPlan({ code: "STAGED_APPROVAL_REQUIRED", plan })).toEqual(plan);
  });
  test("kode lain / rencana kosong / tanpa nilai → null", () => {
    expect(extractStagedPlan({ code: "ACCURATE_SCOPE_MISSING" })).toBeNull();
    expect(extractStagedPlan({ code: "STAGED_APPROVAL_REQUIRED", plan: { ...plan, items: [] } })).toBeNull();
    expect(extractStagedPlan(undefined)).toBeNull();
  });
});
