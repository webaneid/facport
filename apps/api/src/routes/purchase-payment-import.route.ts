import { Elysia, t } from "elysia";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { importBatches, importBatchRows, auditLogs } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { parseExcelBuffer, generateTemplateBuffer } from "../lib/excel";
import { purchasePaymentMapping } from "../lib/import-mapping/purchase-payment.mapping";
import { purchasePaymentTemplateGuide } from "../lib/import-mapping/template-guide";
import { boss, JOBS } from "../lib/queue";
import { checkTrialRowBudget } from "../lib/trial";

// § architecture-security.md §8, pola sama vendor-payable-account-import.route.ts
const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls lama
] as const;
const MAX_SIZE_MB = 10;
const MAX_ROWS = 5000;

const VALID_FIELDS = new Set(Object.keys(purchasePaymentMapping.fieldToAccuratePath));

function suggestMapping(excelColumns: string[]): Record<string, string> {
  const suggestion: Record<string, string> = {};
  for (const col of excelColumns) {
    const normalized = col.trim().toLowerCase();
    const match = Object.keys(purchasePaymentMapping.defaultColumnMap).find(
      (defaultCol) => defaultCol.toLowerCase() === normalized,
    );
    if (match) suggestion[col] = purchasePaymentMapping.defaultColumnMap[match]!;
  }
  return suggestion;
}

// § architecture-purchase-payment.md — aplikasi pembayaran ke faktur yang
// SUDAH ADA di Accurate (BUKAN mirror Purchase Invoice). 1 baris Excel =
// 1 pembayaran = 1 faktur, diproses per-baris (pola sama
// vendor-payable-account-import.route.ts), TIDAK ada grouping.
export const purchasePaymentImportRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/purchase-payment/import/template",
    () => {
      const buffer = generateTemplateBuffer(purchasePaymentTemplateGuide);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="template-purchase-payment.xlsx"',
        },
      });
    },
    { permission: "import.create", moduleAccess: "purchase_payment" },
  )
  .get(
    "/purchase-payment/import",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = and(eq(importBatches.subscriptionId, subscription.id), eq(importBatches.module, "purchase_payment"));
      const [batches, totalRows] = await Promise.all([
        db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(importBatches).where(where),
      ]);
      return { batches, total: totalRows[0]?.total ?? 0 };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/purchase-payment/import/upload",
    async ({ body, user, subscription, set }) => {
      const buffer = Buffer.from(await body.file.arrayBuffer());

      let headers: string[];
      let rows: Record<string, unknown>[];
      try {
        ({ headers, rows } = parseExcelBuffer(buffer));
      } catch {
        set.status = 400;
        return { code: "INVALID_EXCEL_FILE" };
      }

      if (rows.length === 0) {
        set.status = 400;
        return { code: "EMPTY_FILE" };
      }
      if (rows.length > MAX_ROWS) {
        set.status = 400;
        return { code: "TOO_MANY_ROWS", maxRows: MAX_ROWS };
      }

      const [batch] = await db
        .insert(importBatches)
        .values({
          userId: user.id,
          subscriptionId: subscription.id,
          module: "purchase_payment",
          fileName: body.file.name.slice(0, 255),
          totalRows: rows.length,
          status: "mapping_pending",
        })
        .returning();

      await db.insert(importBatchRows).values(
        rows.map((row, i) => ({
          batchId: batch!.id,
          rowNumber: i + 1,
          rawData: row,
          status: "pending",
        })),
      );

      return {
        batchId: batch!.id,
        totalRows: rows.length,
        excelColumns: headers,
        previewRows: rows.slice(0, 5),
        suggestedMapping: suggestMapping(headers),
      };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  )
  .post(
    "/purchase-payment/import/:batchId/confirm",
    async ({ params, body, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      if (batch.status !== "mapping_pending") {
        set.status = 409;
        return { code: "ALREADY_CONFIRMED" };
      }

      const invalidFields = Object.values(body.columnMapping).filter((f) => !VALID_FIELDS.has(f));
      if (invalidFields.length > 0) {
        set.status = 400;
        return { code: "INVALID_MAPPING_FIELD", fields: invalidFields };
      }

      const mappedFields = new Set(Object.values(body.columnMapping));
      const missing = purchasePaymentMapping.requiredFields.filter((f) => !mappedFields.has(f));
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_FIELDS", fields: missing };
      }

      // § Fase 43 — trial dibatasi jumlah baris berhasil-import (bukan
      // paket asli, `checkTrialRowBudget` selalu {ok:true} untuk itu).
      // confirm memproses SEMUA baris batch ini, jadi additionalRows =
      // totalRows. Tolak SELURUH batch (bukan sebagian) kalau lebih dari
      // sisa kuota.
      const budgetCheck = await checkTrialRowBudget(subscription.id, batch.totalRows);
      if (!budgetCheck.ok) {
        set.status = 400;
        return { code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: budgetCheck.remaining, max: budgetCheck.max };
      }

      await db
        .update(importBatches)
        .set({ columnMapping: body.columnMapping, status: "processing" })
        .where(eq(importBatches.id, batch.id));

      await boss.send(JOBS.IMPORT_TO_ACCURATE, { batchId: batch.id });

      return { batchId: batch.id, status: "processing" };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({ columnMapping: t.Record(t.String(), t.String()) }),
    },
  )
  .get(
    "/purchase-payment/import/:batchId",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
      const summary = {
        pending: rows.filter((r) => r.status === "pending").length,
        success: rows.filter((r) => r.status === "success").length,
        failed: rows.filter((r) => r.status === "failed").length,
      };
      return { batch, summary, rows };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .post(
    "/purchase-payment/import/:batchId/retry",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }

      // § Fase 43 — retry cuma memproses ULANG baris pending/failed
      // (bukan seluruh batch seperti confirm), jadi additionalRows =
      // jumlah baris ITU, bukan `batch.totalRows`.
      const [pendingRowCount] = await db
        .select({ pendingCount: count() })
        .from(importBatchRows)
        .where(and(eq(importBatchRows.batchId, batch.id), inArray(importBatchRows.status, ["pending", "failed"])));
      const budgetCheck = await checkTrialRowBudget(subscription.id, pendingRowCount?.pendingCount ?? 0);
      if (!budgetCheck.ok) {
        set.status = 400;
        return { code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: budgetCheck.remaining, max: budgetCheck.max };
      }

      await db
        .update(importBatches)
        .set({ status: "processing", completedAt: null })
        .where(eq(importBatches.id, batch.id));
      await boss.send(JOBS.IMPORT_TO_ACCURATE, { batchId: batch.id });
      return { batchId: batch.id, status: "processing" };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  // § edit baris GAGAL langsung di aplikasi (tanpa upload ulang seluruh
  // file), pola sama `purchase-invoice-import.route.ts`. Cuma baris
  // `failed` yang boleh diedit.
  .put(
    "/purchase-payment/import/:batchId/rows/:rowId",
    async ({ params, body, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      const [row] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, params.rowId));
      if (!row || row.batchId !== batch.id) {
        set.status = 404;
        return { code: "ROW_NOT_FOUND" };
      }
      if (row.status !== "failed") {
        set.status = 409;
        return { code: "ROW_NOT_EDITABLE" };
      }

      const columnMapping = (batch.columnMapping ?? {}) as Record<string, string>;
      const missing = purchasePaymentMapping.requiredFields.filter((field) => {
        const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
        const value = excelColumn ? body.rawData[excelColumn] : undefined;
        return value === undefined || value === null || String(value).trim() === "";
      });
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_VALUES", fields: missing };
      }

      await db
        .update(importBatchRows)
        .set({ rawData: body.rawData, status: "pending", errorMessage: null })
        .where(eq(importBatchRows.id, row.id));

      return { rowId: row.id, status: "pending" };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      params: t.Object({ batchId: t.String({ format: "uuid" }), rowId: t.String({ format: "uuid" }) }),
      body: t.Object({ rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) }),
    },
  )
  // § Fase 51 — versi BULK dari endpoint di atas (JAMAK "/rows", bukan
  // "/rows/:rowId") — dipakai grid edit ala Excel. Baris yang bukan
  // milik batch ini atau statusnya bukan `failed` DILEWATI (dicatat di
  // `errors`, BUKAN gagalkan seluruh request).
  .put(
    "/purchase-payment/import/:batchId/rows",
    async ({ params, body, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }

      const columnMapping = (batch.columnMapping ?? {}) as Record<string, string>;
      const existingRows = await db
        .select()
        .from(importBatchRows)
        .where(inArray(importBatchRows.id, body.rows.map((r) => r.id)));
      const rowById = new Map(existingRows.map((r) => [r.id, r]));

      const updated: string[] = [];
      const errors: { rowId: string; rowNumber: number; fields: string[] }[] = [];

      for (const item of body.rows) {
        const row = rowById.get(item.id);
        if (!row || row.batchId !== batch.id) {
          errors.push({ rowId: item.id, rowNumber: -1, fields: ["ROW_NOT_FOUND"] });
          continue;
        }
        if (row.status !== "failed") {
          errors.push({ rowId: item.id, rowNumber: row.rowNumber, fields: ["ROW_NOT_EDITABLE"] });
          continue;
        }

        const missing = purchasePaymentMapping.requiredFields.filter((field) => {
          const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
          const value = excelColumn ? item.rawData[excelColumn] : undefined;
          return value === undefined || value === null || String(value).trim() === "";
        });
        if (missing.length > 0) {
          errors.push({ rowId: item.id, rowNumber: row.rowNumber, fields: missing });
          continue;
        }

        await db
          .update(importBatchRows)
          .set({ rawData: item.rawData, status: "pending", errorMessage: null })
          .where(eq(importBatchRows.id, row.id));
        updated.push(row.id);
      }

      return { updated, errors };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({
        rows: t.Array(t.Object({ id: t.String({ format: "uuid" }), rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) })),
      }),
    },
  )
  // § "Delete": hapus batch+baris LOKAL saja, TIDAK PERNAH memanggil
  // Accurate — pola sama `purchase-invoice-import.route.ts`.
  .delete(
    "/purchase-payment/import/:batchId",
    async ({ params, user, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      if (batch.status === "processing" || batch.status === "cancelling") {
        set.status = 409;
        return { code: "BATCH_BUSY" };
      }

      const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
      await db.insert(auditLogs).values({
        entityType: "import_batch",
        entityId: batch.id,
        action: "delete",
        changes: {
          fileName: batch.fileName,
          totalRows: batch.totalRows,
          status: batch.status,
          hadAccurateSuccess: rows.some((r) => r.accurateTransactionId !== null),
        },
        actorId: user.id,
      });

      await db.delete(importBatches).where(eq(importBatches.id, batch.id));

      return { batchId: batch.id, deleted: true };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_payment",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  );
