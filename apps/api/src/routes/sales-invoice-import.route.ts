import { Elysia, t } from "elysia";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../lib/db";
import { importBatches, importBatchRows, auditLogs } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { boss, JOBS } from "../lib/queue";
import { parseExcelBuffer, generateTemplateBuffer } from "../lib/excel";
import { salesInvoiceMapping, customerAutoCreateMapping, itemAutoCreateMapping, type SalesInvoiceField } from "../lib/import-mapping/sales-invoice.mapping";
import { salesInvoiceTemplateGuide } from "../lib/import-mapping/template-guide";

// § Fase 13 — mirror 1:1 `purchase-invoice-import.route.ts` (module
// "sales_invoice", moduleAccess "sales_invoice" sejak Fase 14/ADR-0019 —
// sebelumnya grup top-level "penjualan").
const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;
const MAX_SIZE_MB = 10;
const MAX_ROWS = 5000;

const ALL_DEFAULT_COLUMN_MAPS: Record<string, string>[] = [
  salesInvoiceMapping.defaultColumnMap,
  customerAutoCreateMapping.defaultColumnMap,
  itemAutoCreateMapping.defaultColumnMap,
];
const VALID_FIELDS = new Set([
  ...Object.keys(salesInvoiceMapping.fieldToAccuratePath),
  ...Object.keys(customerAutoCreateMapping.fieldToAccuratePath),
  ...Object.keys(itemAutoCreateMapping.fieldToAccuratePath),
]);

function suggestMapping(excelColumns: string[]): Record<string, string> {
  const suggestion: Record<string, string> = {};
  for (const col of excelColumns) {
    const normalized = col.trim().toLowerCase();
    for (const map of ALL_DEFAULT_COLUMN_MAPS) {
      const match = Object.keys(map).find((defaultCol) => defaultCol.toLowerCase() === normalized);
      if (match) {
        suggestion[col] = map[match]!;
        break;
      }
    }
  }
  return suggestion;
}

export const salesInvoiceImportRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/sales-invoice/import/template",
    () => {
      const buffer = generateTemplateBuffer(salesInvoiceTemplateGuide);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="template-sales-invoice.xlsx"',
        },
      });
    },
    { permission: "import.create", moduleAccess: "sales_invoice" },
  )
  .get(
    "/sales-invoice/import",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = and(eq(importBatches.subscriptionId, subscription.id), eq(importBatches.module, "sales_invoice"));
      const [batches, totalRows] = await Promise.all([
        db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(importBatches).where(where),
      ]);
      return { batches, total: totalRows[0]?.total ?? 0 };
    },
    {
      permission: "import.create",
      moduleAccess: "sales_invoice",
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/sales-invoice/import/upload",
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
          module: "sales_invoice",
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
      moduleAccess: "sales_invoice",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  )
  .post(
    "/sales-invoice/import/:batchId/confirm",
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

      const mappedFields = new Set(Object.values(body.columnMapping) as SalesInvoiceField[]);
      const missing = salesInvoiceMapping.requiredFields.filter((f) => !mappedFields.has(f));
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_FIELDS", fields: missing };
      }

      await db.update(importBatches).set({ columnMapping: body.columnMapping, status: "processing" }).where(eq(importBatches.id, batch.id));

      await boss.send(JOBS.IMPORT_TO_ACCURATE, { batchId: batch.id });

      return { batchId: batch.id, status: "processing" };
    },
    {
      permission: "import.create",
      moduleAccess: "sales_invoice",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({ columnMapping: t.Record(t.String(), t.String()) }),
    },
  )
  .get(
    "/sales-invoice/import/:batchId",
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
    { permission: "import.create", moduleAccess: "sales_invoice", params: t.Object({ batchId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/sales-invoice/import/:batchId/retry",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      await db.update(importBatches).set({ status: "processing", completedAt: null }).where(eq(importBatches.id, batch.id));
      await boss.send(JOBS.IMPORT_TO_ACCURATE, { batchId: batch.id });
      return { batchId: batch.id, status: "processing" };
    },
    { permission: "import.create", moduleAccess: "sales_invoice", params: t.Object({ batchId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/sales-invoice/import/:batchId/cancel",
    async ({ params, user, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      if (batch.status !== "completed" && batch.status !== "completed_with_errors") {
        set.status = 409;
        return { code: "BATCH_NOT_CANCELLABLE" };
      }
      await db.update(importBatches).set({ status: "cancelling", completedAt: null }).where(eq(importBatches.id, batch.id));
      await boss.send(JOBS.CANCEL_IMPORT, { batchId: batch.id, actorId: user.id });
      return { batchId: batch.id, status: "cancelling" };
    },
    { permission: "import.create", moduleAccess: "sales_invoice", params: t.Object({ batchId: t.String({ format: "uuid" }) }) },
  )
  .put(
    "/sales-invoice/import/:batchId/rows/:rowId",
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
      const missing = salesInvoiceMapping.requiredFields.filter((field) => {
        const excelColumn = Object.entries(columnMapping).find(([, f]) => f === field)?.[0];
        const value = excelColumn ? body.rawData[excelColumn] : undefined;
        return value === undefined || value === null || String(value).trim() === "";
      });
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_VALUES", fields: missing };
      }

      await db.update(importBatchRows).set({ rawData: body.rawData, status: "pending", errorMessage: null }).where(eq(importBatchRows.id, row.id));

      return { rowId: row.id, status: "pending" };
    },
    {
      permission: "import.create",
      moduleAccess: "sales_invoice",
      params: t.Object({ batchId: t.String({ format: "uuid" }), rowId: t.String({ format: "uuid" }) }),
      body: t.Object({ rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) }),
    },
  )
  .delete(
    "/sales-invoice/import/:batchId",
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
    { permission: "import.create", moduleAccess: "sales_invoice", params: t.Object({ batchId: t.String({ format: "uuid" }) }) },
  );
