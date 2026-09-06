import { parseAccurateSaveEnvelope } from "./accurate";
import { withAccurateRateLimit } from "./accurate-rate-limiter";
import type { AccurateSessionContext } from "./accurate-session";

// § architecture-journal-voucher.md — save.do PER-BARIS (bukan
// bulk-save.do, konsisten pola modul lain). TIDAK ada lookup akun COA
// sebelum panggil ini — `accountNo` dikirim APA ADANYA sebagai string,
// Accurate yang validasi eksistensinya (menolak `s:false` kalau akun
// tidak ditemukan, ATAU kalau debit/kredit tidak seimbang — walau
// balance SUDAH divalidasi lokal di buildJournalVoucherPayload()
// sebelum sampai sini).
export type JournalVoucherSaveResult = {
  id: number;
  number: string;
};

export async function saveJournalVoucher(
  ctx: AccurateSessionContext,
  payload: Record<string, unknown>,
): Promise<JournalVoucherSaveResult> {
  return withAccurateRateLimit(async () => {
    const res = await fetch(`${ctx.host}/accurate/api/journal-voucher/save.do`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "X-Session-ID": ctx.session,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseAccurateSaveEnvelope<JournalVoucherSaveResult>(res);
  });
}
