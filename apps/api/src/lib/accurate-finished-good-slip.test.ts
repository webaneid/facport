import { describe, test, expect, afterEach } from "bun:test";
import { resolveWarehouseId, saveFinishedGoodSlip } from "./accurate-finished-good-slip";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 149 — resolveWarehouseId generalisasi findByExactName (accurate-work-order.ts), pola sama resolveBranchId.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const ctx = { host: "https://zeus.accurate.id", accessToken: "at", session: "sess" } as AccurateSessionContext;

function mockAccurate(handler: () => unknown): { url: string }[] {
  const calls: { url: string }[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push({ url: String(url) });
    return new Response(JSON.stringify(handler()), { status: 200 });
  }) as typeof fetch;
  return calls;
}

describe("resolveWarehouseId", () => {
  test("cocok NAMA PERSIS (abaikan huruf besar/kecil)", async () => {
    const calls = mockAccurate(() => ({ s: true, d: [{ id: 3, name: "WH RM" }, { id: 5, name: "WH FG" }] }));
    expect(await resolveWarehouseId(ctx, "wh fg")).toBe(5);
    expect(calls[0]!.url).toContain("/accurate/api/warehouse/list.do");
  });

  test("tidak ketemu → galat jelas, TIDAK membuat gudang baru", async () => {
    mockAccurate(() => ({ s: true, d: [{ id: 3, name: "WH RM" }] }));
    await expect(resolveWarehouseId(ctx, "WH FG")).rejects.toThrow(/Gudang "WH FG" tidak ditemukan/);
  });
});

describe("saveFinishedGoodSlip", () => {
  test("POST finished-good-slip/save.do dengan payload apa adanya", async () => {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ s: true, r: { id: 1, number: "18320" }, d: { id: 1, number: "18320" } }), { status: 200 });
    }) as typeof fetch;
    const result = await saveFinishedGoodSlip(ctx, { branchId: 1 });
    expect(result).toEqual({ id: 1, number: "18320" });
    expect(calls[0]!.url).toBe("https://zeus.accurate.id/accurate/api/finished-good-slip/save.do");
  });
});
