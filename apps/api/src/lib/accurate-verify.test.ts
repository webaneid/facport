import { describe, test, expect, spyOn } from "bun:test";
import { verifyAfterTimeout, parseVerifyConfig, type VerifyDeps } from "./accurate-verify";
import { settleTimedOutGroup } from "./accurate-timeout-settle";
import { describeTimeoutAfterVerification } from "./accurate-group-guard";
import { AccurateTimeoutError } from "./accurate-http";
import { getSalesReceiptByNumber } from "./accurate-sales-receipt";
import type { AccurateSessionContext } from "./accurate-session";
import { scopesForModules } from "./accurate-scopes";

// Jam & tidur palsu: `sleep` memajukan jam, jadi polling 5 menit teruji tanpa menunggu.
function fakeDeps(config = { maxWaitMs: 300_000, intervalMs: 30_000 }) {
  let t = 0;
  const sleeps: number[] = [];
  const deps: VerifyDeps = {
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
    config: () => config,
  };
  return { deps, sleeps, advance: (ms: number) => (t += ms) };
}

describe("parseVerifyConfig", () => {
  test("default 5 menit / 30 dtk; nilai valid dijepit; 0 = sekali cek; tidak valid → default", () => {
    expect(parseVerifyConfig({})).toEqual({ maxWaitMs: 300_000, intervalMs: 30_000 });
    expect(parseVerifyConfig({ ACCURATE_VERIFY_MAX_WAIT_MS: "0" }).maxWaitMs).toBe(0);
    expect(parseVerifyConfig({ ACCURATE_VERIFY_MAX_WAIT_MS: "99999999" }).maxWaitMs).toBe(1_800_000);
    expect(parseVerifyConfig({ ACCURATE_VERIFY_INTERVAL_MS: "1" }).intervalMs).toBe(5_000);
    expect(parseVerifyConfig({ ACCURATE_VERIFY_INTERVAL_MS: "abc" }).intervalMs).toBe(30_000);
  });
});

describe("verifyAfterTimeout", () => {
  test("ada pada cek pertama → found tanpa menunggu", async () => {
    const { deps, sleeps } = fakeDeps();
    const r = await verifyAfterTimeout(async () => ({ id: 42 }), deps);
    expect(r).toMatchObject({ state: "found", id: 42, attempts: 1, waitedMs: 0 });
    expect(sleeps).toEqual([]);
  });

  test("baru muncul setelah beberapa kali cek (Accurate masih memproses) → found; mengikuti jeda", async () => {
    const { deps, sleeps } = fakeDeps();
    let calls = 0;
    const r = await verifyAfterTimeout(async () => (++calls >= 4 ? { id: 7 } : null), deps);
    expect(r).toMatchObject({ state: "found", id: 7, attempts: 4 });
    expect(sleeps).toEqual([30_000, 30_000, 30_000]);
  });

  test("tidak pernah muncul sampai batas → absent; lama menunggu ≤ batas; jumlah cek terbatas", async () => {
    const { deps } = fakeDeps({ maxWaitMs: 120_000, intervalMs: 30_000 });
    let calls = 0;
    const r = await verifyAfterTimeout(async () => (calls++, null), deps);
    expect(r.state).toBe("absent");
    expect(r.waitedMs).toBeLessThanOrEqual(120_000);
    expect(r.attempts).toBe(calls);
    expect(calls).toBeLessThanOrEqual(5);
  });

  test("maxWait 0 → tepat satu kali cek, tanpa tidur", async () => {
    const { deps, sleeps } = fakeDeps({ maxWaitMs: 0, intervalMs: 30_000 });
    let calls = 0;
    const r = await verifyAfterTimeout(async () => (calls++, null), deps);
    expect(r.state).toBe("absent");
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test("pengecekan selalu galat → unknown (bukan absent) dan membawa galat terakhir", async () => {
    const { deps } = fakeDeps({ maxWaitMs: 60_000, intervalMs: 30_000 });
    const r = await verifyAfterTimeout(async () => {
      throw new Error("Accurate API gagal: HTTP 503");
    }, deps);
    expect(r).toMatchObject({ state: "unknown", lastError: "Accurate API gagal: HTTP 503" });
  });

  test("galat sesaat lalu ketemu → found; galat sesaat lalu 'tidak ada' → absent (pernah dijawab tidak ada)", async () => {
    const a = fakeDeps();
    let n = 0;
    const found = await verifyAfterTimeout(async () => {
      if (++n === 1) throw new Error("jaringan");
      return { id: 9 };
    }, a.deps);
    expect(found).toMatchObject({ state: "found", id: 9 });
    const b = fakeDeps({ maxWaitMs: 60_000, intervalMs: 30_000 });
    let m = 0;
    const absent = await verifyAfterTimeout(async () => {
      if (++m === 1) throw new Error("jaringan");
      return null;
    }, b.deps);
    expect(absent.state).toBe("absent");
  });
});

describe("settleTimedOutGroup — status akhir baris setelah timeout", () => {
  const err = new AccurateTimeoutError(2_040_000, 3391);

  test("ditemukan di Accurate → SUKSES dengan id transaksi (bukan 'gagal')", async () => {
    const { deps } = fakeDeps();
    const s = await settleTimedOutGroup(err, "1000.10.2026.09.00277", async () => ({ id: 555 }), deps);
    expect(s).toMatchObject({ status: "success", transactionId: "555" });
  });

  test("tidak terlihat → GAGAL dengan pesan yang menyebut nomor, hasil cek, dan tetap menyarankan periksa sebelum import ulang", async () => {
    const { deps } = fakeDeps({ maxWaitMs: 60_000, intervalMs: 30_000 });
    const s = await settleTimedOutGroup(err, "1000.10.2026.09.00277", async () => null, deps);
    expect(s.status).toBe("failed");
    if (s.status === "failed") {
      expect(s.message).toContain("1000.10.2026.09.00277");
      expect(s.message).toContain("3.391 baris");
      expect(s.message).toContain("BELUM terlihat");
      expect(s.message.toLowerCase()).toContain("duplikat");
    }
  });

  test("pengecekan gagal → GAGAL dengan pesan 'MUNGKIN sudah tersimpan' (perilaku aman lama)", async () => {
    const { deps } = fakeDeps({ maxWaitMs: 0, intervalMs: 30_000 });
    const s = await settleTimedOutGroup(err, "X-1", async () => { throw new Error("boom"); }, deps);
    expect(s.status).toBe("failed");
    if (s.status === "failed") expect(s.message).toContain("MUNGKIN");
  });
});

describe("describeTimeoutAfterVerification", () => {
  test("pesan 'tidak diketahui' menyebut pengecekan otomatis gagal", () => {
    const m = describeTimeoutAfterVerification(new AccurateTimeoutError(360_000, 0), { state: "unknown", attempts: 1, waitedMs: 0, lastError: "x" }, "N-1");
    expect(m).toContain("6 menit");
    expect(m).toContain("tidak berhasil");
  });
});

describe("getSalesReceiptByNumber", () => {
  const ctx = { host: "https://h.accurate.id", accessToken: "t", session: "s" } as unknown as AccurateSessionContext;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  test("ditemukan → {id, number}; memanggil detail.do dengan nomor (ter-encode)", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: unknown) => {
      expect(String(url)).toContain("/sales-receipt/detail.do?number=1000.10.2026.09.00277");
      return json({ s: true, d: { id: 123, number: "1000.10.2026.09.00277" } });
    }) as unknown as typeof fetch);
    try {
      expect(await getSalesReceiptByNumber(ctx, "1000.10.2026.09.00277")).toEqual({ id: 123, number: "1000.10.2026.09.00277" });
    } finally {
      spy.mockRestore();
    }
  });

  test("Accurate menjawab 'tidak tepat' → null (tidak ada)", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async () => json({ s: false, d: ["Penerimaan Penjualan tidak tepat"] })) as unknown as typeof fetch);
    try {
      expect(await getSalesReceiptByNumber(ctx, "X")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("respons tanpa id terbaca → galat (TIDAK dianggap ada); galat lain diteruskan", async () => {
    const a = spyOn(globalThis, "fetch").mockImplementation((async () => json({ s: true, d: { number: "X" } })) as unknown as typeof fetch);
    try {
      await expect(getSalesReceiptByNumber(ctx, "X")).rejects.toThrow(/id yang bisa dibaca/);
    } finally {
      a.mockRestore();
    }
    const b = spyOn(globalThis, "fetch").mockImplementation((async () => json({ s: false, d: ["Sesi tidak valid"] })) as unknown as typeof fetch);
    try {
      await expect(getSalesReceiptByNumber(ctx, "X")).rejects.toThrow("Sesi tidak valid");
    } finally {
      b.mockRestore();
    }
  });
});

describe("scope modul Sales Receipt setelah C2", () => {
  test("tetap memuat sales_receipt_view (kini turunan dari GET detail.do, bukan warisan) → koneksi yang ada tidak wajib memperbarui izin", () => {
    expect(scopesForModules(["sales_receipt"])).toContain("sales_receipt_view");
  });
});
