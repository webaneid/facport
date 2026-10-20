import { describe, test, expect } from "bun:test";
import {
  parseStagedConfig,
  shouldStage,
  estimateStepSeconds,
  estimateTotalSeconds,
  entryKeysForRows,
  rowEntryIndexes,
  partialChequeAmount,
  matchExistingPrefix,
  buildStepPayload,
  runStagedSend,
  isRetryableStagedError,
  type StagedConfig,
  type StagedDeps,
  type StagedDoc,
  type StagedLine,
  type Entry,
} from "./staged-send";
import { AccurateApiError } from "./accurate";
import { AccurateTimeoutError } from "./accurate-http";

const config = (over: Partial<StagedConfig> = {}): StagedConfig => ({ ...parseStagedConfig({ IMPORT_STAGED_MODULES: "sales_receipt,purchase_payment", IMPORT_STAGED_CHUNK_ROWS: "3", IMPORT_STAGED_BACKOFF_BASE_MS: "1000", IMPORT_STAGED_POLL_INTERVAL_MS: "1000" }), ...over });
const entry = (i: number, amount = 1000 + i): Entry => ({ invoiceNo: `INV-${String(i).padStart(3, "0")}`, paymentAmount: amount });
const entriesOf = (n: number) => Array.from({ length: n }, (_, i) => entry(i + 1));
const basePayload = (entries: Entry[], extra: Record<string, unknown> = {}) => ({
  customerNo: "C1",
  bankNo: "110102",
  transDate: "21/10/2026",
  number: "RCP-1",
  description: "Deskripsi",
  chequeAmount: entries.reduce((s, e) => s + Number(e.paymentAmount), 0),
  detailInvoice: entries,
  ...extra,
});

/** Accurate palsu: dokumen tersimpan dengan semantik create/update seperti di trial; jam palsu; update bisa "tertunda" (selesai belakangan). */
function fakeAccurate(opts: { failOn?: (call: number, payload: Record<string, unknown>) => "business" | "timeout-applies" | "timeout-lost" | "ok-but-lost" | null; applyDelayMs?: number } = {}) {
  let t = 0;
  let nextId = 100;
  let doc: StagedDoc | null = null;
  const pending: { at: number; payload: Record<string, unknown> }[] = [];
  const calls: Record<string, unknown>[] = [];
  const progress: number[] = [];
  let callNo = 0;
  let header: Record<string, unknown> | null = null;

  const apply = (payload: Record<string, unknown>) => {
    const di = payload.detailInvoice as Entry[];
    if (payload.id === undefined) {
      const { detailInvoice: _a, ...rest } = payload;
      header = rest;
      doc = { id: nextId++, lines: di.map((e, i) => ({ id: 1000 + i, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [] };
    } else {
      const old = doc!.lines;
      const next = di.map((e, i) => {
        if (e.invoiceNo === undefined) {
          const found = old.find((l) => l.id === (e as { id: number }).id);
          if (!found) throw new Error("id baris tidak dikenal");
          return found;
        }
        return { id: 5000 + old.length + i, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) };
      });
      doc = { ...doc!, lines: next };
      header = { ...header, chequeAmount: payload.chequeAmount };
    }
  };
  const flush = () => {
    while (pending.length && pending[0]!.at <= t) apply(pending.shift()!.payload);
  };
  const deps: StagedDeps = {
    lookup: async () => {
      flush();
      return doc ? { ...doc, lines: [...doc.lines] } : null;
    },
    save: async (payload) => {
      flush();
      callNo += 1;
      calls.push(payload);
      const mode = opts.failOn?.(callNo, payload) ?? null;
      if (mode === "business") throw new AccurateApiError("Nilai Pembayaran tidak mencukupi", 200);
      if (mode === "timeout-applies") {
        pending.push({ at: t + (opts.applyDelayMs ?? 5000), payload });
        throw new AccurateTimeoutError(360000, 10);
      }
      if (mode === "timeout-lost") throw new AccurateTimeoutError(360000, 10);
      if (mode === "ok-but-lost") return { id: 1 };
      apply(payload);
      return { id: doc!.id };
    },
    sleep: async (ms) => {
      t += ms;
      flush();
    },
    now: () => t,
    onProgress: async (n) => {
      progress.push(n);
    },
  };
  return { deps, calls, progress, get doc() { return doc; }, get header() { return header; }, setDoc: (d: StagedDoc) => { doc = d; }, get clock() { return t; } };
}

describe("parseStagedConfig / shouldStage", () => {
  test("default mati; hanya modul yang didukung; nilai dibatasi", () => {
    const c = parseStagedConfig({});
    expect(c.modules.size).toBe(0);
    expect(shouldStage(c, "sales_receipt", 9999)).toBe(false);
    const c2 = parseStagedConfig({ IMPORT_STAGED_MODULES: "sales_receipt, sales_invoice ,purchase_payment", IMPORT_STAGED_CHUNK_ROWS: "0", IMPORT_STAGED_THRESHOLD_ROWS: "abc" });
    expect([...c2.modules]).toEqual(["sales_receipt", "purchase_payment"]);
    expect(c2.chunkEntries).toBe(1);
    expect(c2.thresholdRows).toBe(200);
    expect(shouldStage(c2, "sales_receipt", 200)).toBe(false);
    expect(shouldStage(c2, "sales_receipt", 201)).toBe(true);
    expect(shouldStage(c2, "sales_invoice", 5000)).toBe(false);
  });
});

describe("estimasi waktu", () => {
  test("kuadrat & jumlah cicilan", () => {
    const c = { secondsCoeff: 5.2e-4, chunkEntries: 500 };
    expect(estimateStepSeconds(600, c)).toBeCloseTo(187.2, 1); // terukur trial: 198 dtk
    expect(estimateTotalSeconds(0, c)).toBe(0);
    // 1000 entri / cicilan 500 → langkah pada 500 dan 1000
    expect(estimateTotalSeconds(1000, c)).toBe(Math.ceil(5.2e-4 * 500 ** 2 + 5.2e-4 * 1000 ** 2));
    // cicilan lebih besar → total lebih kecil
    expect(estimateTotalSeconds(4000, { ...c, chunkEntries: 2000 })).toBeLessThan(estimateTotalSeconds(4000, c));
  });
});

describe("kunci entri & pajak", () => {
  test("faktur sama (beda huruf/spasi) satu entri; kosong = entri sendiri", () => {
    const keys = entryKeysForRows(["A", " a ", "B", "", "", "A"]);
    expect(keys).toEqual(["a", "a", "b", "__row3", "__row4", "a"]);
    expect(rowEntryIndexes(keys)).toEqual({ indexes: [0, 0, 1, 2, 3, 0], entryCount: 4 });
  });
  test("cheque sementara = bayar − pajak − diskon, × kurs, hanya entri yang termasuk", () => {
    const entries: Entry[] = [
      { invoiceNo: "A", paymentAmount: 1000, detailDiscount: [{ amount: 100 }] },
      { invoiceNo: "B", paymentAmount: 2000 },
    ];
    const payload = { rate: 2, detailTax: [{ detailInvoiceNo: "B", taxAmount: 50 }, { detailInvoiceNo: "A", taxAmount: 10 }] };
    expect(partialChequeAmount(payload, entries.slice(0, 1))).toBe((1000 - 10 - 100) * 2);
    expect(partialChequeAmount(payload, entries)).toBe((3000 - 60 - 100) * 2);
  });
});

describe("matchExistingPrefix", () => {
  const e = entriesOf(5);
  const lines = (n: number) => e.slice(0, n).map((x, i) => ({ id: i + 1, invoiceNo: String(x.invoiceNo), paymentAmount: Number(x.paymentAmount) }));
  test("awalan persis", () => {
    expect(matchExistingPrefix([], e)).toBe(0);
    expect(matchExistingPrefix(lines(3), e)).toBe(3);
    expect(matchExistingPrefix(lines(5), e)).toBe(5);
  });
  test("beda faktur / jumlah / urutan / terlalu panjang → -1", () => {
    const l = lines(3) as [StagedLine, StagedLine, StagedLine];
    expect(matchExistingPrefix([{ ...l[0], invoiceNo: "X" }], e)).toBe(-1);
    expect(matchExistingPrefix([{ ...l[0], paymentAmount: 1 }], e)).toBe(-1);
    expect(matchExistingPrefix([l[1], l[0]], e)).toBe(-1);
    expect(matchExistingPrefix([...lines(5), l[0]], e)).toBe(-1);
  });
  test("huruf besar/kecil & spasi pada nomor faktur diabaikan", () => {
    expect(matchExistingPrefix([{ id: 1, invoiceNo: " inv-001 ", paymentAmount: 1001 }], e)).toBe(1);
  });
});

describe("buildStepPayload", () => {
  const entries = entriesOf(7);
  const payload = basePayload(entries, { detailTax: [{ detailInvoiceNo: "INV-005", taxAmount: 7, taxId: 9 }] });
  test("cicilan pertama: header lengkap, nomor asli, hanya entri pertama, cheque sementara", () => {
    const { payload: p, upTo } = buildStepPayload({ payload, entries, done: 0, chunkEntries: 3, doc: null });
    expect(upTo).toBe(3);
    expect(p.id).toBeUndefined();
    expect(p.number).toBe("RCP-1");
    expect(p.description).toBe("Deskripsi");
    expect((p.detailInvoice as Entry[]).map((x) => x.invoiceNo)).toEqual(["INV-001", "INV-002", "INV-003"]);
    expect(p.chequeAmount).toBe(1001 + 1002 + 1003);
    expect(p.detailTax).toBeUndefined();
  });
  test("update: id + baris lama {id} + baris baru; pajak entri baru; cheque akhir di cicilan terakhir", () => {
    const doc: StagedDoc = { id: 77, lines: [1, 2, 3, 4].map((i) => ({ id: i, invoiceNo: `INV-00${i}`, paymentAmount: 1000 + i })), taxIds: [] };
    const mid = buildStepPayload({ payload, entries, done: 4, chunkEntries: 2, doc });
    expect(mid.upTo).toBe(6);
    expect(mid.payload.id).toBe(77);
    expect((mid.payload.detailInvoice as unknown[]).slice(0, 4)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(mid.payload.number).toBeUndefined();
    expect(mid.payload.detailTax).toEqual([{ detailInvoiceNo: "INV-005", taxAmount: 7, taxId: 9 }]);
    expect(mid.payload.chequeAmount).toBe(1001 + 1002 + 1003 + 1004 + 1005 + 1006 - 7);
    const last = buildStepPayload({ payload, entries, done: 6, chunkEntries: 2, doc: { ...doc, lines: [...doc.lines, { id: 5, invoiceNo: "INV-005", paymentAmount: 1005 }, { id: 6, invoiceNo: "INV-006", paymentAmount: 1006 }], taxIds: [55] } });
    expect(last.upTo).toBe(7);
    expect(last.payload.chequeAmount).toBe(payload.chequeAmount);
    expect(last.payload.detailTax).toEqual([{ id: 55 }]);
  });
  test("override cheque pelanggan hanya dipakai di cicilan terakhir", () => {
    const p = basePayload(entries, { chequeAmount: 999_999 });
    expect(buildStepPayload({ payload: p, entries, done: 0, chunkEntries: 3, doc: null }).payload.chequeAmount).toBe(1001 + 1002 + 1003);
    expect(buildStepPayload({ payload: p, entries, done: 0, chunkEntries: 10, doc: null }).payload.chequeAmount).toBe(999_999);
  });
});

describe("runStagedSend", () => {
  test("jalur normal: dokumen akhir identik dengan Excel, kemajuan bertambah, tanpa kirim ulang", async () => {
    const entries = entriesOf(10);
    const fa = fakeAccurate();
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("complete");
    expect(fa.calls.length).toBe(4); // 3+3+3+1
    expect(fa.doc!.lines.map((l) => l.invoiceNo)).toEqual(entries.map((e) => String(e.invoiceNo)));
    expect(fa.doc!.lines.map((l) => l.paymentAmount)).toEqual(entries.map((e) => Number(e.paymentAmount)));
    expect(fa.header!.chequeAmount).toBe(entries.reduce((s, e) => s + Number(e.paymentAmount), 0));
    expect(fa.header!.description).toBe("Deskripsi");
    expect(fa.progress).toEqual([0, 3, 6, 9, 10]);
  });

  test("melanjutkan dokumen yang sudah separuh (Retry / pemulihan): tidak menduplikasi baris", async () => {
    const entries = entriesOf(8);
    const fa = fakeAccurate();
    fa.setDoc({ id: 42, lines: entries.slice(0, 4).map((e, i) => ({ id: 900 + i, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [] });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps, knownProgress: true });
    expect(r.state).toBe("complete");
    expect(fa.calls.every((c) => c.id === 42)).toBe(true);
    expect(fa.doc!.lines.length).toBe(8);
    expect(new Set(fa.doc!.lines.map((l) => l.invoiceNo)).size).toBe(8);
    expect(fa.progress[0]).toBe(4);
  });

  test("dokumen sudah lengkap: tidak mengirim apa pun, selesai", async () => {
    const entries = entriesOf(4);
    const fa = fakeAccurate();
    fa.setDoc({ id: 5, lines: entries.map((e, i) => ({ id: i + 1, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [] });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps, knownProgress: true });
    expect(r).toEqual({ state: "complete", docId: 5, steps: 0 });
    expect(fa.calls.length).toBe(0);
  });

  test("nomor dipakai dokumen lain berisi beda → gagal, TIDAK menimpa", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate();
    fa.setDoc({ id: 5, lines: [{ id: 1, invoiceNo: "LAIN", paymentAmount: 5 }], taxIds: [] });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("failed");
    if (r.state === "failed") expect(r.reason).toBe("mismatch");
    expect(fa.calls.length).toBe(0);
  });

  test("dokumen bernomor sama milik pelanggan LAIN (walau isinya awalan cocok) → gagal, tidak ditambah apa pun", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate();
    fa.setDoc({ id: 5, lines: entries.slice(0, 2).map((e, i) => ({ id: i + 1, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [], partyNo: "C-LAIN" });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("failed");
    if (r.state === "failed") expect(r.reason).toBe("mismatch");
    expect(fa.calls.length).toBe(0);
  });

  test("§ audit: dokumen yang sudah ada (> satu cicilan) dan import ini belum pernah menyimpan apa pun → bukan hasil kita, TIDAK ditambah", async () => {
    const entries = entriesOf(9);
    const fa = fakeAccurate();
    fa.setDoc({ id: 5, lines: entries.slice(0, 5).map((e, i) => ({ id: i + 1, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [] });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps }); // knownProgress tidak diberikan
    expect(r.state).toBe("failed");
    if (r.state === "failed") {
      expect(r.reason).toBe("mismatch");
      expect(r.message).toContain("bukan hasil import ini");
    }
    expect(fa.calls.length).toBe(0);
  });

  test("§ audit: dokumen seukuran satu cicilan (jendela crash saat cicilan pertama) boleh dilanjutkan walau belum ada baris tercatat", async () => {
    const entries = entriesOf(9);
    const fa = fakeAccurate();
    fa.setDoc({ id: 5, lines: entries.slice(0, 3).map((e, i) => ({ id: i + 1, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [] });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("complete");
  });

  test("§ audit: bank berbeda → mismatch, tidak diubah", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate();
    fa.setDoc({ id: 5, lines: entries.slice(0, 2).map((e, i) => ({ id: i + 1, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [], bankNo: "999999" });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps, knownProgress: true });
    expect(r.state).toBe("failed");
    expect(fa.calls.length).toBe(0);
  });

  test("pelanggan sama (beda huruf) atau pihak tak terbaca → dilanjutkan", async () => {
    const entries = entriesOf(6);
    for (const partyNo of ["c1", undefined]) {
      const fa = fakeAccurate();
      fa.setDoc({ id: 5, lines: entries.slice(0, 2).map((e, i) => ({ id: i + 1, invoiceNo: String(e.invoiceNo), paymentAmount: Number(e.paymentAmount) })), taxIds: [], ...(partyNo ? { partyNo } : {}) });
      const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
      expect(r.state).toBe("complete");
    }
  });

  test("timeout tetapi Accurate menyelesaikannya belakangan → menunggu, TIDAK kirim ulang, tanpa duplikat", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate({ failOn: (n) => (n === 2 ? "timeout-applies" : null), applyDelayMs: 20_000 });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("complete");
    expect(fa.calls.length).toBe(2); // tidak ada pengiriman ulang
    expect(fa.doc!.lines.length).toBe(6);
  });

  test("timeout dan update hilang → kirim ulang setelah menunggu, hasil tetap benar", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate({ failOn: (n) => (n === 2 ? "timeout-lost" : null) });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("complete");
    expect(fa.calls.length).toBe(3);
    expect(fa.doc!.lines.map((l) => l.invoiceNo)).toEqual(entries.map((e) => String(e.invoiceNo)));
  });

  test("timeout terus-menerus → menyerah setelah batas percobaan, yang sudah tersimpan tetap dilaporkan", async () => {
    const entries = entriesOf(9);
    const fa = fakeAccurate({ failOn: (n) => (n >= 2 ? "timeout-lost" : null) });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config({ maxAttempts: 3 }), deps: fa.deps });
    expect(r.state).toBe("failed");
    if (r.state === "failed") {
      expect(r.reason).toBe("exhausted");
      expect(r.doneEntries).toBe(3);
    }
    expect(fa.calls.length).toBe(1 + 3);
    expect(fa.doc!.lines.length).toBe(3);
  });

  test("galat bisnis: berhenti segera, tidak diulang, kemajuan sebelumnya utuh", async () => {
    const entries = entriesOf(9);
    const fa = fakeAccurate({ failOn: (n) => (n === 3 ? "business" : null) });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps });
    expect(r.state).toBe("failed");
    if (r.state === "failed") {
      expect(r.reason).toBe("business");
      expect(r.doneEntries).toBe(6);
      expect(r.message).toContain("tidak mencukupi");
    }
    expect(fa.calls.length).toBe(3);
  });

  test("Accurate menjawab sukses tetapi isi tidak bertambah → tidak berputar selamanya", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate({ failOn: () => "ok-but-lost" });
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config({ maxAttempts: 3 }), deps: fa.deps });
    expect(r.state).toBe("failed");
    expect(fa.calls.length).toBeLessThanOrEqual(4);
  });

  test("pembacaan gagal terus → gagal 'unreadable' tanpa mengirim apa pun", async () => {
    const entries = entriesOf(6);
    const fa = fakeAccurate();
    const deps: StagedDeps = { ...fa.deps, lookup: async () => { throw new Error("jaringan"); } };
    const r = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config({ maxAttempts: 2 }), deps });
    expect(r.state).toBe("failed");
    if (r.state === "failed") expect(r.reason).toBe("unreadable");
    expect(fa.calls.length).toBe(0);
  });

  test("proses mati di tengah lalu dijalankan ulang (simulasi restart): hasil akhir benar tanpa duplikat", async () => {
    const entries = entriesOf(11);
    const fa = fakeAccurate();
    let calls = 0;
    const dying: StagedDeps = { ...fa.deps, save: async (p) => { calls += 1; if (calls === 3) throw new Error("proses dihentikan"); return fa.deps.save(p); } };
    // Galat non-Accurate dianggap sementara; batasi percobaan agar proses "mati" cepat.
    const first = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config({ maxAttempts: 1 }), deps: dying });
    expect(first.state).toBe("failed");
    const second = await runStagedSend({ number: "RCP-1", payload: basePayload(entries), config: config(), deps: fa.deps, knownProgress: true });
    expect(second.state).toBe("complete");
    expect(fa.doc!.lines.map((l) => l.invoiceNo)).toEqual(entries.map((e) => String(e.invoiceNo)));
  });
});

describe("isRetryableStagedError", () => {
  test("timeout/5xx/429/jaringan boleh; galat bisnis 200/4xx tidak", () => {
    expect(isRetryableStagedError(new AccurateTimeoutError(1, 1))).toBe(true);
    expect(isRetryableStagedError(new AccurateApiError("x", 503))).toBe(true);
    expect(isRetryableStagedError(new AccurateApiError("x", 429))).toBe(true);
    expect(isRetryableStagedError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableStagedError(new AccurateApiError("Nilai", 200))).toBe(false);
    expect(isRetryableStagedError(new AccurateApiError("x", 400))).toBe(false);
  });
});
