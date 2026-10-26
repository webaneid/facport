import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { auditLogs } from "../db/schema";

// § hasil Batal Import TERAKHIR (worker CANCEL_IMPORT menulis `deleted`/`blocked`/`failed`/`failedReasons` ke
// audit_logs) — dipakai endpoint detail batch SEMUA modul yang punya Batal Import, supaya halaman detail bisa
// menjelaskan kenapa sebagian dokumen tidak terhapus (mis. sudah dibayar). Cuma dibaca untuk batch
// `cancelled_partial`. Filter key `deleted` supaya tidak ketukar dengan audit tombol Hapus riwayat (action sama,
// bentuk `changes` beda). Batch lama tanpa `failedReasons` tetap terbaca (field itu opsional).
export type CancelResult = {
  deleted: string[];
  blocked: string[];
  failed: string[];
  failedReasons?: Record<string, string>;
};

export async function getCancelResult(batch: { id: string; status: string }): Promise<CancelResult | null> {
  if (batch.status !== "cancelled_partial") return null;
  const [log] = await db
    .select({ changes: auditLogs.changes })
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, "import_batch"), eq(auditLogs.entityId, batch.id), eq(auditLogs.action, "delete"), sql`${auditLogs.changes} ? 'deleted'`))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  return (log?.changes ?? null) as CancelResult | null;
}
