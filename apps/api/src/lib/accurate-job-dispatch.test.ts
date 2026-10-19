import { describe, test, expect } from "bun:test";
import {
  enqueueAccurateJob,
  parseImportWorkerConcurrency,
  accurateWorkOptions,
  accurateLargeWorkOptions,
  parseImportLargeBatchRows,
  computeImportExpireSeconds,
  withAccurateJobContext,
  type AccurateJobDeps,
} from "./accurate-job-dispatch";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import { JOBS } from "./queue";

function makeDeps(over: Partial<AccurateJobDeps> = {}) {
  const sent: Array<{ name: string; data: object; options?: object }> = [];
  const deps: AccurateJobDeps = {
    send: async (name, data, options) => {
      sent.push({ name, data, options });
      return "job-1";
    },
    subscriptionIdForJob: async () => "sub-1",
    connectionIdForSubscription: async () => "conn-1",
    totalRowsForJob: async () => null,
    ...over,
  };
  return { deps, sent };
}

describe("enqueueAccurateJob — kelompok per koneksi Accurate (Fase 167, ADR-0048)", () => {
  test("IMPORT_TO_ACCURATE dikirim dengan group.id = id koneksi", async () => {
    const { deps, sent } = makeDeps();
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps);
    expect(sent).toEqual([{ name: JOBS.IMPORT_TO_ACCURATE, data: { batchId: "b1" }, options: { group: { id: "conn-1" } } }]);
  });

  test("CANCEL_IMPORT dan PROCESS_AUTOPRODUKSI_ENTRY juga dikelompokkan, payload apa adanya", async () => {
    const { deps, sent } = makeDeps();
    await enqueueAccurateJob(JOBS.CANCEL_IMPORT, { batchId: "b1", actorId: "u1" }, deps);
    await enqueueAccurateJob(JOBS.PROCESS_AUTOPRODUKSI_ENTRY, { entryId: "e1" }, deps);
    expect(sent.map((s) => s.options)).toEqual([{ group: { id: "conn-1" } }, { group: { id: "conn-1" } }]);
    expect(sent[0]!.data).toEqual({ batchId: "b1", actorId: "u1" });
  });

  test("dua batch dari koneksi berbeda → group berbeda", async () => {
    const byBatch: Record<string, string> = { b1: "sub-a", b2: "sub-b" };
    const byConn: Record<string, string> = { "sub-a": "conn-a", "sub-b": "conn-b" };
    const { deps, sent } = makeDeps({
      subscriptionIdForJob: async (_n, p) => byBatch[(p as { batchId: string }).batchId] ?? null,
      connectionIdForSubscription: async (s) => byConn[s] ?? null,
    });
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps);
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b2" }, deps);
    expect(sent.map((s) => (s.options as { group: { id: string } }).group.id)).toEqual(["conn-a", "conn-b"]);
  });

  test("koneksi belum ada → tetap terkirim TANPA group (worker yang menggagalkan baris dengan pesan jelas)", async () => {
    const { deps, sent } = makeDeps({ connectionIdForSubscription: async () => null });
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.options).toBeUndefined();
  });

  test("lookup gagal (DB error) → job TIDAK hilang: tetap terkirim tanpa group", async () => {
    const { deps, sent } = makeDeps({
      subscriptionIdForJob: async () => {
        throw new Error("db down");
      },
    });
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.options).toBeUndefined();
  });

  test("kegagalan send sendiri dilempar ke pemanggil (perilaku sama dengan boss.send lama)", async () => {
    const { deps } = makeDeps({
      send: async () => {
        throw new Error("boss down");
      },
    });
    await expect(enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps)).rejects.toThrow("boss down");
  });
});

// Tes pagar: SEMUA pengiriman job antrean Accurate WAJIB lewat enqueueAccurateJob (supaya selalu dapat group koneksi).
describe("pagar: tidak ada boss.send mentah untuk antrean Accurate", () => {
  test("tidak ada `boss.send(JOBS.IMPORT_TO_ACCURATE|CANCEL_IMPORT|PROCESS_AUTOPRODUKSI_ENTRY` di luar helper", async () => {
    const { Glob } = await import("bun");
    const offenders: string[] = [];
    for await (const file of new Glob("**/*.ts").scan({ cwd: `${import.meta.dir}/..` })) {
      if (file.endsWith(".test.ts") || file.endsWith("lib/accurate-job-dispatch.ts")) continue;
      const text = await Bun.file(`${import.meta.dir}/../${file}`).text();
      if (/boss\.send\(\s*JOBS\.(IMPORT_TO_ACCURATE|IMPORT_TO_ACCURATE_LARGE|CANCEL_IMPORT|PROCESS_AUTOPRODUKSI_ENTRY)\b/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("opsi worker — IMPORT_WORKER_CONCURRENCY (Fase 167)", () => {
  test("default 2 bila kosong/tidak valid", () => {
    for (const raw of [undefined, "", "abc", "0", "-3", "1.5"]) expect(parseImportWorkerConcurrency(raw)).toBe(2);
  });
  test("nilai valid dipakai, dijepit maksimal 8", () => {
    expect(parseImportWorkerConcurrency("1")).toBe(1);
    expect(parseImportWorkerConcurrency("4")).toBe(4);
    expect(parseImportWorkerConcurrency("99")).toBe(8);
  });
  test("opsi work: tiap koneksi (group) maksimal 1 job sekaligus", () => {
    expect(accurateWorkOptions("3")).toEqual({ localConcurrency: 3, localGroupConcurrency: 1 });
  });
});

describe("withAccurateJobContext — bucket pembatas mengikuti group job", () => {
  const job = (groupId: string | null) => ({ id: "j", name: "n", data: {}, expireInSeconds: 1, heartbeatSeconds: null, signal: new AbortController().signal, groupId });
  test("dua job beda group tidak saling menahan (16 panggilan serentak < 700 ms)", async () => {
    const started = Date.now();
    const handler = withAccurateJobContext(async () => {
      await Promise.all(Array.from({ length: 8 }, () => withAccurateRateLimit(async () => new Promise((r) => setTimeout(r, 50)))));
    });
    await Promise.all([handler([job("conn-x")]), handler([job("conn-y")])]);
    expect(Date.now() - started).toBeLessThan(700);
  });
  test("job tanpa group tetap berjalan (bucket global)", async () => {
    let ran = false;
    await withAccurateJobContext(async () => {
      ran = true;
    })([job(null)]);
    expect(ran).toBe(true);
  });
});

// § Fase 199 — jalur terpisah batch besar + kedaluwarsa job dinamis (dasar: biaya Accurate ±0,25–0,30 dtk/baris, linear).
describe("enqueueAccurateJob — jalur besar & expire dinamis (Fase 199)", () => {
  const withRows = (rows: number | null) => makeDeps({ totalRowsForJob: async () => rows });

  test("batch kecil → jalur biasa; expire = dasar 2 jam; group tetap ikut", async () => {
    const { deps, sent } = withRows(100);
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps, 1500);
    expect(sent).toEqual([{ name: JOBS.IMPORT_TO_ACCURATE, data: { batchId: "b1" }, options: { group: { id: "conn-1" }, expireInSeconds: 7200 } }]);
  });

  test("batch ≥ ambang → jalur BESAR (payload & group sama); tepat di ambang sudah besar, satu di bawahnya belum", async () => {
    for (const [rows, queue] of [
      [1499, JOBS.IMPORT_TO_ACCURATE],
      [1500, JOBS.IMPORT_TO_ACCURATE_LARGE],
      [6614, JOBS.IMPORT_TO_ACCURATE_LARGE],
    ] as const) {
      const { deps, sent } = withRows(rows);
      await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, deps, 1500);
      expect(sent[0]!.name).toBe(queue);
      expect(sent[0]!.data).toEqual({ batchId: "b1" });
      expect((sent[0]!.options as { group: { id: string } }).group.id).toBe("conn-1");
    }
  });

  test("ukuran tidak diketahui (null) atau pembacaan gagal → jalur biasa tanpa expire khusus (tidak menghilangkan job)", async () => {
    const a = withRows(null);
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, a.deps, 1500);
    expect(a.sent[0]).toMatchObject({ name: JOBS.IMPORT_TO_ACCURATE, options: { group: { id: "conn-1" } } });
    expect((a.sent[0]!.options as Record<string, unknown>).expireInSeconds).toBeUndefined();
    const b = makeDeps({ totalRowsForJob: async () => { throw new Error("db down"); } });
    await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId: "b1" }, b.deps, 1500);
    expect(b.sent[0]!.name).toBe(JOBS.IMPORT_TO_ACCURATE);
  });

  test("CANCEL_IMPORT & PROCESS_AUTOPRODUKSI_ENTRY TIDAK pernah dialihkan ke jalur besar dan tidak diberi expire", async () => {
    const { deps, sent } = withRows(99_999);
    await enqueueAccurateJob(JOBS.CANCEL_IMPORT, { batchId: "b1", actorId: "u" }, deps, 1500);
    await enqueueAccurateJob(JOBS.PROCESS_AUTOPRODUKSI_ENTRY, { entryId: "e1" }, deps, 1500);
    expect(sent.map((s) => s.name)).toEqual([JOBS.CANCEL_IMPORT, JOBS.PROCESS_AUTOPRODUKSI_ENTRY]);
    expect(sent.map((s) => s.options)).toEqual([{ group: { id: "conn-1" } }, { group: { id: "conn-1" } }]);
  });
});

describe("computeImportExpireSeconds / parseImportLargeBatchRows / accurateLargeWorkOptions", () => {
  test("expire: minimum 2 jam (perilaku lama), tumbuh 0,6 dtk/baris + 15 menit, maksimum 24 jam", () => {
    expect(computeImportExpireSeconds(100)).toBe(7200);
    expect(computeImportExpireSeconds(8275)).toBe(7200); // batch 7–8 ribu baris tetap di dasar
    expect(computeImportExpireSeconds(25_000)).toBe(15_900); // batch 25.000 baris: lewat 2 jam yang lama
    expect(computeImportExpireSeconds(10_000_000)).toBe(86_400);
  });
  test("ambang jalur besar: default 1500; valid dijepit 100–100000; tidak valid → default", () => {
    for (const raw of [undefined, "", "abc", "1.5"]) expect(parseImportLargeBatchRows(raw)).toBe(1500);
    expect(parseImportLargeBatchRows("2500")).toBe(2500);
    expect(parseImportLargeBatchRows("5")).toBe(100);
    expect(parseImportLargeBatchRows("9999999")).toBe(100_000);
  });
  test("slot jalur besar: default 2, dijepit 1–4; tiap koneksi tetap maksimal 1 job sekaligus", () => {
    expect(accurateLargeWorkOptions(undefined)).toEqual({ localConcurrency: 2, localGroupConcurrency: 1 });
    expect(accurateLargeWorkOptions("1")).toEqual({ localConcurrency: 1, localGroupConcurrency: 1 });
    expect(accurateLargeWorkOptions("99")).toEqual({ localConcurrency: 4, localGroupConcurrency: 1 });
    expect(accurateLargeWorkOptions("0")).toEqual({ localConcurrency: 2, localGroupConcurrency: 1 });
  });
});
