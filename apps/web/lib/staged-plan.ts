// § Fase 205, ADR-0051 — tampilan rencana kirim bertahap (popup persetujuan). Bentuk data = respons `409 STAGED_APPROVAL_REQUIRED` dari backend `confirm`.
export type StagedPlanItemView = { number: string; rows: number; entries: number; steps: number; estimatedSeconds: number };
export type StagedPlanView = { items: StagedPlanItemView[]; estimatedSeconds: number; chunkEntries: number; thresholdRows: number; skippedForTax?: string[]; skippedTooLarge?: { number: string; rows: number; estimatedSeconds: number }[] };

/** "sekitar 30 detik" / "sekitar 10 menit" / "sekitar 3,5 jam" — perkiraan kasar, bukan janji. */
export function formatStagedEstimate(seconds: number): string {
  if (seconds < 90) return `sekitar ${Math.max(1, Math.round(seconds))} detik`;
  const minutes = seconds / 60;
  if (minutes < 90) return `sekitar ${Math.round(minutes)} menit`;
  const hours = minutes / 60;
  return `sekitar ${hours < 10 ? hours.toFixed(1).replace(".", ",") : Math.round(hours)} jam`;
}

/** Ambil rencana dari nilai error `confirm`; null bila bukan permintaan persetujuan. */
export function extractStagedPlan(value: unknown): StagedPlanView | null {
  const v = value as { code?: string; plan?: StagedPlanView } | undefined;
  if (v?.code !== "STAGED_APPROVAL_REQUIRED" || !v.plan || !Array.isArray(v.plan.items) || v.plan.items.length === 0) return null;
  return v.plan;
}
