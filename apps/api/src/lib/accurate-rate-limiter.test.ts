import { describe, test, expect } from "bun:test";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
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
