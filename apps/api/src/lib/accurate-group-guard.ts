import { env } from "./env";

// § Fase 195 — satu transaksi Accurate (baris-baris Excel dengan nomor yang sama digabung jadi 1 dokumen) yang terlalu besar tidak sanggup diproses Accurate dalam batas waktu
// (insiden 2026-10-14: 1 Sales Receipt ±1.250 baris → "The operation timed out." setelah ±6 menit, semua baris gagal sekaligus). Guard ini menolak LEBIH AWAL dengan pesan yang
// bisa ditindaklanjuti, dan `describeAccurateFailure` mengganti pesan timeout mentah dengan penjelasan. Batas default 1000 BELUM diukur — nilai konservatif dari kegagalan yang teramati
// (1.239–1.539 baris gagal); sesuaikan lewat env `MAX_ROWS_PER_TRANSACTION` setelah ada pengukuran.
export const DEFAULT_MAX_ROWS_PER_TRANSACTION = 1000;
const MIN_MAX_ROWS_PER_TRANSACTION = 50;
const MAX_MAX_ROWS_PER_TRANSACTION = 10_000;

export function parseMaxRowsPerTransaction(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return DEFAULT_MAX_ROWS_PER_TRANSACTION;
  return Math.min(Math.max(n, MIN_MAX_ROWS_PER_TRANSACTION), MAX_MAX_ROWS_PER_TRANSACTION);
}

export class GroupTooLargeError extends Error {
  constructor(rowCount: number, limit: number) {
    super(
      `Satu transaksi (baris dengan nomor yang sama) berisi ${rowCount.toLocaleString("id-ID")} baris, melebihi batas ${limit.toLocaleString("id-ID")} baris per transaksi — terlalu besar untuk diproses Accurate. ` +
        "Pecah menjadi beberapa nomor transaksi (maks. sekitar 200 baris per nomor lebih aman), lalu import ulang.",
    );
    this.name = "GroupTooLargeError";
  }
}

export function assertGroupSizeWithinLimit(rowCount: number, limit: number = parseMaxRowsPerTransaction(env.MAX_ROWS_PER_TRANSACTION)): void {
  if (rowCount > limit) throw new GroupTooLargeError(rowCount, limit);
}

const TIMEOUT_MESSAGE =
  "Accurate tidak membalas dalam batas waktu. Transaksi MUNGKIN sudah tersimpan di Accurate — periksa dulu di Accurate sebelum import ulang agar tidak terjadi duplikat. " +
  "Jika transaksi ini sangat besar (ribuan baris dengan nomor yang sama), pecah menjadi beberapa nomor transaksi.";

/** Pesan galat untuk disimpan di baris gagal: timeout → penjelasan bermakna; galat lain apa adanya (pesan asli Accurate tetap tampil). */
export function describeAccurateFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if ((err instanceof Error && err.name === "TimeoutError") || /operation timed out/i.test(message)) return TIMEOUT_MESSAGE;
  return message;
}
