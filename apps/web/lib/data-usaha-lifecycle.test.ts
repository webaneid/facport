import { describe, test, expect } from "bun:test";
import { blockerText, lifecycleError, archiveDaysLeft } from "./data-usaha-lifecycle";

describe("data-usaha-lifecycle (web)", () => {
  test("blockerText menyebut jumlah dan langkahnya", () => {
    expect(blockerText({ code: "ACTIVE_SEAT", count: 2 })).toContain("2 User Tambahan");
    expect(blockerText({ code: "ACTIVE_SUBSCRIPTION", count: 1 })).toContain("1 langganan");
  });
  test("lifecycleError memetakan kode dan punya fallback", () => {
    expect(lifecycleError("ARCHIVE_EXPIRED")).toContain("30 hari");
    expect(lifecycleError("APA_SAJA")).toContain("Gagal");
    expect(lifecycleError(undefined)).toContain("Gagal");
  });
  test("archiveDaysLeft menghitung sisa hari dan tidak negatif", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    expect(archiveDaysLeft("2026-02-20T00:00:00Z", now)).toBe(21); // 9 hari berlalu (Februari 2026 = 28 hari)
    expect(archiveDaysLeft("2026-01-01T00:00:00Z", now)).toBe(0);
  });
});
