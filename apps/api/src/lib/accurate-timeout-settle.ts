import type { AccurateTimeoutError } from "./accurate-http";
import { describeTimeoutAfterVerification } from "./accurate-group-guard";
import { verifyAfterTimeout, type VerifyDeps, type VerifyOutcome } from "./accurate-verify";

// § Fase 199 (C2) — keputusan akhir untuk SATU grup yang `save.do`-nya timeout: tanya Accurate lewat nomor transaksi, lalu tentukan status baris.
// Dipisah dari worker agar bisa diuji tanpa menjalankan seluruh handler import.
export type SettledTimeout =
  | { status: "success"; transactionId: string; outcome: VerifyOutcome }
  | { status: "failed"; message: string; outcome: VerifyOutcome };

export async function settleTimedOutGroup(
  err: AccurateTimeoutError,
  transactionNumber: string,
  lookup: () => Promise<{ id: number } | null>,
  deps?: VerifyDeps,
): Promise<SettledTimeout> {
  const outcome = await verifyAfterTimeout(lookup, deps);
  if (outcome.state === "found") return { status: "success", transactionId: String(outcome.id), outcome };
  return { status: "failed", message: describeTimeoutAfterVerification(err, outcome, transactionNumber), outcome };
}
