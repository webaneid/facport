// § Fase 185 — fungsi murni untuk form Input Produksi (testable tanpa Next.js runtime).

/** Tanggal "hari ini" (YYYY-MM-DD) di ZONA PERUSAHAAN — bukan UTC: `toISOString()` memberi tanggal KEMARIN bagi produksi dini hari WIB (00.00–07.00). */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type RecentEntry = { formulaId: string; producedQty: string | number; transDate: string; status: string; createdAt: string };
const STATUS_LABEL: Record<string, string> = { pending: "menunggu", processing: "sedang diproses", success: "berhasil" };
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Peringatan (bukan blokir) bila entri SERUPA (formula + qty + tanggal) baru dikirim dan tidak gagal — null bila tidak ada. Entri gagal diabaikan (mengulang yang gagal itu wajar). */
export function duplicateWarning(entries: RecentEntry[], candidate: { formulaId: string; qty: number; transDate: string }, now: Date = new Date()): string | null {
  const hit = entries
    .filter((e) => e.status !== "failed" && e.formulaId === candidate.formulaId && Number(e.producedQty) === candidate.qty && e.transDate === candidate.transDate)
    .map((e) => ({ e, age: now.getTime() - new Date(e.createdAt).getTime() }))
    .filter(({ age }) => age >= 0 && age <= DUPLICATE_WINDOW_MS)
    .sort((a, b) => a.age - b.age)[0];
  if (!hit) return null;
  const minutes = Math.max(1, Math.round(hit.age / 60_000));
  return `Input serupa (formula, qty, dan tanggal sama) sudah dikirim ${minutes} menit lalu — status: ${STATUS_LABEL[hit.e.status] ?? hit.e.status}. Pastikan ini bukan klik ganda.`;
}
