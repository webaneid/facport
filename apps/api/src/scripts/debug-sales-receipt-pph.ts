// § Script debug SEKALI PAKAI (2026-09-10) — BUKAN bagian dari fitur/test
// suite permanen, tujuannya isolasi apakah `detailInvoice[].paidPph`/
// `pphNumber` di `sales-receipt/save.do` benar-benar diproses Accurate,
// TANPA lewat pipeline import (grouping/validasi Tax ID/dst) yang bisa
// menyembunyikan sumber masalah. Lihat `docs/phases/phase-85-ekspansi-field-sales-receipt.md`
// § "Belum diverifikasi test call nyata" — field ini diimplementasi dari
// spec resmi doang, baru sekarang benar-benar dites ke Accurate sungguhan.
//
// ⚠️ PERINGATAN: script ini BENAR-BENAR bikin transaksi Sales Receipt
// BARU di Accurate (bukan sandbox) — pakai invoice TEST, bukan invoice
// pelanggan asli, dan `PAYMENT_AMOUNT` kecil.
//
// Cara pakai (jalankan DI DALAM container `api` production, supaya
// DATABASE_URL + ACCURATE_TOKEN_ENCRYPTION_KEY otomatis cocok):
//   docker compose -f docker-compose.prod.yml --env-file .env.production --env-file .env.deploy \
//     exec api bun run src/scripts/debug-sales-receipt-pph.ts
//
// Override parameter lewat environment variable (WAJIB isi sesuai data usaha kamu):
//   CUSTOMER_NO, BANK_NO, BRANCH_NAME, INVOICE_NO   -- WAJIB
//   PAYMENT_AMOUNT   (default 100000 -- GROSS, SEBELUM potong PPh)
//   PPH_AMOUNT       (default 2000   -- nominal PPh yang mau diuji, dari screenshot manual Accurate)
//   PPH_NUMBER       (default "TEST-001")
//   NET_MODE         ("1" = kirim paymentAmount NET/setelah dipotong PPh, sesuai perilaku
//                      manual UI Accurate di screenshot user 2026-09-10; default "0" = GROSS,
//                      sesuai perilaku `buildSalesReceiptPayload` SAAT INI)
import { db } from "../lib/db";
import { accurateConnections } from "../db/schema";
import { eq } from "drizzle-orm";
import { openAccurateSession } from "../lib/accurate-session";
import { refreshAccessToken } from "../lib/accurate";
import { encrypt, decrypt } from "../lib/encryption";
import { findTaxByIdentifier } from "../lib/accurate-tax";

async function main() {
  const customerNo = process.env.CUSTOMER_NO;
  const bankNo = process.env.BANK_NO;
  const branchName = process.env.BRANCH_NAME;
  const invoiceNo = process.env.INVOICE_NO;
  if (!customerNo || !bankNo || !branchName || !invoiceNo) {
    console.error("WAJIB isi env CUSTOMER_NO, BANK_NO, BRANCH_NAME, INVOICE_NO (lihat komentar di atas file ini).");
    process.exit(1);
  }
  const grossAmount = Number(process.env.PAYMENT_AMOUNT ?? 100000);
  const pphAmount = Number(process.env.PPH_AMOUNT ?? 2000);
  const pphNumber = process.env.PPH_NUMBER ?? "TEST-001";
  const netMode = process.env.NET_MODE === "1";
  const paymentAmount = netMode ? grossAmount - pphAmount : grossAmount;

  // § CONNECTION_ID BARU (ganti CONNECTION_USER_ID) — ternyata ada
  // BANYAK baris `accurate_connections` berstatus "active" untuk user+
  // company yang sama (kemungkinan bug terpisah: baris lama tidak
  // ke-revoke saat reconnect), jadi "userId + paling baru diupdate"
  // TETAP bisa salah pilih. Resolusi SUNGGUHAN yang dipakai worker
  // (`workers/index.ts` § `resolveConnection`) lewat
  // `subscription.accurateConnectionId` — ID SPESIFIK, bukan heuristik.
  // WAJIB isi CONNECTION_ID persis (dari `accurate_connections.id`) yang
  // sama dengan yang dipakai subscription/batch asli yang mau ditiru.
  const connectionId = process.env.CONNECTION_ID;
  if (!connectionId) {
    console.error("WAJIB isi env CONNECTION_ID (uuid `accurate_connections.id` — cari lewat subscription.accurate_connection_id punya batch asli).");
    process.exit(1);
  }
  const [connection] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, connectionId)).limit(1);
  if (!connection) {
    console.error(`Koneksi Accurate dengan id ${connectionId} tidak ditemukan.`);
    process.exit(1);
  }
  console.log(`Pakai koneksi Accurate: accurateDbAlias=${connection.accurateDbAlias} userId=${connection.userId}`);

  // § Batch aslinya berhasil beberapa waktu lalu, tapi access token BISA
  // sudah expired sekarang (job refresh token periodik jalan async,
  // TIDAK dipanggil on-demand di sini) — refresh proaktif dulu (pola
  // sama `workers/index.ts` § job refresh token), supaya 401 "token
  // expired" tidak disalahartikan sebagai gagal test PPh.
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

  // § EKSPERIMEN (2026-09-10, BELUM ADA DI SPEC RESMI) — Accurate support
  // sebut field `detailTax[n].taxId` (id numerik dari `/api/tax/list.do`,
  // § `findTaxByIdentifier` Fase 86 yang SUDAH ada, dipakai ulang di sini)
  // tanpa konteks endpoint jelas dari user. Dicoba speculative: isi
  // TAX_IDENTIFIER (kode/nama/id pajak, mis. "Jasa Kebersihan") untuk
  // resolve taxId lalu sisipkan `detailTax: [{ taxId }]` ke
  // `detailInvoice[0]` — TIDAK terdokumentasi resmi, cuma test isolasi.
  const taxIdentifier = process.env.TAX_IDENTIFIER;
  let resolvedTaxId: number | undefined;
  if (taxIdentifier) {
    const tax = await findTaxByIdentifier(ctx, taxIdentifier);
    if (!tax) {
      console.error(`Tax "${taxIdentifier}" tidak ditemukan di /api/tax/list.do.`);
      process.exit(1);
    }
    resolvedTaxId = tax.id;
    console.log(`Resolved TAX_IDENTIFIER "${taxIdentifier}" -> taxId=${tax.id} (${tax.description}, ${tax.taxCode})`);
  }

  const detailInvoiceEntry: Record<string, unknown> = {
    invoiceNo,
    paymentAmount, // § inilah yang diuji: GROSS (netMode=0) vs NET setelah PPh (netMode=1)
    paidPph: true,
    pphNumber,
  };
  if (resolvedTaxId !== undefined) {
    detailInvoiceEntry.detailTax = [{ taxId: resolvedTaxId }];
  }

  const payload = {
    customerNo,
    bankNo,
    transDate: new Date().toLocaleDateString("en-GB").split("/").join("/"), // DD/MM/YYYY
    branchName,
    chequeAmount: paymentAmount, // root, disamakan dengan total detailInvoice (1 baris saja di test ini)
    detailInvoice: [detailInvoiceEntry],
  };

  console.log("Payload yang dikirim ke sales-receipt/save.do:");
  console.log(JSON.stringify(payload, null, 2));

  // § raw fetch (BUKAN saveSalesReceipt/parseAccurateSaveEnvelope) — supaya
  // body mentah tetap kelihatan walau HTTP status bukan 200 atau body-nya
  // non-JSON (mis. halaman block WAF/rate-limit), parseAccurateSaveEnvelope
  // cuma throw pesan generik tanpa isi body-nya.
  const res = await fetch(`${ctx.host}/accurate/api/sales-receipt/save.do`, {
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
  console.log("Response headers:", JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
  console.log("Response body mentah:");
  console.log(rawText);
}

main().then(() => process.exit(0));
