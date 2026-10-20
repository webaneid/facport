import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user as userTable, plans, subscriptions, importBatches, importBatchRows } from "../db/schema";
import { createTestDataUsaha } from "./test-fixtures";
import { recoverOrphanedBatch, recoverOrphanedImportJobs, defaultOrphanDeps, ORPHANED_IMPORT_MESSAGE, type OrphanDeps } from "./orphaned-imports";
import { boss, startQueue } from "./queue";
import { sql } from "drizzle-orm";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);

async function provision(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Orphan Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  const [plan] = await db.insert(plans).values({ name: `Orphan Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["sales_receipt"] }).returning();
  const dataUsahaId = await createTestDataUsaha(body.user.id);
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId: body.user.id, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 864e5), dataUsahaId })
    .returning();
  return { userId: body.user.id, subscriptionId: sub!.id };
}

async function makeBatch(owner: { userId: string; subscriptionId: string }, status: string, rowStatuses: string[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_receipt", fileName: "orphan.xlsx", totalRows: rowStatuses.length, status })
    .returning();
  await db.insert(importBatchRows).values(rowStatuses.map((s, i) => ({ batchId: batch!.id, rowNumber: i + 1, rawData: { a: i }, status: s, errorMessage: s === "failed" ? "galat lama" : null })));
  return batch!.id;
}
const rowsOf = (batchId: string) => db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batchId));
const batchOf = async (batchId: string) => (await db.select().from(importBatches).where(eq(importBatches.id, batchId)))[0]!;

describe("recoverOrphanedBatch (database nyata)", () => {
  test("batch processing dengan baris pending → pending jadi failed + pesan; batch completed_with_errors; baris success/failed lama TIDAK berubah", async () => {
    const owner = await provision(`orphan-a-${runId}@test.local`);
    const id = await makeBatch(owner, "processing", ["pending", "pending", "success", "failed"]);
    expect(await recoverOrphanedBatch(id)).toBe("recovered");
    const rows = (await rowsOf(id)).sort((a, b) => a.rowNumber - b.rowNumber);
    expect(rows.map((r) => r.status)).toEqual(["failed", "failed", "success", "failed"]);
    expect(rows[0]!.errorMessage).toBe(ORPHANED_IMPORT_MESSAGE);
    expect(rows[1]!.errorMessage).toBe(ORPHANED_IMPORT_MESSAGE);
    expect(rows[2]!.errorMessage).toBeNull(); // sukses tidak disentuh
    expect(rows[3]!.errorMessage).toBe("galat lama"); // galat lama tidak ditimpa
    const batch = await batchOf(id);
    expect(batch.status).toBe("completed_with_errors");
    expect(batch.completedAt).not.toBeNull();
  });

  test("semua baris sudah success (job selesai tapi status batch belum diperbarui) → batch completed, tanpa baris gagal baru", async () => {
    const owner = await provision(`orphan-b-${runId}@test.local`);
    const id = await makeBatch(owner, "processing", ["success", "success"]);
    expect(await recoverOrphanedBatch(id)).toBe("recovered");
    expect((await batchOf(id)).status).toBe("completed");
    expect((await rowsOf(id)).every((r) => r.status === "success")).toBe(true);
  });

  test("batch BUKAN processing (mis. batch baru/selesai/menunggu mapping) → tidak disentuh sama sekali", async () => {
    const owner = await provision(`orphan-c-${runId}@test.local`);
    for (const status of ["completed", "completed_with_errors", "mapping_pending", "failed"]) {
      const id = await makeBatch(owner, status, ["pending", "failed"]);
      expect(await recoverOrphanedBatch(id)).toBe("skipped");
      expect((await batchOf(id)).status).toBe(status);
      expect((await rowsOf(id)).map((r) => r.status).sort()).toEqual(["failed", "pending"]);
    }
  });

  test("batch tidak ada → missing", async () => {
    expect(await recoverOrphanedBatch("00000000-0000-4000-8000-000000000000")).toBe("missing");
  });
});

describe("recoverOrphanedImportJobs (orkestrasi)", () => {
  const makeDeps = (jobs: { id: string; queue: string; batchId: string | null }[], results: Record<string, "recovered" | "skipped" | "missing">, over: Partial<OrphanDeps> = {}) => {
    const failed: string[] = [];
    const recovered: string[] = [];
    const deps: OrphanDeps = {
      listActiveJobs: async () => jobs,
      recoverBatch: async (batchId) => {
        recovered.push(batchId);
        return results[batchId] ?? "recovered";
      },
      failJob: async (_q, id) => void failed.push(id),
      now: () => new Date(),
      ...over,
    };
    return { deps, failed, recovered };
  };

  test("tiap job hantu: batch dipulihkan lalu job digagalkan; ringkasan menghitung hasil", async () => {
    const { deps, failed, recovered } = makeDeps(
      [
        { id: "j1", queue: "import-to-accurate-large", batchId: "b1" },
        { id: "j2", queue: "import-to-accurate", batchId: "b2" },
        { id: "j3", queue: "import-to-accurate", batchId: "b3" },
        { id: "j4", queue: "import-to-accurate", batchId: null },
      ],
      { b2: "skipped", b3: "missing" },
    );
    const s = await recoverOrphanedImportJobs(deps);
    expect(s).toEqual({ jobs: 4, recovered: 1, skipped: 1, missing: 2, errors: 0 });
    expect(recovered).toEqual(["b1", "b2", "b3"]); // job tanpa batchId tidak memanggil recoverBatch
    expect(failed).toEqual(["j1", "j2", "j3", "j4"]); // SEMUA job hantu digagalkan agar tidak menggantung
  });

  test("tidak ada job aktif → tidak melakukan apa pun", async () => {
    const { deps, failed } = makeDeps([], {});
    expect(await recoverOrphanedImportJobs(deps)).toEqual({ jobs: 0, recovered: 0, skipped: 0, missing: 0, errors: 0 });
    expect(failed).toEqual([]);
  });

  test("galat pada satu job dicatat dan TIDAK menghentikan job lain atau start worker", async () => {
    const { deps, failed } = makeDeps(
      [
        { id: "j1", queue: "q", batchId: "bad" },
        { id: "j2", queue: "q", batchId: "ok" },
      ],
      {},
      {
        recoverBatch: async (b) => {
          if (b === "bad") throw new Error("db down");
          return "recovered";
        },
      },
    );
    const s = await recoverOrphanedImportJobs(deps);
    expect(s).toMatchObject({ jobs: 2, recovered: 1, errors: 1 });
    expect(failed).toEqual(["j2"]);
  });

  test("hanya antrean impor yang dicari (bukan Batal Import/AutoProduksi)", async () => {
    let asked: string[] = [];
    const { deps } = makeDeps([], {}, { listActiveJobs: async (queues) => ((asked = queues), []) });
    await recoverOrphanedImportJobs(deps);
    expect(asked.sort()).toEqual(["import-to-accurate", "import-to-accurate-large"]);
  });
});

// Terhadap pg-boss ASLI (antrean sementara, dibersihkan): query `listActiveJobs` & `failJob` — bug nyata tertangkap di sini (parameter Date mentah ditolak driver).
describe("listActiveJobs / failJob terhadap pg-boss asli", () => {
  test("job 'active' tanpa handler (proses mati) ditemukan hanya bila lebih tua dari ambang; failJob mengubah status ke failed", async () => {
    await startQueue();
    const queue = `orphan-spike-${runId}`;
    await boss.createQueue(queue, { expireInSeconds: 7200, retryLimit: 0 });
    try {
      const jobId = (await boss.send(queue, { batchId: "00000000-0000-4000-8000-0000000000aa" }))!;
      const [fetched] = await boss.fetch(queue, { batchSize: 1 }); // 'active' tanpa handler = proses yang mati
      expect(fetched?.id).toBe(jobId);
      await new Promise((r) => setTimeout(r, 1100));
      const found = await defaultOrphanDeps.listActiveJobs([queue], new Date());
      expect(found).toEqual([{ id: jobId, queue, batchId: "00000000-0000-4000-8000-0000000000aa" }]);
      // job yang dimulai SETELAH ambang (milik proses ini) TIDAK boleh ikut
      expect(await defaultOrphanDeps.listActiveJobs([queue], new Date(Date.now() - 3600_000))).toEqual([]);
      await defaultOrphanDeps.failJob(queue, jobId);
      const res = (await db.execute(sql`select state from pgboss.job where id = ${jobId}`)) as unknown;
      const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as { state: string }[];
      expect(rows[0]!.state).toBe("failed");
    } finally {
      await boss.deleteQueue(queue);
    }
  });
});
