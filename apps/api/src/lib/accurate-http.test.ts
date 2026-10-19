import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import {
  parseHttpTimeoutConfig,
  computeSaveTimeoutMs,
  countDetailLines,
  isSaveUrl,
  resolveRequestTimeout,
  accurateFetch,
  AccurateTimeoutError,
  type HttpTimeoutConfig,
  type AccurateHttpDeps,
} from "./accurate-http";
import { describeAccurateFailure } from "./accurate-group-guard";

const cfg: HttpTimeoutConfig = { saveMinMs: 360_000, saveMaxMs: 3_600_000, saveMsPerLine: 600, requestMs: 360_000 };

describe("parseHttpTimeoutConfig", () => {
  test("default = perilaku lama untuk batas bawah/umum (360 dtk) + atas 60 menit + 600 ms/baris", () => {
    expect(parseHttpTimeoutConfig({})).toEqual(cfg);
  });
  test("nilai valid dipakai & dijepit; tidak valid → default; batas atas tidak pernah di bawah batas bawah", () => {
    expect(parseHttpTimeoutConfig({ ACCURATE_SAVE_MS_PER_LINE: "1000" }).saveMsPerLine).toBe(1000);
    expect(parseHttpTimeoutConfig({ ACCURATE_SAVE_MS_PER_LINE: "1" }).saveMsPerLine).toBe(50);
    expect(parseHttpTimeoutConfig({ ACCURATE_SAVE_MS_PER_LINE: "999999" }).saveMsPerLine).toBe(5000);
    expect(parseHttpTimeoutConfig({ ACCURATE_SAVE_MS_PER_LINE: "abc" }).saveMsPerLine).toBe(600);
    expect(parseHttpTimeoutConfig({ ACCURATE_SAVE_TIMEOUT_MIN_MS: "600000", ACCURATE_SAVE_TIMEOUT_MAX_MS: "100000" })).toMatchObject({ saveMinMs: 600_000, saveMaxMs: 600_000 });
  });
});

describe("computeSaveTimeoutMs — adaptif sesuai baris (biaya Accurate ±0,25–0,28 dtk/baris)", () => {
  test("dokumen kecil → batas bawah (perilaku lama)", () => {
    expect(computeSaveTimeoutMs(0, cfg)).toBe(360_000);
    expect(computeSaveTimeoutMs(500, cfg)).toBe(360_000);
  });
  test("tumbuh linear di atas batas bawah: 1.000 baris = 10 menit, 3.391 baris ≈ 34 menit (kasus 19 Okt) — cukup untuk ±15 menit prediksi", () => {
    expect(computeSaveTimeoutMs(1000, cfg)).toBe(600_000);
    expect(computeSaveTimeoutMs(3391, cfg)).toBe(2_034_600);
  });
  test("dijepit batas atas (60 menit)", () => {
    expect(computeSaveTimeoutMs(100_000, cfg)).toBe(3_600_000);
  });
});

describe("countDetailLines / isSaveUrl / resolveRequestTimeout", () => {
  const big = (n: number, key = "detailItem") => JSON.stringify({ number: "X", [key]: Array.from({ length: n }, (_, i) => ({ itemNo: `I-${i}`, unitPrice: 1000, quantity: 1, detailNotes: "x".repeat(40) })) });
  test("menjumlah semua array detail* dan mengabaikan array lain; body kecil/bukan string = 0", () => {
    const body = JSON.stringify({ detailItem: Array.from({ length: 300 }, () => ({ a: "x".repeat(60) })), detailExpense: Array.from({ length: 200 }, () => ({ b: "y".repeat(60) })), other: [1, 2, 3] });
    expect(countDetailLines(body)).toBe(500);
    expect(countDetailLines('{"detailItem":[{}]}')).toBe(0); // di bawah ambang parse
    expect(countDetailLines(undefined)).toBe(0);
    expect(countDetailLines("{bukan json" + "x".repeat(40_000))).toBe(0);
  });
  test("hanya path /save.do yang adaptif; query string tidak mengecoh", () => {
    expect(isSaveUrl("https://h.accurate.id/accurate/api/sales-receipt/save.do")).toBe(true);
    expect(isSaveUrl("https://h.accurate.id/accurate/api/sales-receipt/detail.do?number=save.do")).toBe(false);
    expect(isSaveUrl("bukan-url")).toBe(false);
  });
  test("save.do besar → timeout adaptif; save.do kecil & panggilan lain → batas tetap", () => {
    const url = "https://h.accurate.id/accurate/api/sales-receipt/save.do";
    const r = resolveRequestTimeout(url, big(3400), cfg);
    expect(r.save).toBe(true);
    expect(r.lines).toBe(3400);
    expect(r.timeoutMs).toBe(2_040_000);
    expect(resolveRequestTimeout(url, big(10), cfg).timeoutMs).toBe(360_000);
    expect(resolveRequestTimeout("https://h.accurate.id/accurate/api/item/list.do", big(5000), cfg)).toEqual({ save: false, lines: 0, timeoutMs: 360_000 });
  });
});

describe("accurateFetch", () => {
  const deps = (impl: AccurateHttpDeps["fetch"], clock = [0, 0]): AccurateHttpDeps => {
    let i = 0;
    return { fetch: impl, now: () => clock[Math.min(i++, clock.length - 1)]!, config: () => cfg };
  };
  test("meneruskan permintaan dengan signal timeout eksplisit dan mengembalikan respons", async () => {
    let captured: RequestInit | undefined;
    const res = await accurateFetch("https://h/accurate/api/item/list.do", { method: "GET" }, deps(async (_u, init) => ((captured = init), new Response("{}", { status: 200 }))));
    expect(res.status).toBe(200);
    expect(captured?.signal).toBeInstanceOf(AbortSignal);
    // default timeout runtime WAJIB dimatikan (`timeout: false`) — signal panjang saja tidak mengalahkan default (terbukti lewat uji Bun)
    expect((captured as unknown as { timeout?: unknown }).timeout).toBe(false);
    expect(captured?.method).toBe("GET");
  });
  test("TimeoutError dari fetch → AccurateTimeoutError (name tetap TimeoutError) membawa lama menunggu & jumlah baris", async () => {
    const body = JSON.stringify({ detailInvoice: Array.from({ length: 700 }, () => ({ invoiceNo: "I", paymentAmount: 1, x: "y".repeat(40) })) });
    const url = "https://h/accurate/api/sales-receipt/save.do";
    const err = await accurateFetch(url, { method: "POST", body }, deps(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }, [1000, 1000 + 600_000, 1000 + 600_000])).catch((e) => e);
    expect(err).toBeInstanceOf(AccurateTimeoutError);
    expect(err.name).toBe("TimeoutError");
    expect(err.waitedMs).toBe(600_000);
    expect(err.lines).toBe(700);
  });
  test("galat lain diteruskan apa adanya (bukan diubah jadi timeout)", async () => {
    const boom = new Error("ECONNRESET");
    await expect(accurateFetch("https://h/accurate/api/item/list.do", {}, deps(async () => { throw boom; }))).rejects.toBe(boom);
  });
});

describe("describeAccurateFailure — timeout kita sendiri menyebut lama menunggu & ukuran", () => {
  test("AccurateTimeoutError → menyebut menit & baris, tetap menyarankan cek Accurate dulu (cegah dobel)", () => {
    const msg = describeAccurateFailure(new AccurateTimeoutError(2_040_000, 3391));
    expect(msg).toContain("34 menit");
    expect(msg).toContain("3.391 baris");
    expect(msg.toLowerCase()).toContain("periksa");
    expect(msg.toLowerCase()).toContain("duplikat");
  });
  test("TimeoutError mentah lama tetap dikenali", () => {
    expect(describeAccurateFailure(new Error("The operation timed out."))).toContain("batas waktu");
  });
});

// Pagar: tidak boleh ada `fetch(` mentah ke host Accurate di lib/accurate-*.ts — semua lewat `accurateFetch` (timeout eksplisit + metrik). Modul baru tak bisa lolos.
describe("pagar accurateFetch", () => {
  test("tidak ada `fetch(\\`${ctx.host}` mentah di lib/accurate-*.ts", () => {
    const dir = import.meta.dir;
    const offenders = readdirSync(dir)
      .filter((f) => /^accurate-.*\.ts$/.test(f) && !f.endsWith(".test.ts") && f !== "accurate-http.ts")
      .filter((f) => /[^a-zA-Z]fetch\(`\$\{ctx\.host\}/.test(readFileSync(`${dir}/${f}`, "utf8")));
    expect(offenders).toEqual([]);
  });
});
