import { eq, inArray, and } from "drizzle-orm";
import { db } from "./db";
import { importBatches, importBatchRows, subscriptions, autoproduksiFormulas, autoproduksiFormulaItems } from "../db/schema";
import { allocateFormulaNumber } from "./formula-number";
import {
  autoproduksiFormulaRowError,
  groupAutoproduksiFormulaRows,
  validateAutoproduksiFormulaGroup,
  buildAutoproduksiFormulaRecord,
  type ImportRowRecord,
} from "./import-mapping/autoproduksi-formula.mapping";

// § Fase 186 — inti Import Formula (dipindah dari route supaya dijalankan JOB, bukan permintaan HTTP). Idempotensi: baris sukses tidak pernah diproses ulang; penandaan
// "sukses" baris-baris sebuah grup terjadi di TRANSAKSI YANG SAMA dengan insert Formula-nya — crash di tengah tidak mungkin meninggalkan Formula tersimpan dengan baris
// masih "pending" (yang akan membuat Formula ganda saat diproses ulang). Duplikat Nama Resep/Formula DIBOLEHKAN (tiap grup valid = Formula BARU, berbeda nomor).
export async function processFormulaBatchRows(
  batch: { id: string; userId: string; subscriptionId: string },
  dataUsahaId: string,
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
        const formulaNumber = await allocateFormulaNumber(tx, dataUsahaId);
        const [inserted] = await tx
          .insert(autoproduksiFormulas)
          .values({
            userId: batch.userId,
            dataUsahaId,
            subscriptionId: batch.subscriptionId,
            formulaNumber,
            name: record.name,
            finishedGoodItemNo: record.finishedGoodItemNo,
            finishedGoodItemUnitName: record.finishedGoodItemUnitName,
            finishedGoodItemName: record.finishedGoodItemName,
            standardCost: record.standardCost,
            adjustmentAccountNo: record.adjustmentAccountNo,
          })
          .returning();
        await tx.insert(autoproduksiFormulaItems).values(
          record.items.map((item, index) => ({
            formulaId: inserted!.id,
            itemNo: item.itemNo,
            itemUnitName: item.itemUnitName,
            itemName: item.itemName,
            quantity: item.quantity,
            sortOrder: index,
          })),
        );
        await tx.update(importBatchRows).set({ status: "success", errorMessage: null, processedAt: new Date() }).where(inArray(importBatchRows.id, rowIds));
      });
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

/** Isi job `IMPORT_AUTOPRODUKSI_FORMULA`: proses baris pending/failed batch (confirm = semua pending; retry = pending + failed). */
export async function runFormulaImportJob(batchId: string): Promise<void> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) return; // batch dihapus sebelum job jalan
  try {
    const [subscription] = await db.select({ dataUsahaId: subscriptions.dataUsahaId }).from(subscriptions).where(eq(subscriptions.id, batch.subscriptionId));
    if (!subscription) throw new Error("Langganan tidak ditemukan.");
    const rows = await db
      .select()
      .from(importBatchRows)
      .where(and(eq(importBatchRows.batchId, batch.id), inArray(importBatchRows.status, ["pending", "failed"])));
    await processFormulaBatchRows(
      batch,
      subscription.dataUsahaId,
      rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData as Record<string, unknown> })),
      (batch.columnMapping ?? {}) as Record<string, string>,
    );
  } catch (err) {
    // galat tak terduga (bukan per-grup): jangan biarkan batch menggantung "processing"
    await db
      .update(importBatchRows)
      .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), processedAt: new Date() })
      .where(and(eq(importBatchRows.batchId, batch.id), eq(importBatchRows.status, "pending")));
    await db.update(importBatches).set({ status: "completed_with_errors", completedAt: new Date() }).where(eq(importBatches.id, batch.id));
    throw err;
  }
}
