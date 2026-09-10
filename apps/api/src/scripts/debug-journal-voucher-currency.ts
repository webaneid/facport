// § Script debug SEKALI PAKAI (2026-09-10) — BUKAN bagian dari fitur/test
// suite permanen, tujuannya riset apakah `journal-voucher/save.do`
// (yang TIDAK punya field currency sama sekali di spec resmi, dicek
// exhaustif 2 versi OpenAPI berbeda + semua endpoint journal-voucher
// lain) benar-benar TIDAK butuh input currency — hipotesis: currency
// adalah properti TETAP akun COA (`glaccount/save.do` § `currencyCode`
// wajib saat bikin akun), bukan input per-transaksi Jurnal Umum. Test
// call nyata ini untuk lihat apakah response echo balik info currency
// dari akun yang dipakai (mengonfirmasi/membantah teori itu).
//
// ⚠️ PERINGATAN: script ini BENAR-BENAR bikin transaksi Jurnal Umum
// BARU di Accurate (bukan sandbox) — pakai akun TEST, nominal kecil.
import { db } from "../lib/db";
import { accurateConnections } from "../db/schema";
import { eq } from "drizzle-orm";
import { openAccurateSession } from "../lib/accurate-session";
import { refreshAccessToken } from "../lib/accurate";
import { encrypt, decrypt } from "../lib/encryption";

async function main() {
  const debitAccountNo = process.env.DEBIT_ACCOUNT_NO;
  const creditAccountNo = process.env.CREDIT_ACCOUNT_NO;
  if (!debitAccountNo || !creditAccountNo) {
    console.error("WAJIB isi env DEBIT_ACCOUNT_NO, CREDIT_ACCOUNT_NO (kode akun COA, contoh: 6-20500 dan 1-10200).");
    process.exit(1);
  }
  const amount = Number(process.env.AMOUNT ?? 10000);
  const branchName = process.env.BRANCH_NAME;

  const connectionId = process.env.CONNECTION_ID;
  if (!connectionId) {
    console.error("WAJIB isi env CONNECTION_ID (uuid `accurate_connections.id`).");
    process.exit(1);
  }
  const [connection] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, connectionId)).limit(1);
  if (!connection) {
    console.error(`Koneksi Accurate dengan id ${connectionId} tidak ditemukan.`);
    process.exit(1);
  }
  console.log(`Pakai koneksi Accurate: accurateDbAlias=${connection.accurateDbAlias} userId=${connection.userId}`);

  let workingConnection = connection;
  try {
    const refreshed = await refreshAccessToken(decrypt(connection.refreshTokenEncrypted));
    await db
      .update(accurateConnections)
      .set({
        accessTokenEncrypted: encrypt(refreshed.access_token),
        refreshTokenEncrypted: encrypt(refreshed.refresh_token),
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(accurateConnections.id, connection.id));
    const [refetched] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, connection.id));
    if (refetched) workingConnection = refetched;
    console.log("Access token berhasil di-refresh sebelum test.");
  } catch (err) {
    console.log("Refresh token gagal (lanjut pakai token lama apa adanya):", err instanceof Error ? err.message : String(err));
  }

  const ctx = await openAccurateSession(workingConnection);

  // § round 2 (2026-09-10) — round 1 (tanpa rate/primeAmount) balikin
  // error "Kurs tidak valid. Cek nilai kurs!" — TERKONFIRMASI Accurate
  // otomatis tahu CREDIT_ACCOUNT_NO itu akun mata uang asing (padahal
  // kita TIDAK PERNAH kirim currency apa pun), langsung minta kurs.
  // Sekarang isi RATE/PRIME_AMOUNT di baris kredit (akun asing) untuk
  // buktikan ini benar-benar solusinya.
  const rate = process.env.RATE ? Number(process.env.RATE) : undefined;
  const primeAmount = process.env.PRIME_AMOUNT ? Number(process.env.PRIME_AMOUNT) : undefined;
  const creditLine: Record<string, unknown> = { accountNo: creditAccountNo, amount, amountType: "CREDIT" };
  if (rate !== undefined) creditLine.rate = rate;
  if (primeAmount !== undefined) creditLine.primeAmount = primeAmount;

  const payload: Record<string, unknown> = {
    transDate: new Date().toLocaleDateString("en-GB").split("/").join("/"),
    detailJournalVoucher: [{ accountNo: debitAccountNo, amount, amountType: "DEBIT" }, creditLine],
  };
  if (branchName) payload.branchName = branchName;

  console.log("Payload yang dikirim ke journal-voucher/save.do:");
  console.log(JSON.stringify(payload, null, 2));

  const res = await fetch(`${ctx.host}/accurate/api/journal-voucher/save.do`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "X-Session-ID": ctx.session,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  console.log(`\nHTTP status: ${res.status}`);
  console.log("Response body mentah:");
  console.log(rawText);

  // § cari kata "currenc" di mana pun dalam response (nested account/gl
  // object) — kalau ADA, itu bukti currency ikut akun (echo balik),
  // bukan input transaksi.
  const hasCurrency = /currenc/i.test(rawText);
  console.log(`\n>>> Kata "currency"/"currencyId" ditemukan di response: ${hasCurrency}`);
}

main().then(() => process.exit(0));
