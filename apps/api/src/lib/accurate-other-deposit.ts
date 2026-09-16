import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-other-deposit.md — save.do PER-GRUP (bukan bulk-save.do,
// konsisten pola modul lain). TIDAK ada lookup akun COA sebelum panggil
// ini — `accountNo`/`bankNo` dikirim APA ADANYA sebagai string, Accurate
// yang validasi eksistensinya (menolak `s:false` kalau akun tidak
// ditemukan).
export type OtherDepositSaveResult = {
  id: number;
  number: string;
};

export async function saveOtherDeposit(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<OtherDepositSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/other-deposit/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<OtherDepositSaveResult>(res);
  });
}
