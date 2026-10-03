// § diminta user 2026-10-03 — saat admin meng-assign paket baru, paket/modul yang SUDAH aktif di Data Usaha tujuan tidak
// perlu muncul lagi (khawatir dobel; server juga membatalkan langganan aktif lama untuk modul yang sama di Data Usaha itu,
// § admin/subscriptions.route.ts, jadi assign ulang modul yang sama bukan "tambah" melainkan "ganti" — memperpanjang masa
// aktif dilakukan lewat edit tanggal di detail user). Paket tanpa modul (User Tambahan/seat add-on) SELALU tersedia: boleh
// dibeli berulang.
type PlanLike = { id: string; modules: string[] };
type SubLike = { status: string; moduleKey: string | null; dataUsahaId: string };

export function plansAvailableForDataUsaha<P extends PlanLike>(plans: P[], subs: SubLike[], dataUsahaId: string): { available: P[]; hidden: P[] } {
  if (!dataUsahaId) return { available: plans, hidden: [] };
  const activeModules = new Set(subs.filter((s) => s.status === "active" && s.dataUsahaId === dataUsahaId && s.moduleKey).map((s) => s.moduleKey!));
  const hidden = plans.filter((p) => p.modules[0] !== undefined && activeModules.has(p.modules[0]));
  return { available: plans.filter((p) => !hidden.includes(p)), hidden };
}
