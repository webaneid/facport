import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PgBoss } from "pg-boss";
import { accurateWorkOptions, withAccurateJobContext } from "./accurate-job-dispatch";

// § Fase 167, ADR-0048 — perilaku NYATA pg-boss (Postgres dev): koneksi berbeda paralel, koneksi sama berurutan, group sampai ke handler.
// Memakai queue sementara bernama unik; dihapus di akhir. Tidak menyentuh queue produksi/dev lain.
const QUEUE = `test-fase167-${Date.now()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let testBoss: PgBoss;

beforeAll(async () => {
  testBoss = new PgBoss(process.env.DATABASE_URL!);
  await testBoss.start();
  await testBoss.createQueue(QUEUE, { retryLimit: 0, expireInSeconds: 60 });
});

afterAll(async () => {
  await testBoss.deleteQueue(QUEUE).catch(() => {});
  await testBoss.stop({ graceful: false, timeout: 2000 }).catch(() => {});
});

describe("antrean import per koneksi (pg-boss nyata)", () => {
  test("koneksi sama berurutan, koneksi lain tidak menunggu, group sampai ke handler", async () => {
    const t0 = Date.now();
    const events: Array<{ n: string; group: string | null | undefined; start: number; end: number }> = [];
    await testBoss.work<{ n: string }>(
      QUEUE,
      { ...accurateWorkOptions("3"), pollingIntervalSeconds: 0.5 },
      withAccurateJobContext<{ n: string }>(async ([job]) => {
        const start = Date.now() - t0;
        await sleep(1200);
        events.push({ n: job!.data.n, group: job!.groupId, start, end: Date.now() - t0 });
      }),
    );
    for (const n of ["A1", "A2"]) await testBoss.send(QUEUE, { n }, { group: { id: "conn-A" } });
    await testBoss.send(QUEUE, { n: "B1" }, { group: { id: "conn-B" } });

    const deadline = Date.now() + 15_000;
    while (events.length < 3 && Date.now() < deadline) await sleep(200);
    expect(events).toHaveLength(3);

    const by = Object.fromEntries(events.map((e) => [e.n, e]));
    expect(by.A1!.group).toBe("conn-A");
    expect(by.B1!.group).toBe("conn-B");
    // A1 dan A2 (koneksi sama) TIDAK tumpang tindih.
    const [first, second] = [by.A1!, by.A2!].sort((x, y) => x.start - y.start);
    expect(second!.start).toBeGreaterThanOrEqual(first!.end - 50);
    // B1 (koneksi lain) berjalan SEMENTARA salah satu job A masih berjalan — tidak menunggu semua A selesai.
    expect(by.B1!.start).toBeLessThan(Math.max(by.A1!.end, by.A2!.end) - 600);
  }, 30_000);
});
