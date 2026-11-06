import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { findOrCreateDataClassification } from "./accurate-data-classification";
import type { AccurateSessionContext } from "./accurate-session";

// Laporan client 2026-11-06: operator tanpa hak "Buat Kategori Keuangan" menggagalkan seluruh faktur.
const ctx = (): AccurateSessionContext => ({ accessToken: "t", session: `s-${Math.random()}`, host: "https://stub.accurate.test" });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

let saveReply: unknown;
let saves: number;
let restore: () => void;

beforeEach(() => {
  saves = 0;
  saveReply = { s: true, r: { id: 1, name: "X" } };
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: unknown) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/list.do")) return json({ s: true, d: [] }); // pencarian tidak menemukan
    if (path.endsWith("/save.do")) { saves++; return json(saveReply); }
    return json({ s: false, d: ["tidak dikenal"] });
  }) as unknown as typeof fetch);
  restore = () => spy.mockRestore();
});
afterEach(() => restore());

describe("findOrCreateDataClassification — hak akses operator", () => {
  test("pembuatan ditolak karena TIDAK ADA HAK → tidak melempar (faktur tetap dikirim, Accurate yang memvalidasi)", async () => {
    saveReply = { s: false, d: ["Anda tidak memiliki hak Buat Kategori Keuangan"] };
    await expect(findOrCreateDataClassification(ctx(), 1, "Corporate")).resolves.toBeUndefined();
    expect(saves).toBe(1);
  });

  test("galat LAIN saat membuat tetap dilempar (tidak ditelan)", async () => {
    saveReply = { s: false, d: ["Nama terlalu panjang"] };
    await expect(findOrCreateDataClassification(ctx(), 1, "Corporate")).rejects.toThrow(/terlalu panjang/);
  });

  test("hak ada → kategori baru dibuat dan dikembalikan", async () => {
    const r = await findOrCreateDataClassification(ctx(), 1, "Corporate");
    expect(r).toEqual({ id: 1, name: "X" });
  });
});
