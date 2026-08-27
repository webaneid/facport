import "../lib/env"; // WAJIB paling awal

import { eq, and, or, lt, lte, inArray, sql } from "drizzle-orm";
import { boss, JOBS, startQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
import { sendEmail } from "../lib/email";
import { db } from "../lib/db";
import { subscriptions, accurateConnections, importBatches, importBatchRows } from "../db/schema";
import { refreshAccessToken } from "../lib/accurate";
import { encrypt, decrypt } from "../lib/encryption";
import { openAccurateSession } from "../lib/accurate-session";
import { savePurchaseInvoice, getPurchaseInvoiceDetail, type PurchaseInvoiceSaveResult } from "../lib/accurate-purchase-invoice";
import {
  buildPurchaseInvoicePayload,
  buildDetailItemFromRow,
  billNumberColumnOf,
  extractVendorCreateFields,
  extractItemCreateFields,
  groupPurchaseInvoiceRows,
  validateGroupVendorConsistency,
  type ImportRowRecord,
  type PurchaseInvoiceGroup,
} from "../lib/import-mapping/purchase-invoice.mapping";
import { saveVendorPayableAccount, findOrCreateVendor } from "../lib/accurate-vendor";
import { buildVendorPayableAccountPayload } from "../lib/import-mapping/vendor-payable-account.mapping";
import { findOrCreateItem } from "../lib/accurate-item";
import type { AccurateSessionContext } from "../lib/accurate-session";

// § architecture-accurate-integration.md — `import_batches.module`
// menentukan cara proses 1 baris. Switch eksplisit (bukan lookup table
// generik) SENGAJA dipilih — tiap modul punya bentuk payload beda
// (Purchase Invoice: object nested `detailItem`, Vendor: flat
// `{vendorNo, payableAccountNo}`), lookup table generik butuh cast tidak
// aman (`as any`/`as never`) buat nyatuin tipe fungsi yang beda-beda.
// Tambah `case` baru di sini kalau ada modul import lain — JOBS.IMPORT_TO_ACCURATE
// tetap 1 job generik, bukan bikin job type terpisah per modul (§ queue.ts).
// CATATAN: "purchase_invoice" TIDAK ada di sini lagi sejak Fase 06 — modul
// itu diproses PER GRUP (banyak baris = 1 faktur), lihat
// `processPurchaseInvoiceGroup` di bawah, bukan per-baris lewat fungsi ini.
async function processImportRow(
  module: string,
  ctx: AccurateSessionContext,
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): Promise<{ id: number | string }> {
  switch (module) {
    case "vendor_payable_account":
      return saveVendorPayableAccount(ctx, buildVendorPayableAccountPayload(rawRow, columnMapping));
    default:
      throw new Error(`Modul import "${module}" tidak dikenali`);
  }
}

// § Fase 06, ADR-0011 — proses 1 GRUP baris Excel (1 Faktur Pembelian,
// bisa banyak detailItem) jadi 1 faktur di Accurate. Vendor dicari/dibuat
// SEKALI per grup (dari baris pertama — sudah divalidasi semua baris grup
// vendorNo-nya sama, lihat `validateGroupVendorConsistency`), item
// dicari/dibuat per ITEM UNIK dalam grup (dedupe, hindari panggil dobel
// kalau ada baris duplikat barang).
export async function processPurchaseInvoiceGroup(
  ctx: AccurateSessionContext,
  group: PurchaseInvoiceGroup,
  columnMapping: Record<string, string>,
): Promise<PurchaseInvoiceSaveResult> {
  const mismatchError = validateGroupVendorConsistency(group, columnMapping);
  if (mismatchError) throw new Error(mismatchError);

  const rawRows = group.rows.map((r) => r.rawData);
  const payload = buildPurchaseInvoicePayload(rawRows, columnMapping);

  const vendorNo = String(payload.vendorNo ?? "");
  if (vendorNo) {
    await findOrCreateVendor(ctx, vendorNo, extractVendorCreateFields(rawRows[0]!, columnMapping));
  }

  const seenItemNo = new Set<string>();
  for (const rawRow of rawRows) {
    const detailItem = extractRowDetailItemNo(rawRow, columnMapping);
    if (!detailItem || seenItemNo.has(detailItem)) continue;
    seenItemNo.add(detailItem);
    await findOrCreateItem(ctx, detailItem, extractItemCreateFields(rawRow, columnMapping));
  }

  return savePurchaseInvoice(ctx, payload);
}

// Ambil nilai kolom yang di-mapping ke "itemNo" dari 1 baris mentah —
// dipakai buat dedupe findOrCreateItem per grup di atas.
function extractRowDetailItemNo(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string | null {
  const itemNoColumn = Object.entries(columnMapping).find(([, field]) => field === "itemNo")?.[0];
  if (!itemNoColumn) return null;
  const value = rawRow[itemNoColumn];
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

// § Fase 08, ADR-0012 — cari LINTAS-BATCH (bukan cuma batch yang sedang
// diproses) apakah Bill No ini SUDAH PERNAH sukses jadi faktur di
// subscription yang sama. Dipakai supaya retry pada baris `failed` lama
// (dari SEBELUM Fase 06 ada grouping) bisa nemu faktur yang sudah
// tercipta dari baris `success` lain — termasuk kalau keduanya ada di
// batch yang SAMA (kasus nyata: batch `8b622538`). Perbandingan Bill No
// case-insensitive + trim, konsisten dengan `groupPurchaseInvoiceRows`
// (ADR-0011). Parameter di-bind via Drizzle `sql` tag (bukan concat) —
// § architecture-security.md.
async function findExistingAccurateInvoiceId(
  subscriptionId: string,
  billNumber: string,
  billNumberColumn: string,
): Promise<number | null> {
  const [row] = await db
    .select({ accurateTransactionId: importBatchRows.accurateTransactionId })
    .from(importBatchRows)
    .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
    .where(
      and(
        eq(importBatches.subscriptionId, subscriptionId),
        eq(importBatches.module, "purchase_invoice"),
        eq(importBatchRows.status, "success"),
        sql`lower(trim(${importBatchRows.rawData}->>${billNumberColumn})) = lower(trim(${billNumber}))`,
      ),
    )
    .limit(1);

  if (!row?.accurateTransactionId) return null;
  const id = Number(row.accurateTransactionId);
  return Number.isFinite(id) ? id : null;
}

// § Fase 08, ADR-0012 — grup ini punya Bill No yang SUDAH PUNYA faktur di
// Accurate (ditemukan via `findExistingAccurateInvoiceId`). Append item
// BARU ke faktur itu lewat `save.do` mode update (`id` faktur +
// `detailItem[]`), BUKAN create faktur baru (yang akan ditolak Accurate
// sebagai duplikat nomor).
export async function appendToExistingPurchaseInvoice(
  ctx: AccurateSessionContext,
  existingId: number,
  group: PurchaseInvoiceGroup,
  columnMapping: Record<string, string>,
): Promise<PurchaseInvoiceSaveResult> {
  const rawRows = group.rows.map((r) => r.rawData);
  const vendorNo = String(buildPurchaseInvoicePayload(rawRows, columnMapping).vendorNo ?? "");

  // § Fase 08 — `detailItem` di-REPLACE (bukan merge) tiap save.do
  // dipanggil dengan `id`, jadi state faktur WAJIB di-fetch ULANG di sini
  // (bukan diasumsikan dari DB lokal Facport, yang tidak menyimpan
  // struktur detailItem Accurate sama sekali).
  const detail = await getPurchaseInvoiceDetail(ctx, existingId);

  // § Safety check — JANGAN append ke faktur vendor lain walau Bill No
  // kebetulan sama (mis. 2 vendor berbeda kebetulan pakai nomor referensi
  // yang sama).
  if (vendorNo && detail.vendor.no !== vendorNo) {
    throw new Error(
      `Bill No "${group.billNumber}" sudah dipakai Faktur Pembelian #${existingId} milik Vendor "${detail.vendor.no}" di Accurate — tidak sama dengan Vendor baris ini ("${vendorNo}"), retry dibatalkan untuk mencegah salah gabung faktur.`,
    );
  }

  const isDuplicateItem = (candidate: Record<string, unknown>) =>
    detail.detailItem.some(
      (existing) =>
        existing.itemNo === String(candidate.itemNo ?? "") &&
        existing.unitPrice === Number(candidate.unitPrice ?? 0) &&
        existing.quantity === Number(candidate.quantity ?? 0),
    );

  // § Duplicate-guard — skip baris yang item-nya SUDAH ADA persis
  // (itemNo+unitPrice+quantity sama) di faktur existing. Mencegah dobel
  // kalau retry diklik berkali-kali, atau item itu sudah pernah ke-append
  // sebelumnya (kasus nyata: row 2 batch `8b622538`).
  const newRows: { rawRow: Record<string, unknown>; detailItem: Record<string, unknown> }[] = [];
  for (const rawRow of rawRows) {
    const detailItem = buildDetailItemFromRow(rawRow, columnMapping);
    if (!isDuplicateItem(detailItem)) newRows.push({ rawRow, detailItem });
  }

  if (newRows.length === 0) {
    // § idempotent — semua item baris ini sudah ada di faktur existing,
    // dianggap sukses TANPA panggil save.do lagi (hemat API call & rate
    // limit, § architecture-accurate-integration.md § 4).
    return { id: existingId, number: detail.detailItem.length > 0 ? String(existingId) : "" };
  }

  // § findOrCreateVendor SENGAJA DILEWATI di jalur ini — vendor sudah
  // tetap di faktur existing (sudah divalidasi sama di atas), tidak
  // relevan dibuat/diupdate ulang lewat jalur append.
  const seenItemNo = new Set<string>();
  for (const { rawRow } of newRows) {
    const itemNo = extractRowDetailItemNo(rawRow, columnMapping);
    if (!itemNo || seenItemNo.has(itemNo)) continue;
    seenItemNo.add(itemNo);
    await findOrCreateItem(ctx, itemNo, extractItemCreateFields(rawRow, columnMapping));
  }

  return savePurchaseInvoice(ctx, {
    id: existingId,
    detailItem: [...detail.detailItem.map((it) => ({ id: it.id })), ...newRows.map((r) => r.detailItem)],
  });
}

async function main() {
  await startQueue();

  await boss.work<{ to: string; subject: string; html: string }>(
    JOBS.SEND_EMAIL,
    async ([job]) => {
      if (!job) return;
      try {
        await sendEmail(job.data);
        logger.info({ jobId: job.id }, "Email job processed");
      } catch (err) {
        logger.error({ err, jobId: job.id }, "Email job failed");
        Sentry.captureException(err);
        throw err; // pg-boss retry otomatis (default 3x, exponential backoff)
      }
    },
  );

  // § architecture-subscription.md — downgrade otomatis, harian (bukan
  // real-time check saja) supaya status konsisten di DB kapan pun dilihat.
  await boss.schedule(JOBS.EXPIRE_SUBSCRIPTIONS, "0 1 * * *");
  await boss.work(JOBS.EXPIRE_SUBSCRIPTIONS, async () => {
    const expired = await db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(and(eq(subscriptions.status, "active"), lt(subscriptions.endAt, new Date())))
      .returning({ id: subscriptions.id });
    logger.info({ count: expired.length }, "Subscriptions expired");
  });

  // § architecture-accurate-integration.md § 1 — access token expire 15
  // hari, refresh harian cukup (bukan tiap 30 menit). Cek koneksi yang
  // mendekati expired (<2 hari lagi), refresh proaktif.
  await boss.schedule(JOBS.REFRESH_ACCURATE_TOKEN, "0 2 * * *");
  await boss.work(JOBS.REFRESH_ACCURATE_TOKEN, async () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const dueForRefresh = await db
      .select()
      .from(accurateConnections)
      .where(and(eq(accurateConnections.status, "active"), lte(accurateConnections.expiresAt, soon)));

    for (const conn of dueForRefresh) {
      try {
        const token = await refreshAccessToken(decrypt(conn.refreshTokenEncrypted));
        await db
          .update(accurateConnections)
          .set({
            accessTokenEncrypted: encrypt(token.access_token),
            refreshTokenEncrypted: encrypt(token.refresh_token),
            expiresAt: new Date(Date.now() + token.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(accurateConnections.id, conn.id));
        logger.info({ connectionId: conn.id }, "Accurate token refreshed");
      } catch (err) {
        // Refresh token juga sudah invalid/di-revoke user dari sisi Accurate
        // — tandai expired, user WAJIB hubungkan ulang manual (§ Halaman app
        // "Hubungkan Ulang", docs/phases/phase-01-fondasi-produk.md)
        await db
          .update(accurateConnections)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(accurateConnections.id, conn.id));
        logger.error({ err, connectionId: conn.id }, "Accurate token refresh gagal, tandai expired");
        Sentry.captureException(err);
      }
    }
  });

  // § architecture-accurate-integration.md § 2, § "Sesi Data Usaha" — 1
  // baris Excel = 1 Faktur Pembelian dengan 1 detailItem (§ phase-02 doc
  // "Keputusan Kecil"). Sesi Data Usaha dibuka SEKALI per job run, bukan
  // per-row (§ "Sesi Data Usaha" — session/host ephemeral, tidak di-cache
  // lintas job).
  await boss.work<{ batchId: string }>(JOBS.IMPORT_TO_ACCURATE, async ([job]) => {
    if (!job) return;
    const { batchId } = job.data;

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) {
      logger.error({ batchId }, "Import batch tidak ditemukan, skip job");
      return;
    }

    const [connection] = await db
      .select()
      .from(accurateConnections)
      .where(eq(accurateConnections.subscriptionId, batch.subscriptionId));

    if (!connection || !connection.accurateDbId) {
      await db
        .update(importBatches)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(importBatches.id, batch.id));
      logger.error({ batchId }, "Import gagal: koneksi Accurate belum ada/belum pilih Data Usaha");
      return;
    }

    let session;
    try {
      session = await openAccurateSession(connection);
    } catch (err) {
      await db
        .update(importBatches)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(importBatches.id, batch.id));
      logger.error({ err, batchId }, "Import gagal: tidak bisa buka sesi Data Usaha Accurate");
      Sentry.captureException(err);
      return;
    }

    const columnMapping = (batch.columnMapping ?? {}) as Record<string, string>;
    const rows = await db
      .select()
      .from(importBatchRows)
      .where(
        and(
          eq(importBatchRows.batchId, batch.id),
          or(eq(importBatchRows.status, "pending"), eq(importBatchRows.status, "failed")),
        ),
      );

    // § Fase 06, ADR-0011 — Purchase Invoice diproses PER GRUP (baris
    // dengan Bill No sama = 1 faktur, bisa banyak detailItem), modul lain
    // TETAP per-baris seperti sebelumnya (grouping cuma berlaku Purchase
    // Invoice). Hasil (status/accurateTransactionId/errorMessage) dari 1
    // panggilan Accurate di-apply ke SEMUA baris anggota grup itu —
    // sebuah grup tidak pernah berstatus campuran (sebagian sukses,
    // sebagian gagal), penting buat retry (§ route retry, tidak diubah)
    // supaya re-grouping ulang selalu benar.
    if (batch.module === "purchase_invoice") {
      const groups = groupPurchaseInvoiceRows(
        rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        columnMapping,
      );
      // § Fase 08, ADR-0012 — dihitung SEKALI per batch (columnMapping-nya
      // sama untuk semua grup), dipakai buat cek existing sebelum CREATE.
      const billNumberColumn = billNumberColumnOf(columnMapping);
      for (const group of groups) {
        const rowIds = group.rows.map((r) => r.id);
        try {
          // § Fase 08, ADR-0012 — Retry Cerdas: kalau Bill No grup ini
          // SUDAH PERNAH sukses jadi faktur (lintas-batch), append item
          // baru ke faktur itu (UPDATE), BUKAN coba create faktur baru
          // yang bakal ditolak Accurate sebagai duplikat nomor. Grup
          // tanpa Bill No (singleton) selalu lewat jalur CREATE seperti
          // biasa — tidak ada identitas untuk dicari.
          const existingId =
            group.billNumber && billNumberColumn
              ? await findExistingAccurateInvoiceId(batch.subscriptionId, group.billNumber, billNumberColumn)
              : null;
          const result = existingId
            ? await appendToExistingPurchaseInvoice(session, existingId, group, columnMapping)
            : await processPurchaseInvoiceGroup(session, group, columnMapping);
          await db
            .update(importBatchRows)
            .set({ status: "success", accurateTransactionId: String(result.id), errorMessage: null, processedAt: new Date() })
            .where(inArray(importBatchRows.id, rowIds));
        } catch (err) {
          await db
            .update(importBatchRows)
            .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), processedAt: new Date() })
            .where(inArray(importBatchRows.id, rowIds));
        }
      }
    } else {
      for (const row of rows) {
        try {
          const result = await processImportRow(
            batch.module,
            session,
            row.rawData as Record<string, unknown>,
            columnMapping,
          );
          await db
            .update(importBatchRows)
            .set({ status: "success", accurateTransactionId: String(result.id), errorMessage: null, processedAt: new Date() })
            .where(eq(importBatchRows.id, row.id));
        } catch (err) {
          await db
            .update(importBatchRows)
            .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), processedAt: new Date() })
            .where(eq(importBatchRows.id, row.id));
        }
      }
    }

    const finalRows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
    const hasFailed = finalRows.some((r) => r.status === "failed");
    await db
      .update(importBatches)
      .set({ status: hasFailed ? "completed_with_errors" : "completed", completedAt: new Date() })
      .where(eq(importBatches.id, batch.id));

    logger.info({ batchId, total: finalRows.length, failed: finalRows.filter((r) => r.status === "failed").length }, "Import batch selesai");
  });

  logger.info("apps/api worker started");
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
