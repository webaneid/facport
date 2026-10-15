import { describe, test, expect } from "bun:test";
import { enqueueAccurateJob, parseImportWorkerConcurrency, accurateWorkOptions, withAccurateJobContext, type AccurateJobDeps } from "./accurate-job-dispatch";
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
      if (/boss\.send\(\s*JOBS\.(IMPORT_TO_ACCURATE|CANCEL_IMPORT|PROCESS_AUTOPRODUKSI_ENTRY)\b/.test(text)) offenders.push(file);
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
