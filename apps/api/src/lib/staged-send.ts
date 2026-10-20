import { AccurateApiError } from "./accurate";
import { AccurateTimeoutError } from "./accurate-http";

// § Fase 205, ADR-0051, architecture-staged-send.md — kirim dokumen besar ke Accurate secara BERTAHAP (cicilan) ke DOKUMEN YANG SAMA.
// ATURAN EMAS: Facport TIDAK PERNAH mengubah dokumen pelanggan — nomor, header, isi, dan urutan baris di Accurate harus identik dengan Excel; yang diatur hanya
// CARA KIRIM. Waktu Accurate ∝ N² (tiap update memproses ulang seluruh dokumen), jadi cara ini LEBIH LAMBAT daripada sekali kirim, tetapi tiap langkah punya batas
// waktu sendiri, kemajuannya tersimpan di Accurate, dan bisa dilanjutkan. Sumber kebenaran = ISI DOKUMEN di Accurate (dibaca by nomor), bukan catatan lokal.
// Modul ini MURNI (semua I/O disuntikkan lewat `StagedDeps`) supaya idempotensi/retry bisa diuji tanpa Accurate.

export type StagedConfig = {
  modules: ReadonlySet<string>;
  thresholdRows: number;
  chunkEntries: number;
  maxAttempts: number;
  backoffBaseMs: number;
  pollIntervalMs: number;
  secondsCoeff: number;
  maxResumes: number;
  /** Perkiraan waktu kirim bertahap di atas ini → dokumen TIDAK dicicil (menahan slot worker berhari-hari); default 24 jam. */
  maxEstimateSeconds: number;
};

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function boundedNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Modul yang BOLEH memakai pengiriman bertahap (kode modul, bukan label). Selain dua ini belum dianalisis/diuji. */
export const STAGED_CAPABLE_MODULES = ["sales_receipt", "purchase_payment"] as const;

export function parseStagedConfig(source: Record<string, string | undefined>): StagedConfig {
  const requested = (source.IMPORT_STAGED_MODULES ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => (STAGED_CAPABLE_MODULES as readonly string[]).includes(m));
  return {
    modules: new Set(requested),
    thresholdRows: boundedInt(source.IMPORT_STAGED_THRESHOLD_ROWS, 200, 2, 100_000),
    chunkEntries: boundedInt(source.IMPORT_STAGED_CHUNK_ROWS, 500, 1, 10_000),
    maxAttempts: boundedInt(source.IMPORT_STAGED_MAX_ATTEMPTS, 4, 1, 20),
    backoffBaseMs: boundedInt(source.IMPORT_STAGED_BACKOFF_BASE_MS, 30_000, 0, 600_000),
    pollIntervalMs: boundedInt(source.IMPORT_STAGED_POLL_INTERVAL_MS, 15_000, 1_000, 120_000),
    secondsCoeff: boundedNumber(source.IMPORT_STAGED_SECONDS_COEFF, 7e-4, 1e-6, 1),
    maxResumes: boundedInt(source.IMPORT_STAGED_MAX_RESUMES, 5, 0, 50),
    maxEstimateSeconds: boundedInt(source.IMPORT_STAGED_MAX_ESTIMATE_SECONDS, 86_400, 60, 14 * 86_400),
  };
}

export function isStagedModule(config: StagedConfig, module: string): boolean {
  return config.modules.has(module);
}

/** Satu dokumen dikirim bertahap bila modulnya bersaklar dan jumlah BARIS Excel-nya melebihi ambang. */
export function shouldStage(config: StagedConfig, module: string, rowCount: number): boolean {
  return isStagedModule(config, module) && rowCount > config.thresholdRows;
}

// ---------- model waktu (trial: update dokumen N baris ≈ 1,6 × 3,2e-4 × N² dtk; buat baru ≈ 3,2e-4 × N²) ----------

export function estimateStepSeconds(totalEntriesAfter: number, config: Pick<StagedConfig, "secondsCoeff">): number {
  return config.secondsCoeff * totalEntriesAfter * totalEntriesAfter;
}

/** Perkiraan total detik untuk dokumen `totalEntries` entri dikirim dalam cicilan `chunk` entri (jumlah langkah = ceil(total/chunk)). */
export function estimateTotalSeconds(totalEntries: number, config: Pick<StagedConfig, "secondsCoeff" | "chunkEntries">): number {
  if (totalEntries <= 0) return 0;
  const chunk = Math.max(1, config.chunkEntries);
  let total = 0;
  for (let done = chunk; ; done += chunk) {
    const after = Math.min(done, totalEntries);
    total += estimateStepSeconds(after, config);
    if (after >= totalEntries) break;
  }
  return Math.ceil(total);
}

// ---------- entri & pajak ----------

export type Entry = Record<string, unknown>;

export function normalizeInvoiceKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Kunci entri per baris Excel: sama persis dengan penggabungan di builder payload (faktur sama → 1 entri; faktur kosong → entri sendiri). */
export function entryKeysForRows(invoiceNos: unknown[]): string[] {
  return invoiceNos.map((v, i) => {
    const k = normalizeInvoiceKey(v);
    return k === "" ? `__row${i}` : k;
  });
}

/** Indeks entri (urutan kemunculan pertama) untuk tiap baris. */
export function rowEntryIndexes(keys: string[]): { indexes: number[]; entryCount: number } {
  const seen = new Map<string, number>();
  const indexes = keys.map((k) => {
    let idx = seen.get(k);
    if (idx === undefined) {
      idx = seen.size;
      seen.set(k, idx);
    }
    return idx;
  });
  return { indexes, entryCount: seen.size };
}

function taxesForEntries(payload: Record<string, unknown>, entries: Entry[]): Record<string, unknown>[] {
  const all = (payload.detailTax as Record<string, unknown>[] | undefined) ?? [];
  if (all.length === 0) return [];
  const keys = new Set(entries.map((e) => normalizeInvoiceKey(e.invoiceNo)));
  return all.filter((t) => keys.has(normalizeInvoiceKey(t.detailInvoiceNo)));
}

/** `chequeAmount` sementara = rumus builder (Σ bayar − Σ pajak − Σ diskon, × kurs) atas entri yang sudah termasuk. */
export function partialChequeAmount(payload: Record<string, unknown>, entries: Entry[]): number {
  const rate = payload.rate !== undefined ? Number(payload.rate) : 1;
  const pay = entries.reduce((s, e) => s + Number(e.paymentAmount ?? 0), 0);
  const tax = taxesForEntries(payload, entries).reduce((s, t) => s + Number(t.taxAmount ?? 0), 0);
  const disc = entries.reduce(
    (s, e) => s + ((e.detailDiscount as { amount: number }[] | undefined) ?? []).reduce((inner, d) => inner + Number(d.amount ?? 0), 0),
    0,
  );
  return (pay - tax - disc) * rate;
}

// ---------- isi dokumen di Accurate ----------

export type StagedLine = { id: number; invoiceNo: string; paymentAmount: number };
/** `partyNo` = nomor pelanggan (Sales Receipt) / pemasok (Purchase Payment) pada dokumen, bila terbaca — dipakai memastikan dokumen bernomor sama itu memang milik pihak yang sama. */
export type StagedDoc = { id: number; lines: StagedLine[]; taxIds: number[]; partyNo?: string; bankNo?: string };

const AMOUNT_EPSILON = 0.005;

/**
 * Berapa entri Excel (dari awal) yang SUDAH ada di dokumen, bila isi dokumen adalah AWALAN PERSIS dari entri Excel (faktur sama, jumlah sama, urutan sama).
 * -1 = isi dokumen bukan awalan dari entri Excel (dokumen lain / berbeda) → jangan sentuh.
 */
export function matchExistingPrefix(lines: StagedLine[], entries: Entry[]): number {
  if (lines.length > entries.length) return -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const entry = entries[i]!;
    if (normalizeInvoiceKey(line.invoiceNo) !== normalizeInvoiceKey(entry.invoiceNo)) return -1;
    if (Math.abs(Number(line.paymentAmount) - Number(entry.paymentAmount ?? 0)) > AMOUNT_EPSILON) return -1;
  }
  return lines.length;
}

/**
 * Payload satu cicilan. `doc === null` → BUAT dokumen (header lengkap + cicilan pertama). Ada dokumen → UPDATE `{id, chequeAmount, detailInvoice}` dengan baris lama
 * cukup `{id}` (terbukti di trial 205a: header tidak perlu diulang, baris lama tidak diproses ulang nilainya). Cicilan terakhir memakai `chequeAmount` AKHIR asli
 * (termasuk override pelanggan); cicilan sebelumnya memakai nilai sementara.
 */
export function buildStepPayload(args: {
  payload: Record<string, unknown>;
  entries: Entry[];
  done: number;
  chunkEntries: number;
  doc: StagedDoc | null;
}): { payload: Record<string, unknown>; upTo: number } {
  const { payload, entries, done, chunkEntries, doc } = args;
  const upTo = Math.min(done + chunkEntries, entries.length);
  const isLast = upTo >= entries.length;
  const included = entries.slice(0, upTo);
  const fresh = entries.slice(done, upTo);
  const chequeAmount = isLast ? payload.chequeAmount : partialChequeAmount(payload, included);
  const freshTaxes = taxesForEntries(payload, fresh);

  if (!doc) {
    const { detailInvoice: _di, detailTax: _dt, chequeAmount: _ca, ...header } = payload;
    const step: Record<string, unknown> = { ...header, chequeAmount, detailInvoice: fresh };
    if (freshTaxes.length > 0) step.detailTax = freshTaxes;
    return { payload: step, upTo };
  }
  const step: Record<string, unknown> = {
    id: doc.id,
    chequeAmount,
    detailInvoice: [...doc.lines.map((l) => ({ id: l.id })), ...fresh],
  };
  if (doc.taxIds.length > 0 || freshTaxes.length > 0) step.detailTax = [...doc.taxIds.map((id) => ({ id })), ...freshTaxes];
  return { payload: step, upTo };
}

// ---------- pelaksana ----------

export type StagedDeps = {
  lookup: (number: string) => Promise<StagedDoc | null>;
  save: (payload: Record<string, unknown>) => Promise<{ id: number }>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Dipanggil setiap kali jumlah entri yang TERBUKTI tersimpan di Accurate bertambah (atau pertama kali diketahui). */
  onProgress: (doneEntries: number, docId: number | null) => Promise<void>;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export type StagedResult =
  | { state: "complete"; docId: number; steps: number }
  | { state: "failed"; reason: "mismatch" | "business" | "exhausted" | "unreadable"; message: string; error?: unknown; doneEntries: number; docId: number | null };

/** Galat sementara (aman diulang setelah memeriksa isi dokumen): timeout, jaringan, 5xx/429. Galat bisnis Accurate (`s:false`, 4xx) TIDAK. */
export function isRetryableStagedError(err: unknown): boolean {
  if (err instanceof AccurateTimeoutError) return true;
  if (err instanceof AccurateApiError) return err.httpStatus >= 500 || err.httpStatus === 429;
  return true; // TypeError/jaringan/abort dsb: keadaan tak pasti → verifikasi dulu, jangan anggap gagal bisnis
}

function backoffMs(config: StagedConfig, attempt: number): number {
  return Math.min(config.backoffBaseMs * 2 ** Math.max(0, attempt - 1), 600_000);
}

export async function runStagedSend(args: {
  number: string;
  payload: Record<string, unknown>;
  config: StagedConfig;
  deps: StagedDeps;
  /** Sudah ada baris batch ini yang tercatat tersimpan (kita yang membuat/melanjutkan dokumen itu) — bukti kepemilikan untuk melanjutkan dokumen yang sudah ada. */
  knownProgress?: boolean;
}): Promise<StagedResult> {
  const { number, payload, config, deps } = args;
  let ours = args.knownProgress === true; // dokumen yang sudah ada boleh dilanjutkan hanya bila terbukti hasil import ini
  const entries = (payload.detailInvoice as Entry[] | undefined) ?? [];
  const log = deps.log ?? (() => {});
  let steps = 0;
  let attempt = 0; // percobaan pada posisi (jumlah entri tersimpan) yang sama
  let lastDone = -1;
  let docId: number | null = null;
  let doneEntries = 0;
  let savedOkFrom: number | null = null; // posisi sebelum `save` yang dijawab sukses; kemajuan HARUS terlihat di bacaan berikutnya

  for (let guard = 0; guard < 100_000; guard++) {
    // 1. Kenyataan di Accurate.
    let doc: StagedDoc | null;
    try {
      doc = await deps.lookup(number);
    } catch (err) {
      attempt += 1;
      log("staged_lookup_failed", { number, attempt, err: err instanceof Error ? err.message : String(err) });
      if (attempt >= config.maxAttempts) {
        return { state: "failed", reason: "unreadable", message: `Tidak dapat membaca dokumen "${number}" dari Accurate setelah ${attempt} percobaan.`, error: err, doneEntries, docId };
      }
      await deps.sleep(backoffMs(config, attempt));
      continue;
    }
    const payloadParty = normalizeInvoiceKey(payload.customerNo ?? payload.vendorNo);
    const payloadBank = normalizeInvoiceKey(payload.bankNo);
    const headerMismatch =
      doc !== null &&
      ((doc.partyNo !== undefined && payloadParty !== "" && normalizeInvoiceKey(doc.partyNo) !== payloadParty) ||
        (doc.bankNo !== undefined && payloadBank !== "" && normalizeInvoiceKey(doc.bankNo) !== payloadBank));
    const done = doc ? (headerMismatch ? -1 : matchExistingPrefix(doc.lines, entries)) : 0;
    if (done < 0) {
      return {
        state: "failed",
        reason: "mismatch",
        message: `Dokumen bernomor "${number}" sudah ada di Accurate tetapi isinya berbeda dari Excel (pelanggan/pemasok, bank, atau daftar faktur/jumlahnya tidak sama). Dokumen itu TIDAK diubah. Periksa dokumen tersebut di Accurate, atau gunakan nomor lain di Excel.`,
        doneEntries,
        docId: doc?.id ?? null,
      };
    }
    if (doc && done > 0 && !ours && done > config.chunkEntries) {
      // Dokumen berisi lebih dari satu cicilan padahal import ini belum pernah menyimpan apa pun → bukan hasil kita; jangan ditambah/diubah.
      return {
        state: "failed",
        reason: "mismatch",
        message: `Dokumen bernomor "${number}" sudah ada di Accurate (${done} baris) dan bukan hasil import ini, walau isinya diawali sama dengan Excel. Facport tidak menambah atau mengubah dokumen yang tidak dibuat oleh import ini. Periksa dokumen itu di Accurate, atau gunakan nomor lain di Excel.`,
        doneEntries,
        docId: doc.id,
      };
    }
    docId = doc?.id ?? null;
    doneEntries = done;
    if (savedOkFrom !== null && done <= savedOkFrom) {
      // Accurate menjawab sukses tetapi isi dokumen tidak bertambah — jangan percaya buta, jangan berputar tanpa batas.
      attempt += 1;
      log("staged_no_progress_after_ok", { number, done, attempt });
      if (attempt >= config.maxAttempts) {
        return { state: "failed", reason: "exhausted", message: `Accurate menjawab sukses tetapi isi dokumen "${number}" tidak bertambah (tersimpan ${done} dari ${entries.length} entri) setelah ${attempt} percobaan.`, doneEntries, docId };
      }
      await deps.sleep(backoffMs(config, attempt));
    }
    savedOkFrom = null;
    if (done !== lastDone) {
      lastDone = done;
      attempt = 0;
      await deps.onProgress(done, docId);
    }
    if (done >= entries.length && doc) return { state: "complete", docId: doc.id, steps };

    // 2. Satu cicilan.
    const step = buildStepPayload({ payload, entries, done, chunkEntries: config.chunkEntries, doc });
    steps += 1;
    ours = true; // mulai sini kita yang menulis ke dokumen ini
    const started = deps.now();
    try {
      await deps.save(step.payload);
      log("staged_step_ok", { number, from: done, to: step.upTo, ms: deps.now() - started });
      savedOkFrom = done;
      continue; // loop berikutnya membaca ulang & memverifikasi
    } catch (err) {
      log("staged_step_error", { number, from: done, to: step.upTo, ms: deps.now() - started, retryable: isRetryableStagedError(err), err: err instanceof Error ? err.message : String(err) });
      if (!isRetryableStagedError(err)) {
        // Galat bisnis — tetapi periksa dulu: mungkin dokumen sudah maju (mis. percobaan sebelumnya baru selesai).
        let after: StagedDoc | null = null;
        try {
          after = await deps.lookup(number);
        } catch {
          /* abaikan: tetap gagal bisnis */
        }
        const afterDone = after ? matchExistingPrefix(after.lines, entries) : 0;
        if (afterDone > done) continue;
        return { state: "failed", reason: "business", message: err instanceof Error ? err.message : String(err), error: err, doneEntries: done, docId };
      }
      // Tak pasti: Accurate bisa tetap menyelesaikan update walau koneksi putus (uji trial 205a). Tunggu & baca ulang sebelum mengirim ulang.
      const waitMaxMs = Math.max(300_000, Math.ceil(estimateStepSeconds(step.upTo, config) * 2 * 1000));
      const waitStart = deps.now();
      let advanced = false;
      while (deps.now() - waitStart < waitMaxMs) {
        await deps.sleep(config.pollIntervalMs);
        try {
          const probe = await deps.lookup(number);
          const probeDone = probe ? matchExistingPrefix(probe.lines, entries) : 0;
          if (probeDone > done || (probeDone < 0 && probe)) {
            advanced = true;
            break;
          }
        } catch {
          /* baca gagal sesaat — lanjut menunggu */
        }
      }
      if (advanced) continue;
      attempt += 1;
      if (attempt >= config.maxAttempts) {
        return {
          state: "failed",
          reason: "exhausted",
          message: `Pengiriman bertahap dokumen "${number}" berhenti setelah ${attempt} percobaan pada ${done} dari ${entries.length} entri (Accurate tidak menyelesaikan atau tidak menjawab). Yang sudah tersimpan tetap ada di Accurate; tekan Retry untuk melanjutkan dari sana.`,
          error: err,
          doneEntries: done,
          docId,
        };
      }
      await deps.sleep(backoffMs(config, attempt));
    }
  }
  return { state: "failed", reason: "exhausted", message: `Pengiriman bertahap dokumen "${number}" melebihi batas langkah.`, doneEntries, docId };
}
