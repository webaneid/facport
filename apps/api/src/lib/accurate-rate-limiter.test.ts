import { describe, test, expect } from "bun:test";
import { withAccurateRateLimit, runWithAccurateConnection, accurateLimiterBucketCount, isAccurateUnavailableError, setUnavailableBackoffForTest } from "./accurate-rate-limiter";
import { AccurateApiError } from "./accurate";

// § bug nyata 2026-09-25 (§ lessons-learned.md) — akar masalah SEBENARNYA
// (2 invocation job yang sama jalan bersamaan) sudah diperbaiki di
// lib/queue.ts (retryLimit:0 + expireInSeconds naik). Retry di sini
// jaga-jaga TAMBAHAN untuk tabrakan genuinely dari luar kendali kita
// (mis. klien pakai Accurate Desktop bersamaan) — test ini mengunci
// perilaku retry-backoff-nya, BUKAN root cause aslinya (itu di
// lib/queue.ts, tidak ada unit test praktis untuk perilaku pg-boss).
describe("withAccurateRateLimit — retry backoff untuk error rate-limit Accurate", () => {
  test("retry otomatis kalau Accurate balikin pesan 'melebihi toleransi', sukses di percobaan berikutnya", async () => {
    let calls = 0;
    const result = await withAccurateRateLimit(async () => {
      calls += 1;
      if (calls === 1) {
        throw new AccurateApiError(
          "Jumlah request API melebihi toleransi yang diperbolehkan. Batas maksimum yang diperbolehkan yaitu 8 proses paralel per Token dan 8 request/detik.",
          400,
        );
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  }, 10_000);

  test("error LAIN (bukan rate-limit) TIDAK di-retry, langsung dilempar", async () => {
    let calls = 0;
    await expect(
      withAccurateRateLimit(async () => {
        calls += 1;
        throw new AccurateApiError("Faktur Penjualan tidak tepat", 200);
      }),
    ).rejects.toThrow("Faktur Penjualan tidak tepat");
    expect(calls).toBe(1);
  });

  test("habis semua percobaan retry (persisten gagal) tetap lempar error rate-limit aslinya", async () => {
    let calls = 0;
    await expect(
      withAccurateRateLimit(async () => {
        calls += 1;
        throw new AccurateApiError("Jumlah request API melebihi toleransi yang diperbolehkan.", 400);
      }),
    ).rejects.toThrow("melebihi toleransi");
    // 1 percobaan awal + 4 retry (MAX_RATE_LIMIT_RETRIES) = 5 total panggilan.
    expect(calls).toBe(5);
  }, 30_000);
});

// § Fase 167, ADR-0048 — batas Accurate (8/detik + 8 paralel) berlaku PER TOKEN (= per koneksi Accurate), bukan global lintas pelanggan.
describe("withAccurateRateLimit — bucket per koneksi (Fase 167)", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test("dua koneksi berbeda TIDAK saling menahan: 16 panggilan bersamaan, 8 per koneksi, selesai dalam ±1 gelombang", async () => {
    const started = Date.now();
    const run = (key: string) => runWithAccurateConnection(key, () => Promise.all(Array.from({ length: 8 }, () => withAccurateRateLimit(async () => sleep(50)))));
    await Promise.all([run("conn-a"), run("conn-b")]);
    // Satu bucket global (perilaku lama) akan memaksa 16 panggilan > 8/detik → ≥ ~1 detik. Per koneksi: 8 + 8 serentak ≈ 50 ms.
    expect(Date.now() - started).toBeLessThan(700);
  });

  test("satu koneksi tetap dibatasi 8 paralel", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithAccurateConnection("conn-cap", () =>
      Promise.all(
        Array.from({ length: 20 }, () =>
          withAccurateRateLimit(async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await sleep(20);
            inFlight -= 1;
          }),
        ),
      ),
    );
    expect(peak).toBeLessThanOrEqual(8);
  }, 10_000);

  test("satu koneksi tetap dibatasi 8 request/detik (9 panggilan → yang ke-9 menunggu ≥ ~1 detik)", async () => {
    const stamps: number[] = [];
    await runWithAccurateConnection("conn-rate", () =>
      Promise.all(Array.from({ length: 9 }, () => withAccurateRateLimit(async () => void stamps.push(Date.now())))),
    );
    expect(Math.max(...stamps) - Math.min(...stamps)).toBeGreaterThanOrEqual(900);
  }, 10_000);

  test("tanpa konteks → bucket 'global' bersama (perilaku lama)", async () => {
    const stamps: number[] = [];
    await Promise.all(Array.from({ length: 9 }, () => withAccurateRateLimit(async () => void stamps.push(Date.now()))));
    expect(Math.max(...stamps) - Math.min(...stamps)).toBeGreaterThanOrEqual(900);
  }, 10_000);

  test("bucket koneksi yang sudah menganggur dibersihkan (tidak bocor memori)", async () => {
    await runWithAccurateConnection("conn-cleanup", () => withAccurateRateLimit(async () => "ok"));
    await sleep(1100);
    await runWithAccurateConnection("conn-cleanup-2", () => withAccurateRateLimit(async () => "ok"));
    await sleep(1100);
    // Bucket baru disapu saat panggilan berikutnya; cukup satu panggilan lagi untuk memicu sapuan.
    await withAccurateRateLimit(async () => "ok");
    expect(accurateLimiterBucketCount()).toBeLessThanOrEqual(2);
  }, 10_000);
});

// § Fase 223 — HTTP 503 dari Accurate datang bergelombang (prod 2026-11-17): dicoba ulang dengan jeda PER KONEKSI, hanya untuk 503 "polos".
describe("withAccurateRateLimit — 503 Accurate: retry + jeda per koneksi (Fase 223)", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const plain503 = () => new AccurateApiError("Accurate API gagal: HTTP 503", 503);

  test("isAccurateUnavailableError: hanya 503 polos (kosong/non-JSON); 503 berpesan logis, 502/504, 429-text, dan error non-Accurate BUKAN", () => {
    expect(isAccurateUnavailableError(plain503())).toBe(true);
    expect(isAccurateUnavailableError(new AccurateApiError("Accurate API mengembalikan body non-JSON (HTTP 503)", 503))).toBe(true);
    expect(isAccurateUnavailableError(new AccurateApiError("Barang tidak ditemukan", 503))).toBe(false);
    expect(isAccurateUnavailableError(new AccurateApiError("Accurate API gagal: HTTP 502", 502))).toBe(false);
    expect(isAccurateUnavailableError(new AccurateApiError("Accurate API gagal: HTTP 504", 504))).toBe(false);
    expect(isAccurateUnavailableError(new Error("Accurate API gagal: HTTP 503"))).toBe(false);
  });

  test("503 lalu sukses → dicoba ulang otomatis, hasil sukses dikembalikan", async () => {
    const restore = setUnavailableBackoffForTest([10, 10]);
    try {
      let calls = 0;
      const result = await runWithAccurateConnection("conn-503-ok", () =>
        withAccurateRateLimit(async () => {
          calls += 1;
          if (calls < 3) throw plain503();
          return "ok";
        }),
      );
      expect(result).toBe("ok");
      expect(calls).toBe(3);
    } finally {
      restore();
    }
  }, 10_000);

  test("503 terus-menerus → setelah jadwal habis dilempar galat 503 aslinya (1 + panjang jadwal panggilan)", async () => {
    const restore = setUnavailableBackoffForTest([10, 10, 10]);
    try {
      let calls = 0;
      await expect(
        runWithAccurateConnection("conn-503-exhaust", () =>
          withAccurateRateLimit(async () => {
            calls += 1;
            throw plain503();
          }),
        ),
      ).rejects.toThrow("HTTP 503");
      expect(calls).toBe(4);
    } finally {
      restore();
    }
  }, 10_000);

  test("pemutus: setelah jadwal habis tanpa sukses, request berikutnya pada koneksi itu gagal CEPAT (tanpa retry/jeda); sukses memulihkan retry normal", async () => {
    const restore = setUnavailableBackoffForTest([10, 10]);
    try {
      const run = <T>(fn: () => Promise<T>) => runWithAccurateConnection("conn-503-breaker", () => withAccurateRateLimit(fn));
      let calls = 0;
      await expect(run(async () => { calls += 1; throw plain503(); })).rejects.toThrow("HTTP 503");
      expect(calls).toBe(3); // 1 + 2 jeda, jadwal habis

      let fastCalls = 0;
      const t0 = Date.now();
      await expect(run(async () => { fastCalls += 1; throw plain503(); })).rejects.toThrow("HTTP 503");
      expect(fastCalls).toBe(1);
      expect(Date.now() - t0).toBeLessThan(100);

      // Accurate pulih: satu sukses mereset streak → retry normal berfungsi lagi.
      await run(async () => "ok");
      let again = 0;
      await run(async () => { again += 1; if (again === 1) throw plain503(); return "ok"; });
      expect(again).toBe(2);
    } finally {
      restore();
    }
  }, 10_000);

  test("503 berpesan logis, 502, dan 504 TIDAK dicoba ulang (risiko dokumen ganda pada save.do)", async () => {
    const restore = setUnavailableBackoffForTest([10]);
    try {
      for (const err of [new AccurateApiError("Barang tidak ditemukan", 503), new AccurateApiError("Accurate API gagal: HTTP 502", 502), new AccurateApiError("Accurate API gagal: HTTP 504", 504)]) {
        let calls = 0;
        await expect(
          runWithAccurateConnection("conn-503-noretry", () =>
            withAccurateRateLimit(async () => {
              calls += 1;
              throw err;
            }),
          ),
        ).rejects.toThrow();
        expect(calls).toBe(1);
      }
    } finally {
      restore();
    }
  }, 10_000);

  test("jeda berlaku untuk SELURUH koneksi: request lain yang mulai sesudah 503 menunggu jeda, bukan menembak langsung", async () => {
    const restore = setUnavailableBackoffForTest([300]);
    try {
      let aCalls = 0;
      let bStartedAt = 0;
      const t0 = Date.now();
      const a = runWithAccurateConnection("conn-503-shared", () =>
        withAccurateRateLimit(async () => {
          aCalls += 1;
          if (aCalls === 1) throw plain503();
          return "a";
        }),
      );
      await sleep(50); // A sudah gagal & menetapkan jeda 300 ms
      const b = runWithAccurateConnection("conn-503-shared", () =>
        withAccurateRateLimit(async () => {
          bStartedAt = Date.now();
          return "b";
        }),
      );
      await Promise.all([a, b]);
      expect(bStartedAt - t0).toBeGreaterThanOrEqual(280);
    } finally {
      restore();
    }
  }, 10_000);

  test("koneksi LAIN tidak ikut dijeda", async () => {
    const restore = setUnavailableBackoffForTest([400]);
    try {
      const a = runWithAccurateConnection("conn-503-x", () => {
        let calls = 0;
        return withAccurateRateLimit(async () => {
          calls += 1;
          if (calls === 1) throw plain503();
          return "x";
        });
      });
      await sleep(50);
      const t0 = Date.now();
      await runWithAccurateConnection("conn-503-y", () => withAccurateRateLimit(async () => "y"));
      expect(Date.now() - t0).toBeLessThan(200);
      await a;
    } finally {
      restore();
    }
  }, 10_000);

  test("jeda NAIK bertahap selama 503 beruntun, dan turun ke awal setelah satu sukses", async () => {
    const restore = setUnavailableBackoffForTest([50, 400]);
    try {
      // Dua 503 beruntun: jeda 50 ms lalu 400 ms (≥ 400 ms total ekstra).
      let calls = 0;
      const t0 = Date.now();
      await runWithAccurateConnection("conn-503-escalate", () =>
        withAccurateRateLimit(async () => {
          calls += 1;
          if (calls <= 2) throw plain503();
          return "ok";
        }),
      );
      expect(Date.now() - t0).toBeGreaterThanOrEqual(430);
      // Setelah sukses streak kembali 0: 503 berikutnya hanya kena jeda 50 ms, bukan 400 ms.
      let calls2 = 0;
      const t1 = Date.now();
      await runWithAccurateConnection("conn-503-escalate", () =>
        withAccurateRateLimit(async () => {
          calls2 += 1;
          if (calls2 === 1) throw plain503();
          return "ok";
        }),
      );
      expect(Date.now() - t1).toBeLessThan(300);
    } finally {
      restore();
    }
  }, 10_000);
});
