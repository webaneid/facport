import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { findOrCreateItem } from "./accurate-item";
import { findOrCreateCustomer } from "./accurate-customer";
import { findOrCreateVendor } from "./accurate-vendor";
import { lookupCacheSize, parseLookupCacheEnabled } from "./accurate-lookup-cache";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 215 — cache pencarian positif per sesi Accurate. Semua panggilan ke Accurate di-stub di `fetch`; yang dihitung = JUMLAH permintaan.
const newCtx = (): AccurateSessionContext => ({ accessToken: "t", session: `s-${Math.random()}`, host: "https://stub.accurate.test" });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

type Call = { path: string; method: string; body: unknown };
let calls: Call[];
let existing: Record<string, { id: number; no?: string; name: string }>; // kunci = "<jenis>:<kode huruf kecil>"
let restore: () => void;

beforeEach(() => {
  calls = [];
  existing = {};
  delete process.env.ACCURATE_LOOKUP_CACHE;
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/accurate/api/", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method: init?.method ?? "GET", body });
    const kind = path.split("/")[0]!;
    if (path.endsWith("/list.do")) {
      const hit = existing[`${kind}:${(url.searchParams.get("filter.no.val") ?? "").toLowerCase()}`];
      return json({ s: true, d: hit ? [hit] : [] });
    }
    if (path.endsWith("/save.do")) {
      const id = body?.id ?? 900 + calls.length;
      return json({ s: true, r: { id, name: body?.name ?? "baru", no: body?.no ?? body?.customerNo ?? body?.vendorNo } });
    }
    return json({ s: false, d: ["tidak dikenal"] });
  }) as unknown as typeof fetch);
  restore = () => spy.mockRestore();
});
afterEach(() => {
  restore();
  delete process.env.ACCURATE_LOOKUP_CACHE;
});

const lists = (kind: string) => calls.filter((c) => c.path === `${kind}/list.do`).length;
const saves = (kind: string) => calls.filter((c) => c.path === `${kind}/save.do`).length;

describe("cache pencarian barang", () => {
  test("barang yang sama di faktur berikutnya (sesi sama) TIDAK dicari ulang; huruf besar/kecil & spasi ujung dianggap sama", async () => {
    const ctx = newCtx();
    existing["item:brg-1"] = { id: 1, no: "BRG-1", name: "Barang 1" };
    await findOrCreateItem(ctx, "BRG-1", {});
    await findOrCreateItem(ctx, "BRG-1", {});
    await findOrCreateItem(ctx, " brg-1 ", {});
    expect(lists("item")).toBe(1);
    expect(lookupCacheSize(ctx)).toBe(1);
  });

  test("sesi BERBEDA tidak berbagi cache (tidak bocor antar job/pelanggan)", async () => {
    existing["item:brg-1"] = { id: 1, no: "BRG-1", name: "Barang 1" };
    await findOrCreateItem(newCtx(), "BRG-1", {});
    await findOrCreateItem(newCtx(), "BRG-1", {});
    expect(lists("item")).toBe(2);
  });

  test("'tidak ketemu' TIDAK dicache: gagal karena nama kosong → panggilan berikutnya mencari lagi; barang yang kemudian dibuat langsung di-cache", async () => {
    const ctx = newCtx();
    await expect(findOrCreateItem(ctx, "BARU-1", {})).rejects.toThrow(/belum ada di Accurate/);
    expect(lookupCacheSize(ctx)).toBe(0);
    await expect(findOrCreateItem(ctx, "BARU-1", {})).rejects.toThrow(/belum ada di Accurate/);
    expect(lists("item")).toBe(2);
    await findOrCreateItem(ctx, "BARU-1", { name: "Barang Baru", unit1Name: "Pcs" });
    await findOrCreateItem(ctx, "BARU-1", { name: "Barang Baru", unit1Name: "Pcs" });
    expect(saves("item")).toBe(1);
    expect(lists("item")).toBe(3); // 2 gagal + 1 sebelum membuat; panggilan terakhir dari cache
  });

  test("5 grup paralel dengan barang yang sama → hanya 1 pencarian (kunci per data master + cache)", async () => {
    const ctx = newCtx();
    existing["item:brg-1"] = { id: 1, no: "BRG-1", name: "Barang 1" };
    await Promise.all(Array.from({ length: 5 }, () => findOrCreateItem(ctx, "BRG-1", {})));
    expect(lists("item")).toBe(1);
  });

  test("dimatikan lewat env ACCURATE_LOOKUP_CACHE=0 → perilaku lama (cari tiap kali)", async () => {
    process.env.ACCURATE_LOOKUP_CACHE = "0";
    const ctx = newCtx();
    existing["item:brg-1"] = { id: 1, no: "BRG-1", name: "Barang 1" };
    await findOrCreateItem(ctx, "BRG-1", {});
    await findOrCreateItem(ctx, "BRG-1", {});
    expect(lists("item")).toBe(2);
    expect(lookupCacheSize(ctx)).toBe(0);
  });
});

describe("cache pencarian pelanggan — update akun piutang tetap dijaga", () => {
  test("tanpa akun: pelanggan ada dicari sekali saja", async () => {
    const ctx = newCtx();
    existing["customer:c-1"] = { id: 5, name: "Pelanggan 1" };
    await findOrCreateCustomer(ctx, "C-1", {});
    await findOrCreateCustomer(ctx, "C-1", {});
    expect(lists("customer")).toBe(1);
    expect(saves("customer")).toBe(0);
  });

  test("akun yang SAMA: update dikirim sekali; akun BERBEDA: update dikirim lagi (tanpa pencarian ulang)", async () => {
    const ctx = newCtx();
    existing["customer:c-1"] = { id: 5, name: "Pelanggan 1" };
    await findOrCreateCustomer(ctx, "C-1", { customerReceivableAccountListNo: "1100.01" });
    await findOrCreateCustomer(ctx, "C-1", { customerReceivableAccountListNo: "1100.01" });
    expect(lists("customer")).toBe(1);
    expect(saves("customer")).toBe(1);
    await findOrCreateCustomer(ctx, "C-1", { customerReceivableAccountListNo: "1100.02" });
    expect(lists("customer")).toBe(1); // id diambil dari cache
    expect(saves("customer")).toBe(2);
    expect((calls.filter((c) => c.path === "customer/save.do")[1]!.body as { customerReceivableAccountListNo: string }).customerReceivableAccountListNo).toBe("1100.02");
    // baris tanpa kolom akun setelah itu: cukup dari cache
    await findOrCreateCustomer(ctx, "C-1", {});
    expect(calls.length).toBe(3);
  });

  test("pelanggan baru dibuat sekali; faktur berikutnya tidak mencari/membuat lagi", async () => {
    const ctx = newCtx();
    await findOrCreateCustomer(ctx, "C-NEW", { name: "Pelanggan Baru" });
    await findOrCreateCustomer(ctx, "C-NEW", { name: "Pelanggan Baru" });
    expect(saves("customer")).toBe(1);
    expect(lists("customer")).toBe(1);
  });
});

describe("cache pencarian vendor", () => {
  test("vendor ada dicari sekali; akun hutang berbeda tetap memicu update", async () => {
    const ctx = newCtx();
    existing["vendor:v-1"] = { id: 7, name: "Vendor 1" };
    await findOrCreateVendor(ctx, "V-1", {});
    await findOrCreateVendor(ctx, "V-1", {});
    expect(lists("vendor")).toBe(1);
    await findOrCreateVendor(ctx, "V-1", { vendorPayableAccountListNo: "2100.01" });
    await findOrCreateVendor(ctx, "V-1", { vendorPayableAccountListNo: "2100.01" });
    await findOrCreateVendor(ctx, "V-1", { vendorPayableAccountListNo: "2100.02" });
    expect(saves("vendor")).toBe(2);
    expect(lists("vendor")).toBe(1);
  });
});

describe("parseLookupCacheEnabled", () => {
  test("default aktif; hanya 0/off/false (tanpa membedakan huruf) yang mematikan", () => {
    expect(parseLookupCacheEnabled(undefined)).toBe(true);
    expect(parseLookupCacheEnabled("")).toBe(true);
    expect(parseLookupCacheEnabled("1")).toBe(true);
    expect(parseLookupCacheEnabled("0")).toBe(false);
    expect(parseLookupCacheEnabled("OFF")).toBe(false);
    expect(parseLookupCacheEnabled(" false ")).toBe(false);
  });
});
