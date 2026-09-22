import { describe, test, expect, afterEach } from "bun:test";
import { saveMaterialSlip } from "./accurate-material-slip";
import type { AccurateSessionContext } from "./accurate-session";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const ctx = { host: "https://zeus.accurate.id", accessToken: "at", session: "sess" } as AccurateSessionContext;

describe("saveMaterialSlip", () => {
  test("POST material-slip/save.do dengan payload apa adanya", async () => {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ s: true, r: { id: 9, number: "MS-1" }, d: { id: 9, number: "MS-1" } }), { status: 200 });
    }) as typeof fetch;
    const result = await saveMaterialSlip(ctx, { transDate: "02/02/2026", materialSlipType: "ITEM_PICK" });
    expect(result).toEqual({ id: 9, number: "MS-1" });
    expect(calls[0]!.url).toBe("https://zeus.accurate.id/accurate/api/material-slip/save.do");
    expect(calls[0]!.body).toEqual({ transDate: "02/02/2026", materialSlipType: "ITEM_PICK" });
  });
});
