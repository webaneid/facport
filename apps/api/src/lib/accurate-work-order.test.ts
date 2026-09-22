import { describe, test, expect, afterEach } from "bun:test";
import { findOrCreateWoPic, resolveBranchId, saveWorkOrder } from "./accurate-work-order";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 147 — lookup cabang (`branchId` REQUIRED, TIDAK auto-create) & PIC (find-or-create) untuk Work Order.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ctx = { host: "https://zeus.accurate.id", accessToken: "at", session: "sess" } as AccurateSessionContext;
type Call = { url: string; method: string; body?: unknown };

function mockAccurate(handler: (call: Call) => unknown): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const call: Call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return new Response(JSON.stringify(handler(call)), { status: 200 });
  }) as typeof fetch;
  return calls;
}

describe("resolveBranchId", () => {
  test("cocok NAMA PERSIS (abaikan huruf besar/kecil) — 'Jakarta' tidak salah cocok ke 'Jakarta Barat'", async () => {
    const calls = mockAccurate(() => ({ s: true, d: [{ id: 9, name: "Jakarta Barat" }, { id: 7, name: "JAKARTA" }] }));
    expect(await resolveBranchId(ctx, " jakarta ")).toBe(7);
    expect(calls[0]!.url).toContain("/accurate/api/branch/list.do");
    expect(calls[0]!.url).toContain("filter.keywords.val=");
  });

  test("tidak ketemu → galat jelas, TIDAK membuat cabang baru (tidak ada POST)", async () => {
    const calls = mockAccurate(() => ({ s: true, d: [{ id: 9, name: "Jakarta Barat" }] }));
    await expect(resolveBranchId(ctx, "Jakarta")).rejects.toThrow(/Cabang "Jakarta" tidak ditemukan/);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("findOrCreateWoPic", () => {
  test("sudah ada → pakai id yang ada, tanpa save", async () => {
    const calls = mockAccurate(() => ({ s: true, d: [{ id: 42, name: "Budi" }] }));
    expect(await findOrCreateWoPic(ctx, "budi")).toBe(42);
    expect(calls).toHaveLength(1);
  });

  test("belum ada → wo-pic/save.do dengan { name } lalu pakai id baru", async () => {
    const calls = mockAccurate((call) => (call.method === "POST" ? { s: true, r: { id: 77 }, d: { id: 77 } } : { s: true, d: [] }));
    expect(await findOrCreateWoPic(ctx, "Sari")).toBe(77);
    const save = calls.find((c) => c.method === "POST")!;
    expect(save.url).toContain("/accurate/api/wo-pic/save.do");
    expect(save.body).toEqual({ name: "Sari" });
  });

  test("save ditolak 'sudah ada data lain' (balapan) → cari ulang, tidak gagal", async () => {
    let lists = 0;
    mockAccurate((call) => {
      if (call.method === "POST") return { s: false, d: ["Sudah ada data lain dengan Nama 'Sari'"] };
      lists += 1;
      return { s: true, d: lists === 1 ? [] : [{ id: 55, name: "Sari" }] };
    });
    expect(await findOrCreateWoPic(ctx, "Sari")).toBe(55);
  });

  test("galat lain dari save.do dilempar ulang", async () => {
    mockAccurate((call) => (call.method === "POST" ? { s: false, d: ["Scope tidak cukup"] } : { s: true, d: [] }));
    await expect(findOrCreateWoPic(ctx, "Sari")).rejects.toThrow(/Scope tidak cukup/);
  });
});

describe("saveWorkOrder", () => {
  test("POST work-order/save.do dengan payload apa adanya", async () => {
    const calls = mockAccurate(() => ({ s: true, r: { id: 5, number: "WO-1" }, d: { id: 5, number: "WO-1" } }));
    const result = await saveWorkOrder(ctx, { transDate: "17/09/2026", branchId: 7 });
    expect(result.id).toBe(5);
    expect(calls[0]!.url).toBe("https://zeus.accurate.id/accurate/api/work-order/save.do");
    expect(calls[0]!.body).toEqual({ transDate: "17/09/2026", branchId: 7 });
  });
});
