import { Elysia, t } from "elysia";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { importBatches, importBatchRows, auditLogs } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { checkSubscriptionScopes } from "../lib/accurate-scope-check";
import { ownsDataUsaha } from "../lib/data-usaha";
import { parseExcelBuffer, generateTemplateBuffer, generateFailedRowsBuffer, sanitizeFilenamePart } from "../lib/excel";
import { finishedGoodSlipMapping, finishedGoodSlipRowError } from "../lib/import-mapping/finished-good-slip.mapping";
import { finishedGoodSlipTemplateGuide } from "../lib/import-mapping/template-guide";
import { boss, JOBS } from "../lib/queue";
import { checkTrialRowBudget } from "../lib/trial";

// § architecture-security.md §8, pola sama item-transfer-import.route.ts
const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls lama
] as const;
const MAX_SIZE_MB = 10;
const MAX_ROWS = 10000;

const VALID_FIELDS = new Set(Object.keys(finishedGoodSlipMapping.fieldToAccuratePath));

function suggestMapping(excelColumns: string[]): Record<string, string> {
  const suggestion: Record<string, string> = {};
  for (const col of excelColumns) {
    const normalized = col.trim().toLowerCase();
    const match = Object.keys(finishedGoodSlipMapping.defaultColumnMap).find((defaultCol) => defaultCol.toLowerCase() === normalized);
    if (match) suggestion[col] = finishedGoodSlipMapping.defaultColumnMap[match]!;
  }
  return suggestion;
}

// § architecture-finished-good-slip.md (Fase 149) — TIDAK auto-create item, TIDAK ADA "Batal Import". Edit baris gagal (satu & massal) HANYA
// memakai `finishedGoodSlipRowError` (itemNo/quantity/portion wajib bersamaan) — BUKAN `requiredFields` per baris, karena header dokumen
// (tanggal/cabang/Work Order No) boleh hanya diisi di baris PERTAMA grup (kelengkapan header dicek per grup di worker).
// Pengecekan scope Accurate (`checkSubscriptionScopes`) di confirm & retry (Fase 142).
export const finishedGoodSlipImportRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/finished-good-slip/import/template",
    () => {
      // § contoh multi-baris (BUKAN cuma 1 baris) — pola DOMINAN data riil client: 1 barang bisa punya BEBERAPA
      // nomor seri di baris LANJUTAN terpisah (baris 2: Trans No & Item No SAMA dengan baris 1, tapi Qty/Portion/
      // Warehouse dikosongkan, cuma Serial No/Qty/Expired Date yang terisi).
      const buffer = generateTemplateBuffer(finishedGoodSlipTemplateGuide, [
        [
          { column: "Trans No", value: "FGS-2026-0001" },
          { column: "Item No", value: "3300500719" },
          { column: "Serial No", value: "29/10/2025" },
          { column: "Qty", value: "" }, // kemunculan ke-1 "Qty" (item) dikosongkan — baris ini HANYA lanjutan serial
          { column: "Qty", value: "1500" }, // kemunculan ke-2 "Qty" (serial)
          { column: "Expired Date", value: "23/10/2026" },
        ],
      ]);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="template-finished-good-slip.xlsx"',
        },
      });
    },
    { permission: "import.create", moduleAccess: "finished_good_slip" },
  )
  .get(
    "/finished-good-slip/import",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = and(eq(importBatches.subscriptionId, subscription.id), eq(importBatches.module, "finished_good_slip"));
      const [batches, totalRows] = await Promise.all([
        db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(importBatches).where(where),
      ]);
      return { batches, total: totalRows[0]?.total ?? 0 };
    },
    {
      permission: "import.create",
      moduleAccess: "finished_good_slip",
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/finished-good-slip/import/upload",
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
          module: "finished_good_slip",
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
      moduleAccess: "finished_good_slip",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  )
  .post(
    "/finished-good-slip/import/:batchId/confirm",
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
      const missing = finishedGoodSlipMapping.requiredFields.filter((f) => !mappedFields.has(f));
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_FIELDS", fields: missing };
      }

      // § Fase 142 — koneksi Accurate WAJIB sudah punya scope modul ini (pesan jelas SEBELUM job dijadwalkan).

      const scopeCheck = await checkSubscriptionScopes(subscription.id, "finished_good_slip");

      if (!scopeCheck.ok) {

        set.status = 409;

        return { code: "ACCURATE_SCOPE_MISSING", missing: scopeCheck.missing };

      }


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
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({ columnMapping: t.Record(t.String(), t.String()) }),
    },
  )
  .get(
    "/finished-good-slip/import/:batchId",
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
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .get(
    "/finished-good-slip/import/:batchId/failed-rows/export",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }

      const failedRows = await db
        .select()
        .from(importBatchRows)
        .where(and(eq(importBatchRows.batchId, batch.id), eq(importBatchRows.status, "failed")));
      if (failedRows.length === 0) {
        set.status = 404;
        return { code: "NO_FAILED_ROWS" };
      }

      const columnMapping = (batch.columnMapping ?? {}) as Record<string, string>;
      const buffer = generateFailedRowsBuffer(
        failedRows.map((r) => ({ rawData: r.rawData as Record<string, unknown>, errorMessage: r.errorMessage })),
        columnMapping,
        [...VALID_FIELDS],
      );
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="baris-gagal-${sanitizeFilenamePart(batch.fileName.replace(/\.xlsx?$/i, ""))}.xlsx"`,
        },
      });
    },
    {
      permission: "import.create",
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .post(
    "/finished-good-slip/import/:batchId/retry",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }

      const [pendingRowCount] = await db
        .select({ pendingCount: count() })
        .from(importBatchRows)
        .where(and(eq(importBatchRows.batchId, batch.id), inArray(importBatchRows.status, ["pending", "failed"])));
      // § Fase 142 — koneksi Accurate WAJIB sudah punya scope modul ini (pesan jelas SEBELUM job dijadwalkan).
      const scopeCheck = await checkSubscriptionScopes(subscription.id, "finished_good_slip");
      if (!scopeCheck.ok) {
        set.status = 409;
        return { code: "ACCURATE_SCOPE_MISSING", missing: scopeCheck.missing };
      }

      const budgetCheck = await checkTrialRowBudget(subscription.id, pendingRowCount?.pendingCount ?? 0);
      if (!budgetCheck.ok) {
        set.status = 400;
        return { code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: budgetCheck.remaining, max: budgetCheck.max };
      }

      await db.update(importBatches).set({ status: "processing", completedAt: null }).where(eq(importBatches.id, batch.id));
      await boss.send(JOBS.IMPORT_TO_ACCURATE, { batchId: batch.id });
      return { batchId: batch.id, status: "processing" };
    },
    {
      permission: "import.create",
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .put(
    "/finished-good-slip/import/:batchId/rows/:rowId",
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
      const missing = finishedGoodSlipRowError(body.rawData, columnMapping);
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_VALUES", fields: missing };
      }

      await db.update(importBatchRows).set({ rawData: body.rawData, status: "pending", errorMessage: null }).where(eq(importBatchRows.id, row.id));

      return { rowId: row.id, status: "pending" };
    },
    {
      permission: "import.create",
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }), rowId: t.String({ format: "uuid" }) }),
      body: t.Object({ rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) }),
    },
  )
  .put(
    "/finished-good-slip/import/:batchId/rows",
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

        const missing = finishedGoodSlipRowError(item.rawData, columnMapping);
        if (missing.length > 0) {
          errors.push({ rowId: item.id, rowNumber: row.rowNumber, fields: missing });
          continue;
        }

        await db.update(importBatchRows).set({ rawData: item.rawData, status: "pending", errorMessage: null }).where(eq(importBatchRows.id, row.id));
        updated.push(row.id);
      }

      return { updated, errors };
    },
    {
      permission: "import.create",
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({
        rows: t.Array(t.Object({ id: t.String({ format: "uuid" }), rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) })),
      }),
    },
  )
  .delete(
    "/finished-good-slip/import/:batchId",
    async ({ params, user, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }
      if (!(await ownsDataUsaha(user.id, subscription.dataUsahaId))) {
        set.status = 403;
        return { code: "DELETE_OWNER_ONLY" };
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
      moduleAccess: "finished_good_slip",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  );
