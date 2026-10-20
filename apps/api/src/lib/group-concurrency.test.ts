import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { forEachGroupConcurrent, parseGroupParallelism } from "./group-concurrency";
import { runExclusive, keyedLockSize } from "./keyed-lock";

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

describe("parseGroupParallelism", () => {
  test("default 1 (berurutan = perilaku lama) bila kosong/tidak valid; valid dijepit 1–6", () => {
    for (const raw of [undefined, "", "abc", "0", "-2", "1.5"]) expect(parseGroupParallelism(raw)).toBe(1);
    expect(parseGroupParallelism("3")).toBe(3);
    expect(parseGroupParallelism("99")).toBe(6);
  });
});

describe("forEachGroupConcurrent", () => {
  test("parallelism 1 → berurutan persis (urutan mulai = urutan selesai, tidak pernah tumpang tindih)", async () => {
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    await forEachGroupConcurrent([1, 2, 3, 4], 1, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      log.push(`mulai${n}`);
      await tick(2);
      log.push(`selesai${n}`);
      active--;
    });
    expect(maxActive).toBe(1);
    expect(log).toEqual(["mulai1", "selesai1", "mulai2", "selesai2", "mulai3", "selesai3", "mulai4", "selesai4"]);
  });

  test("parallelism N → paling banyak N sekaligus, SEMUA item diproses tepat sekali, item diambil berurutan", async () => {
    const started: number[] = [];
    const done = new Set<number>();
    let active = 0;
    let maxActive = 0;
    await forEachGroupConcurrent(Array.from({ length: 20 }, (_, i) => i), 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      started.push(n);
      await tick(3);
      done.add(n);
      active--;
    });
    expect(maxActive).toBe(3);
    expect(done.size).toBe(20);
    expect(started).toEqual(Array.from({ length: 20 }, (_, i) => i)); // diambil berurutan
  });

  test("benar-benar paralel: 6 item × 20 ms dengan paralelisme 3 selesai jauh lebih cepat dari berurutan (≥ 100 ms)", async () => {
    const t0 = Date.now();
    await forEachGroupConcurrent([1, 2, 3, 4, 5, 6], 3, async () => {
      await tick(20);
    });
    expect(Date.now() - t0).toBeLessThan(100);
  });

  test("lebih banyak pekerja dari item → tidak membuat pekerja berlebih; daftar kosong aman", async () => {
    let calls = 0;
    await forEachGroupConcurrent([1, 2], 6, async () => void calls++);
    expect(calls).toBe(2);
    await forEachGroupConcurrent([], 4, async () => {
      throw new Error("tidak boleh dipanggil");
    });
  });

  test("galat yang lolos dari fn: item baru TIDAK dimulai lagi, yang berjalan dituntaskan, galat pertama dilempar", async () => {
    const finished: number[] = [];
    const started: number[] = [];
    await expect(
      forEachGroupConcurrent(Array.from({ length: 10 }, (_, i) => i), 2, async (n) => {
        started.push(n);
        if (n === 1) throw new Error("boom");
        await tick(10);
        finished.push(n);
      }),
    ).rejects.toThrow("boom");
    expect(finished).toContain(0); // yang sedang berjalan dituntaskan
    expect(started.length).toBeLessThan(10); // tidak lanjut mengambil item baru
  });

  test("parallelism 1: galat melempar langsung seperti loop biasa", async () => {
    await expect(forEachGroupConcurrent([1, 2], 1, async () => { throw new Error("x"); })).rejects.toThrow("x");
  });
});

describe("runExclusive (kunci per-kunci untuk find-or-create data master)", () => {
  test("kunci SAMA berurutan (yang kedua menunggu yang pertama lalu menjalankan fungsinya sendiri); kunci BERBEDA paralel", async () => {
    const log: string[] = [];
    const op = (name: string, ms: number) => async () => {
      log.push(`mulai-${name}`);
      await tick(ms);
      log.push(`selesai-${name}`);
      return name;
    };
    const results = await Promise.all([runExclusive("sesi|item|a", op("a1", 20)), runExclusive("sesi|item|a", op("a2", 1)), runExclusive("sesi|item|b", op("b1", 5))]);
    expect(results).toEqual(["a1", "a2", "b1"]);
    // a2 baru mulai SETELAH a1 selesai; b1 tidak menunggu a1
    expect(log.indexOf("mulai-a2")).toBeGreaterThan(log.indexOf("selesai-a1"));
    expect(log.indexOf("mulai-b1")).toBeLessThan(log.indexOf("selesai-a1"));
  });

  test("galat pemanggil sebelumnya tidak memblokir yang berikutnya; galat tetap dilempar ke pemanggilnya sendiri", async () => {
    const first = runExclusive("k", async () => {
      throw new Error("gagal pertama");
    });
    const second = runExclusive("k", async () => "ok");
    await expect(first).rejects.toThrow("gagal pertama");
    await expect(second).resolves.toBe("ok");
  });

  test("simulasi balapan find-or-create: tanpa kunci keduanya 'membuat'; dengan kunci yang kedua MENEMUKAN yang sudah dibuat", async () => {
    const store = new Set<string>();
    let created = 0;
    const findOrCreate = (no: string) =>
      runExclusive(`sesi|item|${no}`, async () => {
        if (store.has(no)) return "ditemukan";
        await tick(5); // jeda antara cek & buat (jendela balapan)
        store.add(no);
        created++;
        return "dibuat";
      });
    const out = await Promise.all([findOrCreate("X"), findOrCreate("X"), findOrCreate("X")]);
    expect(created).toBe(1);
    expect(out).toEqual(["dibuat", "ditemukan", "ditemukan"]);
  });

  test("kunci dibersihkan setelah semua selesai (tidak bocor memori)", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => runExclusive(`bersih|${i % 4}`, async () => tick(1))));
    await tick(5);
    expect(keyedLockSize()).toBe(0);
  });
});

// Pagar: semua loop grup di handler impor WAJIB lewat `forEachGroupConcurrent` (tanpa itu modul baru diam-diam tidak ikut paralel), dan tidak boleh ada `continue`/`break`
// di badannya (badan loop kini fungsi callback — `continue` di dalamnya tidak valid).
describe("pagar worker: loop grup", () => {
  const src = readFileSync(`${import.meta.dir}/../workers/index.ts`, "utf8");
  test("tidak ada `for (const group of groups)` mentah; ≥ 22 loop lewat forEachGroupConcurrent", () => {
    expect(src).not.toMatch(/for \(const group of groups\) \{/);
    expect(src.match(/await forEachGroupConcurrent\(groups, groupParallelism, async \(group\) => \{/g)?.length ?? 0).toBeGreaterThanOrEqual(22);
  });
  test("tidak ada `continue;` di dalam callback grup", () => {
    const blocks = src.split("await forEachGroupConcurrent(groups, groupParallelism, async (group) => {").slice(1);
    for (const b of blocks) {
      const body = b.slice(0, b.indexOf("\n      });"));
      expect(body).not.toMatch(/\bcontinue;/);
    }
  });
});
