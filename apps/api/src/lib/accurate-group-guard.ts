import { AccurateTimeoutError } from "./accurate-http";
import type { VerifyOutcome } from "./accurate-verify";
// § Fase 195 — pesan galat bermakna untuk timeout Accurate (insiden 2026-10-14: 1 Sales Receipt ±1.250 baris → "The operation timed out." setelah ±6 menit).
// Guard batas baris per transaksi (MAX_ROWS_PER_TRANSACTION) DICABUT 2026-10-19: batas 1000 tebakan sendiri, bukan batas Accurate, dan memblokir client yang sebelumnya berhasil (2.019 baris).

const TIMEOUT_MESSAGE =
  "Accurate tidak membalas dalam batas waktu. Transaksi MUNGKIN sudah tersimpan di Accurate — periksa dulu di Accurate sebelum import ulang agar tidak terjadi duplikat. " +
  "Jika transaksi ini sangat besar (ribuan baris dengan nomor yang sama), pecah menjadi beberapa nomor transaksi.";

/** Pesan galat untuk disimpan di baris gagal: timeout → penjelasan bermakna; galat lain apa adanya (pesan asli Accurate tetap tampil). */
export function describeAccurateFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if ((err instanceof Error && err.name === "TimeoutError") || /operation timed out/i.test(message)) {
    // § Fase 199 — timeout kini batas KITA (adaptif); sebutkan lama menunggu & ukuran agar bisa ditindaklanjuti.
    if (err instanceof AccurateTimeoutError) {
      const minutes = Math.max(1, Math.round(err.waitedMs / 60_000));
      const size = err.lines > 0 ? ` untuk ${err.lines.toLocaleString("id-ID")} baris` : "";
      return `Accurate belum membalas setelah ${minutes} menit menunggu${size}. ${TIMEOUT_MESSAGE.replace(/^Accurate tidak membalas dalam batas waktu\. /, "")}`;
    }
    return TIMEOUT_MESSAGE;
  }
  return message;
}

/**
 * § Fase 199 (C2) — pesan baris gagal setelah timeout DAN pengecekan ke Accurate lewat nomor transaksi. `absent` ≠ "pasti tidak ada": Accurate bisa saja
 * baru selesai memprosesnya sesudah pengecekan terakhir, jadi tetap menyarankan periksa sebelum import ulang (cegah duplikat). `unknown` = pengecekan gagal.
 */
export function describeTimeoutAfterVerification(err: AccurateTimeoutError, outcome: VerifyOutcome, transactionNumber: string): string {
  const waited = Math.max(1, Math.round(err.waitedMs / 60_000));
  const size = err.lines > 0 ? ` untuk ${err.lines.toLocaleString("id-ID")} baris` : "";
  const head = `Accurate belum membalas setelah ${waited} menit menunggu${size}.`;
  if (outcome.state === "absent") {
    const checked = Math.max(1, Math.round(outcome.waitedMs / 60_000));
    return (
      `${head} Kami sudah memeriksa Accurate selama ±${checked} menit sesudahnya: nomor "${transactionNumber}" BELUM terlihat di Accurate. ` +
      "Accurate bisa saja masih memproses — periksa di Accurate beberapa menit lagi sebelum import ulang agar tidak terjadi duplikat. " +
      "Jika tetap tidak ada, pecah menjadi beberapa nomor transaksi (maks. ±1.000 baris per nomor) lalu import ulang."
    );
  }
  return `${head} Pengecekan otomatis ke Accurate untuk nomor "${transactionNumber}" juga tidak berhasil, jadi transaksi MUNGKIN sudah tersimpan — periksa dulu di Accurate sebelum import ulang agar tidak terjadi duplikat.`;
}
