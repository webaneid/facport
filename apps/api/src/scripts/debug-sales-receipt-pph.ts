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
import { eq, desc } from "drizzle-orm";
import { openAccurateSession } from "../lib/accurate-session";
import { saveSalesReceipt } from "../lib/accurate-sales-receipt";

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

  const [connection] = await db
    .select()
    .from(accurateConnections)
    .where(eq(accurateConnections.status, "active"))
    .orderBy(desc(accurateConnections.updatedAt))
    .limit(1);
  if (!connection) {
    console.error("Tidak ada koneksi Accurate aktif ditemukan di database.");
    process.exit(1);
  }
  console.log(`Pakai koneksi Accurate: accurateDbAlias=${connection.accurateDbAlias} userId=${connection.userId}`);

  const ctx = await openAccurateSession(connection);

  const payload = {
    customerNo,
    bankNo,
    transDate: new Date().toLocaleDateString("en-GB").split("/").join("/"), // DD/MM/YYYY
    branchName,
    chequeAmount: paymentAmount, // root, disamakan dengan total detailInvoice (1 baris saja di test ini)
    detailInvoice: [
      {
        invoiceNo,
        paymentAmount, // § inilah yang diuji: GROSS (netMode=0) vs NET setelah PPh (netMode=1)
        paidPph: true,
        pphNumber,
      },
    ],
  };

  console.log("Payload yang dikirim ke sales-receipt/save.do:");
  console.log(JSON.stringify(payload, null, 2));

  try {
    const result = await saveSalesReceipt(ctx, payload);
    console.log("SUKSES — respons Accurate:");
    console.log(JSON.stringify(result, null, 2));
    console.log(
      `\nCek transaksi id ${result.id} (nomor ${result.number}) langsung di Accurate — apakah field "Dipotong PPh"/"No. Bukti Potong" sekarang terisi?`,
    );
  } catch (err) {
    console.error("GAGAL — error dari Accurate:");
    console.error(err);
  }
}

main().then(() => process.exit(0));
