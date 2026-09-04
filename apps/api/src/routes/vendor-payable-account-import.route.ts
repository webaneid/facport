import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { importBatches, importBatchRows } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { parseExcelBuffer, generateTemplateBuffer } from "../lib/excel";
import { vendorPayableAccountMapping } from "../lib/import-mapping/vendor-payable-account.mapping";
import { vendorPayableAccountTemplateGuide } from "../lib/import-mapping/template-guide";
import { boss, JOBS } from "../lib/queue";

// § architecture-security.md §8, pola sama purchase-invoice-import.route.ts
const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls lama
] as const;
const MAX_SIZE_MB = 10;
const MAX_ROWS = 5000;

const VALID_FIELDS = new Set(Object.keys(vendorPayableAccountMapping.fieldToAccuratePath));

function suggestMapping(excelColumns: string[]): Record<string, string> {
  const suggestion: Record<string, string> = {};
  for (const col of excelColumns) {
    const normalized = col.trim().toLowerCase();
    const match = Object.keys(vendorPayableAccountMapping.defaultColumnMap).find(
      (defaultCol) => defaultCol.toLowerCase() === normalized,
    );
    if (match) suggestion[col] = vendorPayableAccountMapping.defaultColumnMap[match]!;
  }
  return suggestion;
}

// § architecture-accurate-integration.md § "Vendor (Data Master)" — import
// update Akun Hutang per Pemasok. Field `vendorPayableAccountListNo`
// bersifat OVERRIDE opsional (kosong = pakai default Mata Uang), TAPI
// TERVERIFIKASI beneran dipakai Accurate saat posting transaksi
// berikutnya (bukan kosmetik), § phase-04-import-vendor.md.
export const vendorPayableAccountImportRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/vendor/payable-account/import/template",
    () => {
      const buffer = generateTemplateBuffer(vendorPayableAccountTemplateGuide);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="template-akun-hutang-pemasok.xlsx"',
        },
      });
    },
    { permission: "import.create", moduleAccess: "purchase_invoice" },
  )
  .get(
    "/vendor/payable-account/import",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 10;
      const batches = await db
        .select()
        .from(importBatches)
        .where(
          and(eq(importBatches.subscriptionId, subscription.id), eq(importBatches.module, "vendor_payable_account")),
        )
        .orderBy(desc(importBatches.createdAt))
        .limit(limit);
      return { batches };
    },
    {
      permission: "import.create",
      moduleAccess: "purchase_invoice",
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })) }),
    },
  )
  .post(
    "/vendor/payable-account/import/upload",
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
          module: "vendor_payable_account",
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
      moduleAccess: "purchase_invoice",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  )
  .post(
    "/vendor/payable-account/import/:batchId/confirm",
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
      const missing = vendorPayableAccountMapping.requiredFields.filter((f) => !mappedFields.has(f));
      if (missing.length > 0) {
        set.status = 400;
        return { code: "MISSING_REQUIRED_FIELDS", fields: missing };
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
      moduleAccess: "purchase_invoice",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({ columnMapping: t.Record(t.String(), t.String()) }),
    },
  )
  .get(
    "/vendor/payable-account/import/:batchId",
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
      moduleAccess: "purchase_invoice",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  )
  .post(
    "/vendor/payable-account/import/:batchId/retry",
    async ({ params, subscription, set }) => {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, params.batchId));
      if (!batch || batch.subscriptionId !== subscription.id) {
        set.status = 404;
        return { code: "BATCH_NOT_FOUND" };
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
      moduleAccess: "purchase_invoice",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
    },
  );
