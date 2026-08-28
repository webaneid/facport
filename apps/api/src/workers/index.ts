import "../lib/env"; // WAJIB paling awal

import { eq, and, or, lt, lte, inArray, notInArray, sql } from "drizzle-orm";
import { boss, JOBS, startQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
import { sendEmail } from "../lib/email";
import { db } from "../lib/db";
import { subscriptions, accurateConnections, importBatches, importBatchRows, auditLogs, settings } from "../db/schema";
import { IMPORT_RETENTION_SETTING_KEY, MAX_IMPORT_RETENTION_DAYS, DEFAULT_IMPORT_RETENTION_DAYS } from "../lib/import-retention";
import { refreshAccessToken } from "../lib/accurate";
import { encrypt, decrypt } from "../lib/encryption";
import { openAccurateSession } from "../lib/accurate-session";
import { savePurchaseInvoice, getPurchaseInvoiceDetail, deletePurchaseInvoice } from "../lib/accurate-purchase-invoice";
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

// § Fase 09, ADR-0013 — hasil proses 1 grup, per BARIS (bukan cuma id
// faktur tunggal) — dipakai buat tracking `accurateDetailItemId` per
// baris di DB (WAJIB, supaya "Batal Import" tahu persis item mana milik
// baris mana di faktur yang mungkin gabungan lintas-batch).
export type PurchaseInvoiceGroupResult = {
  invoiceId: number;
  rows: { rowId: string; detailItemId: number }[];
};

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
): Promise<PurchaseInvoiceGroupResult> {
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

  // § Fase 09 — `result.detailItem[]` urutannya SAMA dengan `payload.detailItem`
  // yang dikirim (= `rawRows` = `group.rows`, DIKONFIRMASI test call nyata
  // 2026-08-28, § ADR-0013) — index-match langsung, tidak perlu matching by value.
  const result = await savePurchaseInvoice(ctx, payload);
  return {
    invoiceId: result.id,
    rows: group.rows.map((row, i) => ({ rowId: row.id, detailItemId: result.detailItem[i]!.id })),
  };
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
): Promise<PurchaseInvoiceGroupResult> {
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

  const findDuplicateItem = (candidate: Record<string, unknown>) =>
    detail.detailItem.find(
      (existing) =>
        existing.itemNo === String(candidate.itemNo ?? "") &&
        existing.unitPrice === Number(candidate.unitPrice ?? 0) &&
        existing.quantity === Number(candidate.quantity ?? 0),
    );

  // § Duplicate-guard — baris yang item-nya SUDAH ADA persis
  // (itemNo+unitPrice+quantity sama) di faktur existing di-skip dari
  // save.do (mencegah dobel kalau retry diklik berkali-kali, atau item
  // itu sudah pernah ke-append sebelumnya — kasus nyata: row 2 batch
  // `8b622538`), TAPI tetap dilacak `detailItemId`-nya (§ Fase 09,
  // ADR-0013 — dari item existing yang match, bukan NULL) supaya "Batal
  // Import" tetap bisa mengenali baris ini nanti.
  const perRow = group.rows.map((row, i) => {
    const detailItem = buildDetailItemFromRow(rawRows[i]!, columnMapping);
    return { row, rawRow: rawRows[i]!, detailItem, existingMatch: findDuplicateItem(detailItem) };
  });
  const newRows = perRow.filter((r) => !r.existingMatch);

  if (newRows.length === 0) {
    // § idempotent — semua item baris ini sudah ada di faktur existing,
    // dianggap sukses TANPA panggil save.do lagi (hemat API call & rate
    // limit, § architecture-accurate-integration.md § 4).
    return {
      invoiceId: existingId,
      rows: perRow.map((r) => ({ rowId: r.row.id, detailItemId: r.existingMatch!.id })),
    };
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

  const result = await savePurchaseInvoice(ctx, {
    id: existingId,
    detailItem: [...detail.detailItem.map((it) => ({ id: it.id })), ...newRows.map((r) => r.detailItem)],
  });

  // § Fase 09 — tail `result.detailItem` (N elemen terakhir, N =
  // newRows.length) urutannya SAMA dengan `newRows` yang dikirim
  // (existing items dikirim duluan, baru yang baru — DIKONFIRMASI test
  // call nyata Fase 09, § ADR-0013).
  const newIds = result.detailItem.slice(-newRows.length);
  const detailItemIdByRowId = new Map<string, number>();
  newRows.forEach((r, i) => detailItemIdByRowId.set(r.row.id, newIds[i]!.id));
  for (const r of perRow) {
    if (r.existingMatch) detailItemIdByRowId.set(r.row.id, r.existingMatch.id);
  }

  return {
    invoiceId: result.id,
    rows: perRow.map((r) => ({ rowId: r.row.id, detailItemId: detailItemIdByRowId.get(r.row.id)! })),
  };
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

  // § Fase 10, architecture-subscription.md § "Retensi Data Import" —
  // data Excel yang diimpor berisi data bisnis sensitif client, TIDAK
  // disimpan lama-lama. Batas 7 hari HARDCODE (bukan admin-configurable),
  // default admin 2 hari (§ settings.route.ts — divalidasi 1-7 di situ,
  // tapi job ini TETAP clamp ulang defensif kalau ada nilai settings yang
  // di luar batas via jalur lain, mis. edit manual DB).
  await boss.schedule(JOBS.PURGE_OLD_IMPORTS, "0 3 * * *");
  await boss.work(JOBS.PURGE_OLD_IMPORTS, async () => {
    const [retentionSetting] = await db.select().from(settings).where(eq(settings.key, IMPORT_RETENTION_SETTING_KEY));
    const rawDefault = Number(retentionSetting?.value ?? DEFAULT_IMPORT_RETENTION_DAYS);
    const adminDefaultDays = Number.isInteger(rawDefault) ? Math.min(Math.max(rawDefault, 1), MAX_IMPORT_RETENTION_DAYS) : DEFAULT_IMPORT_RETENTION_DAYS;

    // § retensi EFEKTIF per batch = override subscription kalau ada, else
    // default admin — dihitung di JS (bukan SQL) supaya logic clamp 1-7
    // konsisten SATU tempat, tidak diduplikasi jadi ekspresi SQL terpisah.
    const candidates = await db
      .select({
        id: importBatches.id,
        createdAt: importBatches.createdAt,
        overrideDays: subscriptions.importRetentionDaysOverride,
      })
      .from(importBatches)
      .innerJoin(subscriptions, eq(importBatches.subscriptionId, subscriptions.id))
      .where(notInArray(importBatches.status, ["processing", "cancelling"]));

    const now = Date.now();
    const idsToDelete = candidates
      .filter((c) => {
        const effectiveDays = c.overrideDays != null ? Math.min(Math.max(c.overrideDays, 1), MAX_IMPORT_RETENTION_DAYS) : adminDefaultDays;
        return now - c.createdAt.getTime() > effectiveDays * 24 * 60 * 60 * 1000;
      })
      .map((c) => c.id);

    if (idsToDelete.length > 0) {
      await db.delete(importBatches).where(inArray(importBatches.id, idsToDelete));
    }

    await db.insert(auditLogs).values({
      entityType: "system",
      entityId: "purge-old-imports",
      action: "delete",
      changes: { reason: "retention_policy", batchesDeleted: idsToDelete.length, defaultRetentionDays: adminDefaultDays },
      actorId: null,
    });

    logger.info({ batchesDeleted: idsToDelete.length, adminDefaultDays }, "Purge old imports selesai");
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
          // § Fase 09, ADR-0013 — update PER BARIS (bukan bulk inArray
          // seperti sebelumnya) supaya tiap baris dapat
          // `accurateDetailItemId` MASING-MASING (beda per baris dalam 1
          // grup) — WAJIB buat "Batal Import" nanti bisa susutkan faktur
          // per-item, bukan cuma tebak.
          for (const r of result.rows) {
            await db
              .update(importBatchRows)
              .set({
                status: "success",
                accurateTransactionId: String(result.invoiceId),
                accurateDetailItemId: String(r.detailItemId),
                errorMessage: null,
                processedAt: new Date(),
              })
              .where(eq(importBatchRows.id, r.rowId));
          }
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

  // § Fase 09, ADR-0013 — "Batal Import". Per faktur yang pernah disentuh
  // batch ini: kalau faktur itu 100% milik batch ini → hapus UTUH
  // (`deletePurchaseInvoice`); kalau gabungan lintas-batch (Fase 08
  // append) → SUSUTKAN (save.do update, sisakan item milik batch lain);
  // kalau ADA baris (batch manapun) tanpa `accurateDetailItemId`
  // tercatat → BLOKIR faktur itu (aman, bukan tebak). Kegagalan 1 faktur
  // TIDAK menggagalkan seluruh job — lanjut ke faktur berikutnya, batch
  // berakhir `cancelled_partial`.
  await boss.work<{ batchId: string; actorId: string }>(JOBS.CANCEL_IMPORT, async ([job]) => {
    if (!job) return;
    const { batchId, actorId } = job.data;

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) {
      logger.error({ batchId }, "Cancel import: batch tidak ditemukan, skip job");
      return;
    }
    if (batch.status !== "cancelling") {
      logger.error({ batchId, status: batch.status }, "Cancel import: batch tidak dalam status cancelling, skip job");
      return;
    }

    const [connection] = await db
      .select()
      .from(accurateConnections)
      .where(eq(accurateConnections.subscriptionId, batch.subscriptionId));

    if (!connection || !connection.accurateDbId) {
      logger.error({ batchId }, "Cancel import gagal: koneksi Accurate belum ada/belum pilih Data Usaha");
      return; // status batch TETAP "cancelling" — bukan ditandai gagal permanen, user bisa coba lagi
    }

    let session;
    try {
      session = await openAccurateSession(connection);
    } catch (err) {
      logger.error({ err, batchId }, "Cancel import gagal: tidak bisa buka sesi Data Usaha Accurate");
      Sentry.captureException(err);
      return;
    }

    const successRows = await db
      .select()
      .from(importBatchRows)
      .where(and(eq(importBatchRows.batchId, batch.id), eq(importBatchRows.status, "success")));

    const byInvoice = new Map<string, typeof successRows>();
    for (const row of successRows) {
      if (!row.accurateTransactionId) continue;
      const list = byInvoice.get(row.accurateTransactionId) ?? [];
      list.push(row);
      byInvoice.set(row.accurateTransactionId, list);
    }

    const summary = { deleted: [] as string[], blocked: [] as string[], failed: [] as string[] };

    for (const [invoiceIdStr, thisBatchRows] of byInvoice) {
      const invoiceId = Number(invoiceIdStr);
      if (!Number.isFinite(invoiceId)) continue;

      // § ADR-0013 Decision #1 — eligibility check LINTAS-BATCH: semua
      // baris (batch manapun, subscription sama) yang pernah tercatat
      // terhubung ke faktur ini WAJIB punya `accurateDetailItemId`. Kalau
      // ada satu saja yang NULL (baris lama, sebelum Fase 09) → blokir,
      // jangan tebak.
      const allRowsForInvoice = await db
        .select({
          id: importBatchRows.id,
          batchId: importBatchRows.batchId,
          accurateDetailItemId: importBatchRows.accurateDetailItemId,
        })
        .from(importBatchRows)
        .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
        .where(
          and(
            eq(importBatches.subscriptionId, batch.subscriptionId),
            eq(importBatchRows.accurateTransactionId, invoiceIdStr),
            eq(importBatchRows.status, "success"),
          ),
        );

      if (allRowsForInvoice.some((r) => !r.accurateDetailItemId)) {
        summary.blocked.push(invoiceIdStr);
        continue;
      }

      // § ADR-0014 (koreksi ADR-0013) — DIKONFIRMASI EMPIRIS 2026-08-28:
      // `save.do` TIDAK mendukung hapus 1 detailItem via omit dari array
      // (upsert-only — item yang tidak disertakan TETAP ADA, dikonfirmasi
      // walau ditunggu 45 detik untuk pastikan bukan isu timing kalkulasi
      // biaya barang). TIDAK ADA cara aman "menyusutkan" faktur gabungan
      // lewat API publik — satu-satunya opsi adalah hapus faktur UTUH
      // (`delete.do`), yang akan ikut menghapus data batch LAIN. Jadi
      // faktur gabungan lintas-batch WAJIB diblokir juga (sama seperti
      // baris tanpa tracking id), BUKAN disusutkan.
      const otherBatchRows = allRowsForInvoice.filter((r) => r.batchId !== batch.id);
      if (otherBatchRows.length > 0) {
        summary.blocked.push(invoiceIdStr);
        continue;
      }

      try {
        // § faktur 100% milik batch ini (tidak ada batch lain nempel) —
        // satu-satunya kasus yang aman di-auto-cancel — hapus utuh.
        await deletePurchaseInvoice(session, invoiceId);
        await db
          .update(importBatchRows)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(
            inArray(
              importBatchRows.id,
              thisBatchRows.map((r) => r.id),
            ),
          );
        summary.deleted.push(invoiceIdStr);
      } catch (err) {
        // § faktur mungkin sudah "dipakai" downstream (dibayar/
        // direferensikan transaksi lain) — Accurate bisa menolak. TIDAK
        // abort seluruh job, baris batch ini TETAP "success" (tidak
        // diubah), lanjut ke faktur berikutnya.
        logger.error({ err, batchId, invoiceId }, "Cancel import: gagal membatalkan 1 faktur, lanjut ke faktur berikutnya");
        summary.failed.push(invoiceIdStr);
      }
    }

    await db.insert(auditLogs).values({
      entityType: "import_batch",
      entityId: batch.id,
      action: "delete",
      changes: summary,
      actorId,
    });

    const finalStatus = summary.deleted.length === byInvoice.size ? "cancelled" : "cancelled_partial";
    await db.update(importBatches).set({ status: finalStatus, completedAt: new Date() }).where(eq(importBatches.id, batch.id));

    logger.info({ batchId, summary, finalStatus }, "Cancel import selesai");
  });

  logger.info("apps/api worker started");
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
