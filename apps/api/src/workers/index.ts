import "../lib/env"; // WAJIB paling awal

import { eq, and, or, lt, lte, inArray, notInArray, sql, desc } from "drizzle-orm";
import { boss, JOBS, startQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
import { sendEmail } from "../lib/email";
import { db } from "../lib/db";
import { subscriptions, accurateConnections, importBatches, importBatchRows, auditLogs, settings, announcements } from "../db/schema";
import { IMPORT_RETENTION_SETTING_KEY, MAX_IMPORT_RETENTION_DAYS, DEFAULT_IMPORT_RETENTION_DAYS } from "../lib/import-retention";
import { refreshAccessToken, isAccurateRecordNotFound } from "../lib/accurate";
import { encrypt, decrypt } from "../lib/encryption";
import { openAccurateSession } from "../lib/accurate-session";
import { createNotification, createNotificationsBulk, NOTIFICATION_TYPES } from "../lib/notifications";
import { findApplicableReminderThreshold, SUBSCRIPTION_REMINDER_THRESHOLDS, TRIAL_REMINDER_THRESHOLDS } from "../lib/subscription-reminders";
import { resolveAnnouncementRecipients } from "../lib/announcements";
import { savePurchaseInvoice, getPurchaseInvoiceDetail, deletePurchaseInvoice, type PurchaseInvoiceDetail } from "../lib/accurate-purchase-invoice";
import {
  buildPurchaseInvoicePayload,
  buildDetailItemFromRow,
  extractVendorCreateFields,
  extractItemCreateFields,
  extractDataClassificationValues as extractDataClassificationValuesPI,
  extractExpenseDataClassificationValues as extractExpenseDataClassificationValuesPI,
  groupPurchaseInvoiceRows,
  validateGroupVendorConsistency,
  type ImportRowRecord,
  type PurchaseInvoiceGroup,
} from "../lib/import-mapping/purchase-invoice.mapping";
import { saveVendorPayableAccount, findOrCreateVendor } from "../lib/accurate-vendor";
import { buildVendorPayableAccountPayload } from "../lib/import-mapping/vendor-payable-account.mapping";
import { savePurchasePayment } from "../lib/accurate-purchase-payment";
import {
  buildPurchasePaymentPayload,
  groupPurchasePaymentRows,
  validateGroupVendorConsistencyForPayment,
  // § Fase 89 — nama collide dengan `extractTaxIdsFromRows` Sales
  // Receipt (Fase 86), alias "PP" konsisten pola `buildDetailItemFromRow as
  // buildDetailItemFromRowSI` di bawah.
  extractTaxIdsFromRows as extractTaxIdsFromRowsPP,
  type PurchasePaymentGroup,
} from "../lib/import-mapping/purchase-payment.mapping";
import { saveSalesReceipt } from "../lib/accurate-sales-receipt";
import {
  buildSalesReceiptPayload,
  groupSalesReceiptRows,
  validateGroupCustomerConsistencyForReceipt,
  extractTaxIdsFromRows,
  type SalesReceiptGroup,
} from "../lib/import-mapping/sales-receipt.mapping";
import { findTaxByIdentifier } from "../lib/accurate-tax";
import { saveJournalVoucher } from "../lib/accurate-journal-voucher";
import {
  buildJournalVoucherPayload,
  groupJournalVoucherRows,
  extractDataClassificationValues as extractJournalVoucherDataClassificationValues,
  type JournalVoucherGroup,
} from "../lib/import-mapping/journal-voucher.mapping";
import { findOrCreateItem } from "../lib/accurate-item";
import type { AccurateSessionContext } from "../lib/accurate-session";
import { isCoincidentalDuplicateAcrossBatches } from "../lib/append-invoice-guard";
// § Fase 13 — Sales Invoice, mirror 1:1 import Purchase Invoice di atas.
// Alias pada nama yang collide (`buildDetailItemFromRow`/`extractItemCreateFields`
// ADA di kedua mapping file, isinya identik tapi tetap 2 fungsi berbeda
// per modul — bukan di-share, konsisten filosofi "3 baris mirip lebih
// baik dari abstraksi prematur"). `ImportRowRecord` TIDAK diimpor ulang
// dari sales-invoice.mapping — shape-nya identik dengan yang PI sudah
// impor di atas, reuse type yang sama.
import { saveSalesInvoice, getSalesInvoiceDetail, deleteSalesInvoice, type SalesInvoiceDetail } from "../lib/accurate-sales-invoice";
import {
  buildSalesInvoicePayload,
  buildDetailItemFromRow as buildDetailItemFromRowSI,
  extractCustomerCreateFields,
  extractItemCreateFields as extractItemCreateFieldsSI,
  extractDataClassificationValues,
  extractExpenseDataClassificationValues,
  groupSalesInvoiceRows,
  validateGroupCustomerConsistency,
  type SalesInvoiceGroup,
} from "../lib/import-mapping/sales-invoice.mapping";
import { findOrCreateCustomer } from "../lib/accurate-customer";
import { findOrCreateDataClassification } from "../lib/accurate-data-classification";

// § Fase 68 — auto-create Kategori Keuangan (`/api/data-classification`,
// § accurate-data-classification.ts) untuk tiap nilai Atribut Tambahan
// item-level yang TERISI di baris-baris ini, SEBELUM `saveSalesInvoice`
// dipanggil (Accurate menolak `dataClassificationNName` yang belum ada
// sebagai master data — "Kategori Keuangan X tidak ditemukan atau sudah
// dihapus"). Dedupe per (index,name) supaya tidak panggil API berkali-
// kali untuk nilai yang sama diulang di banyak baris.
// § Fase 74 — nilai level EXPENSE (`expenseKategoriKeuanganN`) IKUT
// diproses di sini juga, DEDUPE BARENG dengan yang level item — field
// API-nya SAMA (`dataClassificationNName`), master data-nya SATU set
// per index terlepas nempel di baris Barang atau Beban, jadi kalau nama
// yang sama kebetulan dipakai di keduanya, cukup 1x panggilan create.
async function ensureDataClassifications(
  ctx: AccurateSessionContext,
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const rawRow of rawRows) {
    const values = [...extractDataClassificationValues(rawRow, columnMapping), ...extractExpenseDataClassificationValues(rawRow, columnMapping)];
    for (const { index, name } of values) {
      const key = `${index}::${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await findOrCreateDataClassification(ctx, index, name);
    }
  }
}

// § Fase 75 — mirror `ensureDataClassifications` di atas, TAPI untuk
// Purchase Invoice (extractor beda file/module, § alias
// `extractDataClassificationValuesPI`/`extractExpenseDataClassificationValuesPI`).
// SENGAJA fungsi terpisah (bukan 1 fungsi generik) — konsisten pola
// "3 baris mirip lebih baik dari abstraksi prematur" yang sudah dipakai
// di seluruh file ini (mis. `buildDetailItemFromRow` ADA di kedua
// mapping file, isinya identik tapi tetap 2 fungsi berbeda per modul).
async function ensurePurchaseInvoiceDataClassifications(
  ctx: AccurateSessionContext,
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const rawRow of rawRows) {
    const values = [...extractDataClassificationValuesPI(rawRow, columnMapping), ...extractExpenseDataClassificationValuesPI(rawRow, columnMapping)];
    for (const { index, name } of values) {
      const key = `${index}::${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await findOrCreateDataClassification(ctx, index, name);
    }
  }
}

// § Fase 98 (2026-09-10) — mirror `ensureDataClassifications`/
// `ensurePurchaseInvoiceDataClassifications` di atas, TAPI untuk
// Journal Voucher. BEDA PENTING dari keduanya: JV TIDAK PUNYA konsep
// "baris pertama grup = header" untuk Kategori Keuangan (field ini
// per-baris, § komentar `extractDataClassificationValues` di
// `journal-voucher.mapping.ts`) — tiap baris dalam grup dicek, bukan
// cuma baris pertama.
async function ensureJournalVoucherDataClassifications(
  ctx: AccurateSessionContext,
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const rawRow of rawRows) {
    for (const { index, name } of extractJournalVoucherDataClassificationValues(rawRow, columnMapping)) {
      const key = `${index}::${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await findOrCreateDataClassification(ctx, index, name);
    }
  }
}

// § Fase 14, ADR-0020 — koneksi Accurate SEKARANG milik user, reusable
// lintas subscription (bukan 1:1 ke subscription lagi). Resolve 2 langkah:
// subscription → accurateConnectionId → connection. `null` kalau
// subscription belum pilih/hubungkan Data Usaha SAMA SEKALI.
async function getConnectionForBatch(subscriptionId: string) {
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!subscription?.accurateConnectionId) return null;
  const [connection] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, subscription.accurateConnectionId));
  return connection ?? null;
}

// § Fase 91 (2026-09-10) — diekstrak dari job `REFRESH_ACCURATE_TOKEN`
// di bawah, DIPAKAI JUGA saat import job gagal buka sesi
// (`openAccurateSession`, § 2 lokasi di bawah). Gap ditemukan lewat
// audit: sebelum ini, kegagalan buka sesi SAAT IMPORT (beda dari
// kegagalan refresh token TERJADWAL) tidak pernah menandai koneksi
// `expired` — akibatnya `/accurate/subscriptions` tetap lapor
// "Terhubung" walau token sudah mati (revoked di sisi Accurate,
// BUKAN cuma expired alami), dan customer tidak tahu harus
// "Hubungkan Ulang" (tombol itu sendiri BARU ditambahkan Fase 91,
// sebelumnya cuma dicatat "belum dibangun" sejak Fase 01/04). Guard
// `status === "expired"` cegah notifikasi dobel kalau import gagal
// berulang kali sebelum user sempat reconnect.
async function markConnectionExpired(connection: typeof accurateConnections.$inferSelect): Promise<void> {
  if (connection.status === "expired") return;
  await db.update(accurateConnections).set({ status: "expired", updatedAt: new Date() }).where(eq(accurateConnections.id, connection.id));
  await createNotification({
    userId: connection.userId,
    type: NOTIFICATION_TYPES.ACCURATE_CONNECTION_EXPIRED,
    title: "Koneksi Accurate terputus",
    body: `Koneksi ke ${connection.accurateDbAlias ?? "Data Usaha Accurate"} kamu terputus — hubungkan ulang supaya import bisa lanjut.`,
    entityType: "accurate_connection",
    entityId: connection.id,
  });
}

// § architecture-accurate-integration.md — `import_batches.module`
// menentukan cara proses 1 baris. Switch eksplisit (bukan lookup table
// generik) SENGAJA dipilih — tiap modul punya bentuk payload beda
// (Purchase Invoice: object nested `detailItem`, Vendor: flat
// `{vendorNo, payableAccountNo}`), lookup table generik butuh cast tidak
// aman (`as any`/`as never`) buat nyatuin tipe fungsi yang beda-beda.
// Tambah `case` baru di sini kalau ada modul import lain — JOBS.IMPORT_TO_ACCURATE
// tetap 1 job generik, bukan bikin job type terpisah per modul (§ queue.ts).
// CATATAN: "purchase_invoice"/"sales_invoice" TIDAK ada di sini lagi sejak
// Fase 06/13, "sales_receipt" TIDAK ada lagi sejak Fase 49,
// "purchase_payment" TIDAK ada lagi sejak Fase 50, dan "journal_voucher"
// TIDAK ada lagi sejak Fase 96 (Opsi A/format lebar dipensiunkan total,
// modul ini SEKARANG SELALU diproses per grup — lihat
// `processJournalVoucherGroup` di bawah) — modul-modul itu diproses PER
// GRUP (banyak baris bisa jadi 1 transaksi), bukan per-baris lewat
// fungsi ini.
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

  await ensurePurchaseInvoiceDataClassifications(ctx, rawRows, columnMapping);

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
// diproses) apakah grup ini SUDAH PERNAH sukses jadi faktur di
// subscription yang sama. Dipakai supaya retry pada baris `failed` lama
// (dari SEBELUM Fase 06 ada grouping) bisa nemu faktur yang sudah
// tercipta dari baris `success` lain — termasuk kalau keduanya ada di
// batch yang SAMA (kasus nyata: batch `8b622538`). Perbandingan
// case-insensitive + trim, konsisten dengan `groupPurchaseInvoiceRows`
// (ADR-0011). Parameter di-bind via Drizzle `sql` tag (bukan concat) —
// § architecture-security.md. § Fase 81 — `groupKey`/`groupColumn`
// DIGENERALISASI (bisa dari kolom "Trans No" ATAU "Bill No"), mirror
// `findExistingAccurateSalesInvoiceId`.
async function findExistingAccurateInvoiceId(
  subscriptionId: string,
  groupKey: string,
  groupColumn: string,
): Promise<{ id: number; batchId: string } | null> {
  // § Fase 82 — `orderBy(desc(processedAt))` DITAMBAHKAN: kalau ADA lebih
  // dari 1 baris "success" match (mis. faktur lama di-delete manual di
  // Accurate lalu Trans No yang sama dipakai lagi dan berhasil dibuat
  // ULANG — § fallback CREATE di `appendToExistingPurchaseInvoice`),
  // yang paling BARU diproses yang dipakai, bukan sembarang baris tanpa
  // urutan pasti (perilaku `LIMIT 1` tanpa `ORDER BY` sebelumnya).
  const [row] = await db
    .select({ accurateTransactionId: importBatchRows.accurateTransactionId, batchId: importBatchRows.batchId })
    .from(importBatchRows)
    .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
    .where(
      and(
        eq(importBatches.subscriptionId, subscriptionId),
        eq(importBatches.module, "purchase_invoice"),
        eq(importBatchRows.status, "success"),
        sql`lower(trim(${importBatchRows.rawData}->>${groupColumn})) = lower(trim(${groupKey}))`,
      ),
    )
    .orderBy(desc(importBatchRows.processedAt))
    .limit(1);

  if (!row?.accurateTransactionId) return null;
  const id = Number(row.accurateTransactionId);
  return Number.isFinite(id) ? { id, batchId: row.batchId } : null;
}

// § Fase 08, ADR-0012 — grup ini punya nomor grup yang SUDAH PUNYA
// faktur di Accurate (ditemukan via `findExistingAccurateInvoiceId`).
// Append item BARU ke faktur itu lewat `save.do` mode update (`id`
// faktur + `detailItem[]`), BUKAN create faktur baru (yang akan ditolak
// Accurate sebagai duplikat nomor).
export async function appendToExistingPurchaseInvoice(
  ctx: AccurateSessionContext,
  existingId: number,
  existingBatchId: string,
  currentBatchId: string,
  group: PurchaseInvoiceGroup,
  columnMapping: Record<string, string>,
): Promise<PurchaseInvoiceGroupResult> {
  const rawRows = group.rows.map((r) => r.rawData);
  const vendorNo = String(buildPurchaseInvoicePayload(rawRows, columnMapping).vendorNo ?? "");

  // § Fase 82 (2026-09-10) — evaluasi client: faktur dihapus LANGSUNG di
  // Accurate (bukan lewat Facport), lalu upload ulang Trans No yang sama
  // GAGAL, padahal seharusnya dibuatkan baru. Root cause: DB lokal kita
  // masih catat baris ini "sukses" merujuk `existingId`, TAPI kita tidak
  // pernah verifikasi ke ACCURATE SUNGGUHAN apakah faktur itu MASIH ADA
  // — `detail.do` pada id yang sudah dihapus TERKONFIRMASI test call
  // nyata balas `{s:false, d:["Faktur Pembelian tidak tepat"]}` (HTTP
  // 200, BUKAN 404 — § `isAccurateRecordNotFound`). Kalau itu yang
  // terjadi, JANGAN gagalkan baris — anggap faktur itu TIDAK PERNAH ADA
  // (record lokal kita basi), fallback ke jalur CREATE biasa. TIDAK
  // PERNAH percaya DB lokal sebagai satu-satunya sumber kebenaran —
  // selalu verifikasi ke Accurate dulu.
  let detail: PurchaseInvoiceDetail;
  try {
    // § `detailItem` di-REPLACE (bukan merge) tiap save.do dipanggil
    // dengan `id`, jadi state faktur WAJIB di-fetch ULANG di sini (bukan
    // diasumsikan dari DB lokal Facport, yang tidak menyimpan struktur
    // detailItem Accurate sama sekali).
    detail = await getPurchaseInvoiceDetail(ctx, existingId);
  } catch (err) {
    if (isAccurateRecordNotFound(err)) return processPurchaseInvoiceGroup(ctx, group, columnMapping);
    throw err;
  }

  // § Safety check — JANGAN append ke faktur vendor lain walau nomor
  // grup kebetulan sama (mis. 2 vendor berbeda kebetulan pakai nomor
  // referensi yang sama).
  if (vendorNo && detail.vendor.no !== vendorNo) {
    throw new Error(
      `Nomor grup "${group.groupKey}" sudah dipakai Faktur Pembelian #${existingId} milik Vendor "${detail.vendor.no}" di Accurate — tidak sama dengan Vendor baris ini ("${vendorNo}"), retry dibatalkan untuk mencegah salah gabung faktur.`,
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
    // § Fase 67 — bedakan retry-safety ASLI (match dari batch YANG SAMA,
    // § lib/append-invoice-guard.ts) dari batch BARU yang KEBETULAN
    // identik (match dari batch LAIN) — kasus kedua BUKAN retry, harus
    // gagal dengan pesan jelas, BUKAN silent success (bug nyata
    // ditemukan client: field baru PPN/Atribut Tambahan tidak pernah
    // benar-benar terkirim karena save.do di-skip sepenuhnya di sini).
    if (isCoincidentalDuplicateAcrossBatches({ newRowsCount: newRows.length, existingBatchId, currentBatchId })) {
      throw new Error(
        `Nomor grup "${group.groupKey}" dengan barang, harga, dan qty yang PERSIS SAMA sudah ada di Faktur Pembelian #${existingId} (dari batch import SEBELUMNYA) — tidak ada baris baru untuk dikirim, jadi field lain (Pajak/Diskon/Atribut Tambahan/dst) di baris ini TIDAK ikut diperbarui di Accurate. Kalau ini transaksi baru, gunakan Trans No/Bill No yang berbeda. Kalau bermaksud mengubah data pada faktur ini, update manual di Accurate (fitur update-in-place belum didukung).`,
      );
    }
    // § idempotent — retry-safety asli (partial completion dalam batch
    // yang sama), dianggap sukses TANPA panggil save.do lagi (hemat API
    // call & rate limit, § architecture-accurate-integration.md § 4).
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

  await ensurePurchaseInvoiceDataClassifications(ctx, newRows.map((r) => r.rawRow), columnMapping);

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

// ============================================================
// § Fase 13 — Sales Invoice. Bayangan cermin blok Purchase Invoice di
// atas (customer↔vendor, PO Number↔Bill No) — lihat komentar masing-
// masing fungsi PI untuk penjelasan lengkap alasan tiap keputusan
// (ADR-0011/0012/0013), TIDAK diulang di sini supaya tidak duplikasi teks.
// ============================================================
export type SalesInvoiceGroupResult = {
  invoiceId: number;
  rows: { rowId: string; detailItemId: number }[];
};

export async function processSalesInvoiceGroup(
  ctx: AccurateSessionContext,
  group: SalesInvoiceGroup,
  columnMapping: Record<string, string>,
): Promise<SalesInvoiceGroupResult> {
  const mismatchError = validateGroupCustomerConsistency(group, columnMapping);
  if (mismatchError) throw new Error(mismatchError);

  const rawRows = group.rows.map((r) => r.rawData);
  const payload = buildSalesInvoicePayload(rawRows, columnMapping);

  const customerNo = String(payload.customerNo ?? "");
  if (customerNo) {
    await findOrCreateCustomer(ctx, customerNo, extractCustomerCreateFields(rawRows[0]!, columnMapping));
  }

  const seenItemNo = new Set<string>();
  for (const rawRow of rawRows) {
    const detailItem = extractRowDetailItemNo(rawRow, columnMapping);
    if (!detailItem || seenItemNo.has(detailItem)) continue;
    seenItemNo.add(detailItem);
    await findOrCreateItem(ctx, detailItem, extractItemCreateFieldsSI(rawRow, columnMapping));
  }

  await ensureDataClassifications(ctx, rawRows, columnMapping);

  const result = await saveSalesInvoice(ctx, payload);
  return {
    invoiceId: result.id,
    rows: group.rows.map((row, i) => ({ rowId: row.id, detailItemId: result.detailItem[i]!.id })),
  };
}

// § mirror `findExistingAccurateInvoiceId` — cari lintas-batch by PO
// Number, scoped `module = "sales_invoice"` (BEDA dari PI yang scoped
// "purchase_invoice" — dua modul tidak pernah saling cari faktur satu
// sama lain, walau kebetulan nomor referensinya sama).
async function findExistingAccurateSalesInvoiceId(
  subscriptionId: string,
  groupKey: string,
  groupColumn: string,
): Promise<{ id: number; batchId: string } | null> {
  // § Fase 82 — `orderBy(desc(processedAt))`, lihat komentar
  // `findExistingAccurateInvoiceId` (PI).
  const [row] = await db
    .select({ accurateTransactionId: importBatchRows.accurateTransactionId, batchId: importBatchRows.batchId })
    .from(importBatchRows)
    .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
    .where(
      and(
        eq(importBatches.subscriptionId, subscriptionId),
        eq(importBatches.module, "sales_invoice"),
        eq(importBatchRows.status, "success"),
        sql`lower(trim(${importBatchRows.rawData}->>${groupColumn})) = lower(trim(${groupKey}))`,
      ),
    )
    .orderBy(desc(importBatchRows.processedAt))
    .limit(1);

  if (!row?.accurateTransactionId) return null;
  const id = Number(row.accurateTransactionId);
  return Number.isFinite(id) ? { id, batchId: row.batchId } : null;
}

export async function appendToExistingSalesInvoice(
  ctx: AccurateSessionContext,
  existingId: number,
  existingBatchId: string,
  currentBatchId: string,
  group: SalesInvoiceGroup,
  columnMapping: Record<string, string>,
): Promise<SalesInvoiceGroupResult> {
  const rawRows = group.rows.map((r) => r.rawData);
  const customerNo = String(buildSalesInvoicePayload(rawRows, columnMapping).customerNo ?? "");

  // § Fase 82 (2026-09-10) — mirror `appendToExistingPurchaseInvoice`:
  // verifikasi ke ACCURATE SUNGGUHAN dulu, jangan percaya DB lokal —
  // kalau faktur "existing" ternyata sudah dihapus langsung di Accurate
  // (`isAccurateRecordNotFound`), fallback ke jalur CREATE biasa.
  let detail: SalesInvoiceDetail;
  try {
    detail = await getSalesInvoiceDetail(ctx, existingId);
  } catch (err) {
    if (isAccurateRecordNotFound(err)) return processSalesInvoiceGroup(ctx, group, columnMapping);
    throw err;
  }

  if (customerNo && detail.customer.no !== customerNo) {
    throw new Error(
      `Nomor grup "${group.groupKey}" sudah dipakai Faktur Penjualan #${existingId} milik Customer "${detail.customer.no}" di Accurate — tidak sama dengan Customer baris ini ("${customerNo}"), retry dibatalkan untuk mencegah salah gabung faktur.`,
    );
  }

  const findDuplicateItem = (candidate: Record<string, unknown>) =>
    detail.detailItem.find(
      (existing) =>
        existing.itemNo === String(candidate.itemNo ?? "") &&
        existing.unitPrice === Number(candidate.unitPrice ?? 0) &&
        existing.quantity === Number(candidate.quantity ?? 0),
    );

  const perRow = group.rows.map((row, i) => {
    const detailItem = buildDetailItemFromRowSI(rawRows[i]!, columnMapping);
    return { row, rawRow: rawRows[i]!, detailItem, existingMatch: findDuplicateItem(detailItem) };
  });
  const newRows = perRow.filter((r) => !r.existingMatch);

  if (newRows.length === 0) {
    // § Fase 67 — bedakan retry-safety ASLI (match dari batch YANG SAMA)
    // dari batch BARU yang KEBETULAN identik (match dari batch LAIN) —
    // kasus kedua BUKAN retry, harus gagal dengan pesan jelas, BUKAN
    // silent success (bug nyata: client isi PPN/Atribut Tambahan di file
    // yang item/harga/qty-nya sama persis dengan test sebelumnya, save.do
    // di-skip total, field baru tidak pernah terkirim ke Accurate).
    if (isCoincidentalDuplicateAcrossBatches({ newRowsCount: newRows.length, existingBatchId, currentBatchId })) {
      throw new Error(
        `Nomor Transaksi "${group.groupKey}" dengan barang, harga, dan qty yang PERSIS SAMA sudah ada di Faktur Penjualan #${existingId} (dari batch import SEBELUMNYA) — tidak ada baris baru untuk dikirim, jadi field lain (PPN/Pajak/Diskon/Atribut Tambahan/dst) di baris ini TIDAK ikut diperbarui di Accurate. Kalau ini transaksi baru, gunakan Nomor Transaksi yang berbeda. Kalau bermaksud mengubah data pada faktur ini, update manual di Accurate (fitur update-in-place belum didukung).`,
      );
    }
    return {
      invoiceId: existingId,
      rows: perRow.map((r) => ({ rowId: r.row.id, detailItemId: r.existingMatch!.id })),
    };
  }

  const seenItemNo = new Set<string>();
  for (const { rawRow } of newRows) {
    const itemNo = extractRowDetailItemNo(rawRow, columnMapping);
    if (!itemNo || seenItemNo.has(itemNo)) continue;
    seenItemNo.add(itemNo);
    await findOrCreateItem(ctx, itemNo, extractItemCreateFieldsSI(rawRow, columnMapping));
  }

  await ensureDataClassifications(ctx, newRows.map((r) => r.rawRow), columnMapping);

  const result = await saveSalesInvoice(ctx, {
    id: existingId,
    detailItem: [...detail.detailItem.map((it) => ({ id: it.id })), ...newRows.map((r) => r.detailItem)],
  });

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

// ============================================================
// § Fase 49 — Sales Receipt, grouping DALAM 1 batch (banyak baris = 1
// penerimaan yang bayar banyak faktur). LEBIH SEDERHANA dari blok
// Purchase Invoice/Sales Invoice di atas — SENGAJA TANPA
// findExisting/append-to-existing-lintas-batch (architecture-sales-receipt.md:
// "Batal Import" & retry-cerdas SENGAJA tidak didukung modul ini, 2
// penerimaan nominal sama ke faktur sama adalah 2 transaksi SAH beda,
// bukan duplikat) — tiap grup SELALU lewat jalur CREATE (`saveSalesReceipt`
// tanpa `id`), tidak pernah UPDATE ke penerimaan lama.
export type SalesReceiptGroupResult = {
  receiptId: number;
  rowIds: string[];
};

// § Fase 86 (2026-09-10) — "Tax ID" VALIDASI-ONLY (§ komentar
// `fieldToAccuratePath` sales-receipt.mapping.ts): dicocokkan ke Master
// Data Pajak Accurate (`/api/tax/list.do`, scope `tax_view`) SEBELUM
// payload dibangun — gagal SELURUH grup dengan pesan jelas kalau ada
// nilai yang tidak ditemukan (bukan cuma warning diam-diam), supaya
// client tahu ada typo/kode pajak yang belum ada di company mereka.
// TIDAK ada auto-create (beda dari `findOrCreateVendor`/`findOrCreateItem`)
// — Master Data Pajak adalah konfigurasi akuntansi sensitif, bukan
// referensi ringan seperti vendor/item.
async function validateTaxIdsForReceipt(ctx: AccurateSessionContext, rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Promise<void> {
  const taxIds = extractTaxIdsFromRows(rawRows, columnMapping);
  for (const taxId of taxIds) {
    const found = await findTaxByIdentifier(ctx, taxId);
    if (!found) {
      throw new Error(`Tax ID "${taxId}" tidak ditemukan di Data Master Pajak Accurate — cek ejaan/kode pajak, atau kosongkan kolom "Tax ID" kalau tidak diperlukan.`);
    }
  }
}

export async function processSalesReceiptGroup(
  ctx: AccurateSessionContext,
  group: SalesReceiptGroup,
  columnMapping: Record<string, string>,
): Promise<SalesReceiptGroupResult> {
  const mismatchError = validateGroupCustomerConsistencyForReceipt(group, columnMapping);
  if (mismatchError) throw new Error(mismatchError);

  const rawRows = group.rows.map((r) => r.rawData);
  await validateTaxIdsForReceipt(ctx, rawRows, columnMapping);
  const payload = buildSalesReceiptPayload(rawRows, columnMapping);

  const result = await saveSalesReceipt(ctx, payload);
  return { receiptId: result.id, rowIds: group.rows.map((r) => r.id) };
}

// ============================================================
// § Fase 50 — Purchase Payment, mirror PERSIS blok Sales Receipt di
// atas (vendorNo ganti customerNo, paymentNumber ganti receiptNumber)
// — SEDERHANA, TANPA findExisting/append (alasan sama: 2 pembayaran
// nominal sama ke faktur sama adalah 2 transaksi SAH beda).
// ============================================================
export type PurchasePaymentGroupResult = {
  paymentId: number;
  rowIds: string[];
};

// § Fase 89 (2026-09-10) — "PPh ID" VALIDASI-ONLY, mirror PERSIS
// `validateTaxIdsForReceipt` (Sales Receipt Fase 86) — REUSE
// `accurate-tax.ts`, TIDAK ada auto-create (Master Data Pajak dianggap
// konfigurasi akuntansi sensitif).
async function validateTaxIdsForPurchasePayment(ctx: AccurateSessionContext, rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Promise<void> {
  const taxIds = extractTaxIdsFromRowsPP(rawRows, columnMapping);
  for (const taxId of taxIds) {
    const found = await findTaxByIdentifier(ctx, taxId);
    if (!found) {
      throw new Error(`PPh ID "${taxId}" tidak ditemukan di Data Master Pajak Accurate — cek ejaan/kode pajak, atau kosongkan kolom "PPh ID" kalau tidak diperlukan.`);
    }
  }
}

export async function processPurchasePaymentGroup(
  ctx: AccurateSessionContext,
  group: PurchasePaymentGroup,
  columnMapping: Record<string, string>,
): Promise<PurchasePaymentGroupResult> {
  const mismatchError = validateGroupVendorConsistencyForPayment(group, columnMapping);
  if (mismatchError) throw new Error(mismatchError);

  const rawRows = group.rows.map((r) => r.rawData);
  await validateTaxIdsForPurchasePayment(ctx, rawRows, columnMapping);
  const payload = buildPurchasePaymentPayload(rawRows, columnMapping);

  const result = await savePurchasePayment(ctx, payload);
  return { paymentId: result.id, rowIds: group.rows.map((r) => r.id) };
}

// ============================================================
// § Journal Voucher, grouping DALAM 1 batch, create-only. TIDAK ada
// validasi konsistensi vendor/customer (JV memang tidak punya konsep
// itu) — validasi balance debit=kredit SUDAH di dalam
// `buildJournalVoucherPayload` sendiri. § Fase 96 — SEKARANG SATU-
// SATUNYA cara proses modul ini (Opsi A/format lebar dipensiunkan).
// ============================================================
export type JournalVoucherGroupResult = {
  journalId: number;
  rowIds: string[];
};

export async function processJournalVoucherGroup(
  ctx: AccurateSessionContext,
  group: JournalVoucherGroup,
  columnMapping: Record<string, string>,
): Promise<JournalVoucherGroupResult> {
  const rawRows = group.rows.map((r) => r.rawData);
  await ensureJournalVoucherDataClassifications(ctx, rawRows, columnMapping);
  const payload = buildJournalVoucherPayload(rawRows, columnMapping);

  const result = await saveJournalVoucher(ctx, payload);
  return { journalId: result.id, rowIds: group.rows.map((r) => r.id) };
}

async function main() {
  await startQueue();

  await boss.work<{ to: string; subject: string; html: string; sensitive?: boolean }>(
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
    // § Fase 45 — ikut ambil userId+isTrial (bukan cuma id) supaya bisa
    // bikin notifikasi "trial_expired"/"subscription_expired" yang tepat.
    const expired = await db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(and(eq(subscriptions.status, "active"), lt(subscriptions.endAt, new Date())))
      .returning({ id: subscriptions.id, userId: subscriptions.userId, isTrial: subscriptions.isTrial });

    for (const sub of expired) {
      await createNotification({
        userId: sub.userId,
        type: sub.isTrial ? NOTIFICATION_TYPES.TRIAL_EXPIRED : NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
        title: sub.isTrial ? "Trial sudah berakhir" : "Langganan sudah berakhir",
        body: sub.isTrial
          ? "Trial kamu sudah berakhir — upgrade ke paket berbayar untuk lanjut import."
          : "Langganan kamu sudah berakhir — perpanjang supaya bisa lanjut import.",
        entityType: "subscription",
        entityId: sub.id,
      });
    }

    logger.info({ count: expired.length }, "Subscriptions expired");
  });

  // § Fase 45 — reminder H-sekian sebelum subscription/trial berakhir,
  // TERPISAH dari job expire di atas (yang FLIP status, bukan cuma
  // ingatkan). Threshold BEDA untuk trial (durasi pendek, cukup H-3/H-1)
  // vs subscription asli (H-7/H-3/H-1) — § lib/subscription-reminders.ts.
  await boss.schedule(JOBS.NOTIFY_EXPIRING_SOON, "0 0 * * *");
  await boss.work(JOBS.NOTIFY_EXPIRING_SOON, async () => {
    const now = Date.now();
    const active = await db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        isTrial: subscriptions.isTrial,
        endAt: subscriptions.endAt,
        lastReminderThresholdDays: subscriptions.lastReminderThresholdDays,
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));

    let notified = 0;
    for (const sub of active) {
      if (!sub.endAt) continue;
      const daysLeft = (sub.endAt.getTime() - now) / (24 * 60 * 60 * 1000);
      const thresholds = sub.isTrial ? TRIAL_REMINDER_THRESHOLDS : SUBSCRIPTION_REMINDER_THRESHOLDS;
      const applicableThreshold = findApplicableReminderThreshold(daysLeft, thresholds, sub.lastReminderThresholdDays);
      if (applicableThreshold === null) continue;

      await createNotification({
        userId: sub.userId,
        type: sub.isTrial ? NOTIFICATION_TYPES.TRIAL_ENDING_SOON : NOTIFICATION_TYPES.SUBSCRIPTION_ENDING_SOON,
        title: sub.isTrial ? "Trial akan berakhir" : "Langganan akan berakhir",
        body: sub.isTrial
          ? `Trial kamu akan berakhir ${Math.ceil(daysLeft)} hari lagi — upgrade sekarang supaya tidak terputus.`
          : `Langganan kamu akan berakhir ${Math.ceil(daysLeft)} hari lagi — perpanjang sekarang supaya tidak terputus.`,
        entityType: "subscription",
        entityId: sub.id,
      });
      await db.update(subscriptions).set({ lastReminderThresholdDays: applicableThreshold }).where(eq(subscriptions.id, sub.id));
      notified++;
    }

    logger.info({ notified }, "Notify expiring soon selesai");
  });

  // § Fase 45, ADR-0029 — fan-out broadcast admin. Dipanggil ASYNC dari
  // `POST /admin/announcements` (bukan sinkron di endpoint) supaya
  // response admin tidak nunggu resolve target + bulk-insert selesai
  // (bisa banyak baris kalau target="all_customers").
  await boss.work<{ announcementId: string }>(JOBS.SEND_ANNOUNCEMENT, async ([job]) => {
    if (!job) return;
    const { announcementId } = job.data;
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, announcementId));
    if (!announcement) {
      logger.error({ announcementId }, "SEND_ANNOUNCEMENT: announcement tidak ditemukan");
      return;
    }

    const recipientIds = await resolveAnnouncementRecipients({
      target: announcement.target as "all_customers" | "specific_modules" | "specific_users",
      targetModules: announcement.targetModules,
      targetUserIds: announcement.targetUserIds,
    });

    await createNotificationsBulk(
      recipientIds.map((userId) => ({
        userId,
        type: NOTIFICATION_TYPES.ANNOUNCEMENT,
        title: announcement.title,
        body: announcement.body,
        entityType: "announcement",
        entityId: announcement.id,
        sourceAnnouncementId: announcement.id,
      })),
    );

    await db.update(announcements).set({ recipientCount: recipientIds.length }).where(eq(announcements.id, announcementId));
    logger.info({ announcementId, recipientCount: recipientIds.length }, "Announcement fan-out selesai");
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
        // — tandai expired + notifikasi (§ `markConnectionExpired`, Fase 45
        // asal notifikasi ini, diekstrak jadi helper bersama Fase 91).
        logger.error({ err, connectionId: conn.id }, "Accurate token refresh gagal, tandai expired");
        Sentry.captureException(err);
        await markConnectionExpired(conn);
      }
    }
  });

  // § architecture-accurate-integration.md § 2, § "Sesi Data Usaha" — 1
  // baris Excel = 1 Faktur Pembelian dengan 1 detailItem (§ phase-02 doc
  // "Keputusan Kecil"). Sesi Data Usaha dibuka SEKALI per job run, bukan
  // per-row (§ "Sesi Data Usaha" — session/host ephemeral, tidak di-cache
  // lintas job).
  // § ditemukan 2026-09-08 (feedback user, batch NYATA di production
  // 379b65d8-...) — batch bisa gagal SEBELUM loop per-baris mulai sama
  // sekali (koneksi Accurate belum ada, atau sesi Data Usaha gagal
  // dibuka). Sebelum fix ini, cuma `importBatches.status` yang di-set
  // "failed" — baris-barisnya DIBIARKAN "pending" selamanya, TANPA
  // `errorMessage`. Admin lihat batch "failed" tapi tabel baris kosong
  // total ("-" di semua baris), TIDAK tahu penyebabnya sama sekali —
  // padahal architecture-accurate-integration.md § 5 EKSPLISIT
  // mewajibkan errorMessage actionable untuk SEMUA kegagalan. Helper ini
  // dipanggil di KEDUA titik gagal-dini itu — SEBELUM percabangan per
  // modul (baris ~790), jadi otomatis berlaku utk KE-6 modul import
  // (bukan cuma purchase_invoice), tidak perlu diulang per modul.
  async function failAllPendingRows(targetBatchId: string, errorMessage: string) {
    await db
      .update(importBatchRows)
      .set({ status: "failed", errorMessage, processedAt: new Date() })
      .where(
        and(
          eq(importBatchRows.batchId, targetBatchId),
          or(eq(importBatchRows.status, "pending"), eq(importBatchRows.status, "failed")),
        ),
      );
  }

  await boss.work<{ batchId: string }>(JOBS.IMPORT_TO_ACCURATE, async ([job]) => {
    if (!job) return;
    const { batchId } = job.data;

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) {
      logger.error({ batchId }, "Import batch tidak ditemukan, skip job");
      return;
    }

    const connection = await getConnectionForBatch(batch.subscriptionId);

    if (!connection || !connection.accurateDbId) {
      const errorMessage = "Koneksi Accurate belum dipilih atau tidak valid — hubungkan/pilih Data Usaha Accurate dulu sebelum import.";
      await db.update(importBatches).set({ status: "failed", completedAt: new Date() }).where(eq(importBatches.id, batch.id));
      await failAllPendingRows(batch.id, errorMessage);
      logger.error({ batchId }, "Import gagal: koneksi Accurate belum ada/belum pilih Data Usaha");
      return;
    }

    let session;
    try {
      session = await openAccurateSession(connection);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await db.update(importBatches).set({ status: "failed", completedAt: new Date() }).where(eq(importBatches.id, batch.id));
      await failAllPendingRows(batch.id, `Gagal membuka sesi Data Usaha Accurate: ${detail}`);
      logger.error({ err, batchId }, "Import gagal: tidak bisa buka sesi Data Usaha Accurate");
      Sentry.captureException(err);
      // § Fase 91 — gagal buka sesi HAMPIR SELALU berarti token/koneksi
      // sudah tidak valid (revoked/expired) — tandai supaya halaman
      // /accurate & tombol "Hubungkan Ulang" langsung akurat, bukan
      // baru ketahuan lewat job refresh terjadwal besok.
      await markConnectionExpired(connection);
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
      for (const group of groups) {
        const rowIds = group.rows.map((r) => r.id);
        try {
          // § Fase 08, ADR-0012 — Retry Cerdas: kalau grup ini SUDAH
          // PERNAH sukses jadi faktur (lintas-batch), append item baru ke
          // faktur itu (UPDATE), BUKAN coba create faktur baru yang bakal
          // ditolak Accurate sebagai duplikat nomor. Grup tanpa
          // groupKey/groupColumn (singleton) selalu lewat jalur CREATE
          // seperti biasa — tidak ada identitas untuk dicari. § Fase 81 —
          // kunci grouping DIGENERALISASI (`group.groupKey`/
          // `group.groupColumn`, bisa dari kolom "Trans No" ATAU "Bill
          // No" — lihat `groupPurchaseInvoiceRows`), mirror Fase 49 SI.
          const existing =
            group.groupKey && group.groupColumn
              ? await findExistingAccurateInvoiceId(batch.subscriptionId, group.groupKey, group.groupColumn)
              : null;
          const result = existing
            ? await appendToExistingPurchaseInvoice(session, existing.id, existing.batchId, batch.id, group, columnMapping)
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
      // § Fase 13 — Sales Invoice, bayangan cermin blok Purchase Invoice
      // di atas (PO Number/Trans No ganti peran Bill No, Customer ganti
      // Vendor). § Fase 49 — kunci grouping DIGENERALISASI
      // (`group.groupKey`/`group.groupColumn`, bisa dari kolom "Trans
      // No" ATAU "PO Number" — lihat `groupSalesInvoiceRows`).
    } else if (batch.module === "sales_invoice") {
      const groups = groupSalesInvoiceRows(
        rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        columnMapping,
      );
      for (const group of groups) {
        const rowIds = group.rows.map((r) => r.id);
        try {
          const existing =
            group.groupKey && group.groupColumn
              ? await findExistingAccurateSalesInvoiceId(batch.subscriptionId, group.groupKey, group.groupColumn)
              : null;
          const result = existing
            ? await appendToExistingSalesInvoice(session, existing.id, existing.batchId, batch.id, group, columnMapping)
            : await processSalesInvoiceGroup(session, group, columnMapping);
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
      // § Fase 49 — Sales Receipt, grouping DALAM 1 batch, create-only
      // (TANPA findExisting/append — lihat komentar `processSalesReceiptGroup`).
    } else if (batch.module === "sales_receipt") {
      const groups = groupSalesReceiptRows(
        rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        columnMapping,
      );
      for (const group of groups) {
        const rowIds = group.rows.map((r) => r.id);
        try {
          const result = await processSalesReceiptGroup(session, group, columnMapping);
          await db
            .update(importBatchRows)
            .set({
              status: "success",
              accurateTransactionId: String(result.receiptId),
              errorMessage: null,
              processedAt: new Date(),
            })
            .where(inArray(importBatchRows.id, result.rowIds));
        } catch (err) {
          await db
            .update(importBatchRows)
            .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), processedAt: new Date() })
            .where(inArray(importBatchRows.id, rowIds));
        }
      }
      // § Fase 50 — Purchase Payment, mirror PERSIS blok Sales Receipt
      // di atas (lihat komentar `processPurchasePaymentGroup`).
    } else if (batch.module === "purchase_payment") {
      const groups = groupPurchasePaymentRows(
        rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        columnMapping,
      );
      for (const group of groups) {
        const rowIds = group.rows.map((r) => r.id);
        try {
          const result = await processPurchasePaymentGroup(session, group, columnMapping);
          await db
            .update(importBatchRows)
            .set({
              status: "success",
              accurateTransactionId: String(result.paymentId),
              errorMessage: null,
              processedAt: new Date(),
            })
            .where(inArray(importBatchRows.id, result.rowIds));
        } catch (err) {
          await db
            .update(importBatchRows)
            .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), processedAt: new Date() })
            .where(inArray(importBatchRows.id, rowIds));
        }
      }
      // § Journal Voucher — SELALU diproses per-grup (§ Fase 96, Opsi A/
      // format lebar dipensiunkan total, tidak ada lagi jalur alternatif
      // lewat `processImportRow` generic).
    } else if (batch.module === "journal_voucher") {
      const groups = groupJournalVoucherRows(
        rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        columnMapping,
      );
      for (const group of groups) {
        const rowIds = group.rows.map((r) => r.id);
        try {
          const result = await processJournalVoucherGroup(session, group, columnMapping);
          await db
            .update(importBatchRows)
            .set({
              status: "success",
              accurateTransactionId: String(result.journalId),
              errorMessage: null,
              processedAt: new Date(),
            })
            .where(inArray(importBatchRows.id, result.rowIds));
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

    const connection = await getConnectionForBatch(batch.subscriptionId);

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
      await markConnectionExpired(connection); // § Fase 91, lihat komentar definisi helper
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
      // § Fase 13, security review — Medium finding: WAJIB scope by
      // `module` juga, sama seperti `findExistingAccurateInvoiceId`/
      // `findExistingAccurateSalesInvoiceId` — dua modul (purchase_invoice
      // vs sales_invoice) punya ruang ID Accurate TERPISAH, tanpa filter
      // ini `accurateTransactionId` yang kebetulan sama angkanya di 2
      // modul berbeda akan dianggap "faktur yang sama" (arahnya cuma
      // over-blocking, bukan hapus salah faktur, tapi tetap bug nyata).
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
            eq(importBatches.module, batch.module),
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
        // § Fase 13 — cabang by module, endpoint delete Accurate beda per
        // jenis transaksi (purchase-invoice vs sales-invoice).
        if (batch.module === "sales_invoice") {
          await deleteSalesInvoice(session, invoiceId);
        } else {
          await deletePurchaseInvoice(session, invoiceId);
        }
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
