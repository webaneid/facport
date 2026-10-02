import { Elysia, t } from "elysia";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { importBatches, importBatchRows, auditLogs, autoproduksiFormulas, autoproduksiFormulaItems } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { ownsDataUsaha } from "../lib/data-usaha";
import { parseExcelBuffer, generateTemplateBuffer, generateFailedRowsBuffer, sanitizeFilenamePart } from "../lib/excel";
import {
  autoproduksiFormulaMapping,
  autoproduksiFormulaRowError,
  groupAutoproduksiFormulaRows,
  validateAutoproduksiFormulaGroup,
  buildAutoproduksiFormulaRecord,
  type ImportRowRecord,
} from "../lib/import-mapping/autoproduksi-formula.mapping";
import { autoproduksiFormulaTemplateGuide } from "../lib/import-mapping/template-guide";
import { checkTrialRowBudget } from "../lib/trial";

const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls lama
] as const;
const MAX_SIZE_MB = 10;
const MAX_ROWS = 10000;

const VALID_FIELDS = new Set(Object.keys(autoproduksiFormulaMapping.fieldToAccuratePath));

function suggestMapping(excelColumns: string[]): Record<string, string> {
  const suggestion: Record<string, string> = {};
  for (const col of excelColumns) {
    const normalized = col.trim().toLowerCase();
    const match = Object.keys(autoproduksiFormulaMapping.defaultColumnMap).find((defaultCol) => defaultCol.toLowerCase() === normalized);
    if (match) suggestion[col] = autoproduksiFormulaMapping.defaultColumnMap[match]!;
  }
  return suggestion;
}

// § architecture-autoproduksi.md — Import Formula (Excel). SATU-SATUNYA
// modul import di Facport yang diproses SYNCHRONOUS (bukan job pg-boss) —
// Formula adalah data LOKAL murni (TIDAK PERNAH memanggil Accurate, §
// komentar `autoproduksi-formula.mapping.ts`), jadi tidak ada alasan
// menahan user menunggu job queue untuk sesuatu yang selesai dalam
// hitungan milidetik. `import_batches.status` langsung
// `completed`/`completed_with_errors` begitu confirm/retry selesai —
// TIDAK PERNAH singgah di `processing`. TIDAK ADA endpoint cancel (tidak
// ada transaksi Accurate untuk dibatalkan — Formula yang sudah dibuat
// batch ini TETAP ADA walau riwayat batch-nya di-"Delete", sama filosofi
// Delete modul lain: cuma hapus riwayat lokal, tidak pernah mundurkan
// efek yang sudah terjadi).
//
// § Duplikat Nama Resep/Formula DIBOLEHKAN (keputusan eksplisit user) —
// setiap grup yang valid SELALU insert Formula BARU. Konsekuensi: retry
// HANYA boleh memproses ULANG baris yang masih pending/failed (grouping
// dihitung ulang dari situ) — grup yang SUDAH sukses TIDAK PERNAH
// diproses lagi (insert sekali per grup, bukan per retry call), supaya
// retry tidak diam-diam membuat Formula duplikat tambahan.
async function processFormulaBatchRows(
  batch: { id: string; userId: string; subscriptionId: string; dataUsahaId?: string },
  subscriptionDataUsahaId: string,
  rowsToProcess: ImportRowRecord[],
  columnMapping: Record<string, string>,
): Promise<void> {
  const groups = groupAutoproduksiFormulaRows(rowsToProcess, columnMapping);

  for (const group of groups) {
    const rowIds = group.rows.map((r) => r.id);
    try {
      const rowErrors = group.rows.flatMap((r) => autoproduksiFormulaRowError(r.rawData, columnMapping).map((f) => `${f} (baris ${r.id})`));
      if (rowErrors.length > 0) throw new Error(`Kolom tidak lengkap/valid: ${rowErrors.join(", ")}.`);

      const groupError = validateAutoproduksiFormulaGroup(group, columnMapping);
      if (groupError) throw new Error(groupError);

      const record = buildAutoproduksiFormulaRecord(group, columnMapping);

      await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(autoproduksiFormulas)
          .values({
            userId: batch.userId,
            dataUsahaId: subscriptionDataUsahaId,
            subscriptionId: batch.subscriptionId,
            name: record.name,
            finishedGoodItemNo: record.finishedGoodItemNo,
            finishedGoodItemUnitName: record.finishedGoodItemUnitName,
            finishedGoodItemName: record.finishedGoodItemName,
            standardCost: record.standardCost,
            adjustmentAccountNo: record.adjustmentAccountNo,
            branchName: record.branchName,
            warehouseName: record.warehouseName,
            finishedGoodProjectNo: record.finishedGoodProjectNo,
            finishedGoodDepartmentName: record.finishedGoodDepartmentName,
          })
          .returning();
        await tx.insert(autoproduksiFormulaItems).values(
          record.items.map((item, index) => ({
            formulaId: inserted!.id,
            itemNo: item.itemNo,
            itemUnitName: item.itemUnitName,
            itemName: item.itemName,
            quantity: item.quantity,
            warehouseName: item.warehouseName,
            projectNo: item.projectNo,
            departmentName: item.departmentName,
            sortOrder: index,
          })),
        );
      });

      await db
        .update(importBatchRows)
        .set({ status: "success", errorMessage: null, processedAt: new Date() })
        .where(inArray(importBatchRows.id, rowIds));
    } catch (err) {
      await db
        .update(importBatchRows)
        .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), processedAt: new Date() })
        .where(inArray(importBatchRows.id, rowIds));
    }
  }

  const finalRows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
  const hasFailed = finalRows.some((r) => r.status === "failed");
  await db
    .update(importBatches)
    .set({ status: hasFailed ? "completed_with_errors" : "completed", completedAt: new Date() })
    .where(eq(importBatches.id, batch.id));
}

export const autoproduksiFormulaImportRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/autoproduksi/import-formula/template",
    () => {
      const buffer = generateTemplateBuffer(autoproduksiFormulaTemplateGuide);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="template-autoproduksi-formula.xlsx"',
        },
      });
    },
    { permission: "import.create", moduleAccess: "autoproduksi_production" },
  )
  .get(
    "/autoproduksi/import-formula",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = and(eq(importBatches.subscriptionId, subscription.id), eq(importBatches.module, "autoproduksi_formula"));
      const [batches, totalRows] = await Promise.all([
        db.select().from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(importBatches).where(where),
      ]);
      return { batches, total: totalRows[0]?.total ?? 0 };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/autoproduksi/import-formula/upload",
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
          module: "autoproduksi_formula",
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
      moduleAccess: "autoproduksi_production",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  )
  .post(
    "/autoproduksi/import-formula/:batchId/confirm",
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
      const missing = autoproduksiFormulaMapping.requiredFields.filter((f) => !mappedFields.has(f));
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_FIELDS", fields: missing };
      }

      // § Formula TIDAK memanggil Accurate — tidak ada checkSubscriptionScopes di sini (berbeda dari 24 modul lain).
      const budgetCheck = await checkTrialRowBudget(subscription.id, batch.totalRows);
      if (!budgetCheck.ok) {
        set.status = 400;
        return { code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: budgetCheck.remaining, max: budgetCheck.max };
      }

      await db.update(importBatches).set({ columnMapping: body.columnMapping }).where(eq(importBatches.id, batch.id));

      const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
      await processFormulaBatchRows(
        batch,
        subscription.dataUsahaId,
        rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        body.columnMapping,
      );

      const [finalBatch] = await db.select().from(importBatches).where(eq(importBatches.id, batch.id));
      return { batchId: batch.id, status: finalBatch!.status };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({ columnMapping: t.Record(t.String(), t.String()) }),
    },
  )
  .get(
    "/autoproduksi/import-formula/:batchId",
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
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .get(
    "/autoproduksi/import-formula/:batchId/failed-rows/export",
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
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .post(
    "/autoproduksi/import-formula/:batchId/retry",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
      }

      const pendingOrFailed = await db
        .select()
        .from(importBatchRows)
        .where(and(eq(importBatchRows.batchId, batch.id), inArray(importBatchRows.status, ["pending", "failed"])));

      const budgetCheck = await checkTrialRowBudget(subscription.id, pendingOrFailed.length);
      if (!budgetCheck.ok) {
        set.status = 400;
        return { code: "TRIAL_ROW_LIMIT_EXCEEDED", remaining: budgetCheck.remaining, max: budgetCheck.max };
      }

      const columnMapping = (batch.columnMapping ?? {}) as Record<string, string>;
      await processFormulaBatchRows(
        batch,
        subscription.dataUsahaId,
        pendingOrFailed.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
        columnMapping,
      );

      const [finalBatch] = await db.select().from(importBatches).where(eq(importBatches.id, batch.id));
      return { batchId: batch.id, status: finalBatch!.status };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .put(
    "/autoproduksi/import-formula/:batchId/rows/:rowId",
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
      const missing = autoproduksiFormulaRowError(body.rawData, columnMapping);
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_VALUES", fields: missing };
      }

      await db.update(importBatchRows).set({ rawData: body.rawData, status: "pending", errorMessage: null }).where(eq(importBatchRows.id, row.id));

      return { rowId: row.id, status: "pending" };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }), rowId: t.String({ format: "uuid" }) }),
      body: t.Object({ rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) }),
    },
  )
  .put(
    "/autoproduksi/import-formula/:batchId/rows",
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

        const missing = autoproduksiFormulaRowError(item.rawData, columnMapping);
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
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({
        rows: t.Array(t.Object({ id: t.String({ format: "uuid" }), rawData: t.Record(t.String(), t.Union([t.String(), t.Number()])) })),
      }),
    },
  )
  .delete(
    "/autoproduksi/import-formula/:batchId",
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
      // § TIDAK ADA status "processing"/"cancelling" untuk modul ini
      // (synchronous, § komentar atas file) — tidak perlu cek BATCH_BUSY.

      const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch.id));
      await db.insert(auditLogs).values({
        entityType: "import_batch",
        entityId: batch.id,
        action: "delete",
        changes: { fileName: batch.fileName, totalRows: batch.totalRows, status: batch.status, hadSuccess: rows.some((r) => r.status === "success") },
        actorId: user.id,
      });

      await db.delete(importBatches).where(eq(importBatches.id, batch.id));

      return { batchId: batch.id, deleted: true };
    },
    {
      permission: "import.create",
      moduleAccess: "autoproduksi_production",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  );
