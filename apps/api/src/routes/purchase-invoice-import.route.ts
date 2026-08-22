import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { importBatches, importBatchRows } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { subscriptionGatePlugin } from "../lib/subscription-gate";
import { parseExcelBuffer, generateTemplateBuffer } from "../lib/excel";
import {
  purchaseInvoiceMapping,
  vendorAutoCreateMapping,
  itemAutoCreateMapping,
  type PurchaseInvoiceField,
} from "../lib/import-mapping/purchase-invoice.mapping";
import { boss, JOBS } from "../lib/queue";

// § architecture-security.md §8 — validasi tipe + ukuran di schema layer,
// SEBELUM body di-buffer penuh (pola sama media.route.ts).
const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls lama — paket `xlsx` bisa baca dua-duanya
] as const;
const MAX_SIZE_MB = 10;
// § security review Fase 02 (Medium) — batas ukuran file cuma cegah upload
// TERKOMPRESI besar; .xlsx adalah arsip ZIP, rasio dekompresi tinggi bisa
// bikin hasil parse jauh lebih besar dari ukuran file. Batas baris eksplisit
// ini pertahanan lapis kedua, independen dari MAX_SIZE_MB.
const MAX_ROWS = 5000;

// § phase-05-purchase-invoice-auto-create.md — kolom mapping gabungan:
// field transaksi (wajib, purchaseInvoiceMapping) + field OPSIONAL untuk
// auto-create vendor/item kalau belum ada di Accurate.
const ALL_DEFAULT_COLUMN_MAPS: Record<string, string>[] = [
  purchaseInvoiceMapping.defaultColumnMap,
  vendorAutoCreateMapping.defaultColumnMap,
  itemAutoCreateMapping.defaultColumnMap,
];
const VALID_FIELDS = new Set([
  ...Object.keys(purchaseInvoiceMapping.fieldToAccuratePath),
  ...Object.keys(vendorAutoCreateMapping.fieldToAccuratePath),
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

// § architecture-auth.md "Dua Lapis Gate" — permission (role customer boleh
// import) + moduleAccess (paket langganan aktif & termasuk modul ini).
export const purchaseInvoiceImportRoute = new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .get(
    "/purchase-invoice/import/template",
    () => {
      const buffer = generateTemplateBuffer(ALL_DEFAULT_COLUMN_MAPS.flatMap((map) => Object.keys(map)));
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="template-purchase-invoice.xlsx"',
        },
      });
    },
    { permission: "import.create", moduleAccess: "pembelian" },
  )
  .get(
    "/purchase-invoice/import",
    async ({ subscription, query }) => {
      const limit = query.limit ?? 10;
      const batches = await db
        .select()
        .from(importBatches)
        .where(and(eq(importBatches.subscriptionId, subscription.id), eq(importBatches.module, "purchase_invoice")))
        .orderBy(desc(importBatches.createdAt))
        .limit(limit);
      return { batches };
    },
    {
      permission: "import.create",
      moduleAccess: "pembelian",
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })) }),
    },
  )
  .post(
    "/purchase-invoice/import/upload",
    async ({ body, user, subscription, set }) => {
      const buffer = Buffer.from(await body.file.arrayBuffer());

      // § security review Fase 02 (Medium) — t.File() cuma cek Content-Type
      // yang diklaim client + ukuran, bukan validasi struktur file
      // sungguhan (pola sama media.route.ts yang validasi via sharp
      // metadata). File yang bukan XLSX/XLS valid (atau corrupt) WAJIB
      // ditolak 400 di sini, bukan lolos ke onError generik 500.
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
          module: "purchase_invoice",
          fileName: body.file.name.slice(0, 255), // kolom varchar(255), nama file client-controlled
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
      moduleAccess: "pembelian",
      body: t.Object({ file: t.File({ type: [...ALLOWED_MIME], maxSize: `${MAX_SIZE_MB}m` }) }),
    },
  )
  .post(
    "/purchase-invoice/import/:batchId/confirm",
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

      // § security review Fase 02 (Low) — value columnMapping cuma dicek
      // via type assertion di buildPurchaseInvoicePayload (bukan runtime
      // check) — field asing memang cuma diabaikan diam-diam (bukan
      // prototype pollution, sudah diverifikasi), tapi tetap WAJIB ditolak
      // eksplisit di layer API (defense-in-depth), bukan silent-ignore.
      const invalidFields = Object.values(body.columnMapping).filter((f) => !VALID_FIELDS.has(f));
      if (invalidFields.length > 0) {
        set.status = 400;
        return { code: "INVALID_MAPPING_FIELD", fields: invalidFields };
      }

      const mappedFields = new Set(Object.values(body.columnMapping) as PurchaseInvoiceField[]);
      const missing = purchaseInvoiceMapping.requiredFields.filter((f) => !mappedFields.has(f));
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
      moduleAccess: "pembelian",
      params: t.Object({ batchId: t.String({ format: "uuid" }) }),
      body: t.Object({ columnMapping: t.Record(t.String(), t.String()) }),
    },
  )
  .get(
    "/purchase-invoice/import/:batchId",
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
    { permission: "import.create", moduleAccess: "pembelian", params: t.Object({ batchId: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/purchase-invoice/import/:batchId/retry",
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
    { permission: "import.create", moduleAccess: "pembelian", params: t.Object({ batchId: t.String({ format: "uuid" }) }) },
  );
