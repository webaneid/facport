import { describe, test, expect } from "bun:test";
import { todayInTimezone, duplicateWarning } from "./production-input";

describe("todayInTimezone", () => {
  test("05.00 WIB tanggal 9 = 8 Okt 22.00 UTC → tetap tanggal 9 (bukan kemarin seperti toISOString)", () => {
    const now = new Date("2026-10-08T22:00:00.000Z");
    expect(todayInTimezone("Asia/Jakarta", now)).toBe("2026-10-09");
    expect(now.toISOString().slice(0, 10)).toBe("2026-10-08");
  });
  test("zona lain mengikuti zonanya", () => {
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-10-09T03:00:00.000Z"))).toBe("2026-10-08");
  });
});

describe("duplicateWarning", () => {
  const now = new Date("2026-10-09T03:10:00.000Z");
  const base = { formulaId: "f1", producedQty: "20.0000", transDate: "2026-10-09", status: "success", createdAt: "2026-10-09T03:07:00.000Z" };
  const candidate = { formulaId: "f1", qty: 20, transDate: "2026-10-09" };
  test("entri serupa 3 menit lalu → peringatan menyebut menit & status", () => {
    const w = duplicateWarning([base], candidate, now)!;
    expect(w).toContain("3 menit lalu");
    expect(w).toContain("berhasil");
  });
  test("tidak ada peringatan: beda formula / qty / tanggal, lewat 10 menit, atau entri sebelumnya gagal", () => {
    expect(duplicateWarning([{ ...base, formulaId: "f2" }], candidate, now)).toBeNull();
    expect(duplicateWarning([{ ...base, producedQty: "21" }], candidate, now)).toBeNull();
    expect(duplicateWarning([{ ...base, transDate: "2026-10-08" }], candidate, now)).toBeNull();
    expect(duplicateWarning([{ ...base, createdAt: "2026-10-09T02:50:00.000Z" }], candidate, now)).toBeNull();
    expect(duplicateWarning([{ ...base, status: "failed" }], candidate, now)).toBeNull();
    expect(duplicateWarning([], candidate, now)).toBeNull();
  });
  test("yang terbaru dipakai bila ada beberapa", () => {
    const older = { ...base, createdAt: "2026-10-09T03:01:00.000Z" };
    expect(duplicateWarning([older, base], candidate, now)).toContain("3 menit lalu");
  });
});
