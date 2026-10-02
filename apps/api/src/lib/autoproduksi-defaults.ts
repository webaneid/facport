import { eq } from "drizzle-orm";
import { db } from "./db";
import { autoproduksiDefaults } from "../db/schema";
import type { ContextDefaults } from "./autoproduksi";

// § diminta client 2026-10-03 — pemuat default konteks produksi per subscription (§ `applyContextDefaults`,
// lib/autoproduksi.ts, murni tanpa DB). `null` = belum pernah diatur.
export async function loadAutoproduksiDefaults(subscriptionId: string): Promise<ContextDefaults | null> {
  const [row] = await db.select().from(autoproduksiDefaults).where(eq(autoproduksiDefaults.subscriptionId, subscriptionId));
  if (!row) return null;
  return { branchName: row.branchName, warehouseName: row.warehouseName, rawMaterialWarehouseName: row.rawMaterialWarehouseName };
}
