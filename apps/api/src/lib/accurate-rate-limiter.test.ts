import { describe, test, expect } from "bun:test";
import { withAccurateRateLimit, runWithAccurateConnection, accurateLimiterBucketCount } from "./accurate-rate-limiter";
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
