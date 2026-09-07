"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { moduleLabel, type ModuleKey } from "@/lib/module-options";
import { currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { useGroupedPlans } from "@/lib/use-grouped-plans";
import { LANDING_MODULE_ICON, LANDING_MODULE_TAGLINE } from "@/lib/landing-content";

type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean; trialEligible: boolean };

// § Fase 17 — cart halaman dashboard (sudah login). Reuse endpoint yang
// SUDAH ADA sejak Fase 16 (`POST /subscriptions/checkout`) — halaman ini
// MURNI UI pemilihan sub-modul + panggil checkout, TIDAK ada logic
// pembayaran di sini (itu di `/billing/[orderId]/pay`, sudah lengkap).
export default function SubscribePage() {
  return (
    // useSearchParams() WAJIB di-Suspense-boundary (pola sama login-form.tsx)
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SubscribePageInner />
    </Suspense>
  );
}

function SubscribePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  // § Fase 43 — dulu cuma Set modul aktif (boolean). Sekarang map modul ->
  // apakah subscription aktifnya TRIAL (bukan paket asli) — dipakai
  // membedakan badge "Sudah Berlangganan" vs "Sedang Trial", dan trial
  // TETAP boleh diklik pilih ke cart untuk upgrade (§ isModuleBlocked).
  const [activeModuleMap, setActiveModuleMap] = useState<Map<string, boolean>>(new Map());
  const [everTrialedModules, setEverTrialedModules] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  const [tryingPlanId, setTryingPlanId] = useState<string | null>(null);

  // § Fase 53 — 1 modul boleh punya >1 tier (Bulanan/Tahunan dst), 1
  // kartu = 1 grup modul (bukan 1 kartu = 1 baris plan lagi). Grouping
  // shared sama landing (`module-features.tsx`) via `useGroupedPlans`.
  const { groups, isModuleSelected, isTierActive, activePlanFor, toggleModule, selectTier, setSelectedModules, selectedPlans } = useGroupedPlans(
    plans ?? [],
  );

  async function load() {
    const [plansRes, subsRes] = await Promise.all([api.plans.get(), api.me.subscriptions.get()]);
    const allPlans = (plansRes.data as unknown as Plan[] | undefined) ?? [];
    setPlans(allPlans);

    const subsData = subsRes.data as unknown as
      | { subscriptions: { subscription: { isTrial: boolean }; plan: { modules: string[] } }[]; everTrialedModules: string[] }
      | undefined;
    const subs = subsData?.subscriptions ?? [];
    const moduleMap = new Map<string, boolean>();
    for (const s of subs) {
      for (const m of s.plan.modules) moduleMap.set(m, s.subscription.isTrial);
    }
    setActiveModuleMap(moduleMap);
    setEverTrialedModules(new Set(subsData?.everTrialedModules ?? []));
    return { allPlans, moduleMap };
  }

  useEffect(() => {
    async function init() {
      const { allPlans, moduleMap } = await load();

      // § pre-select dari query `?plans=` (dibawa dari landing, lewat
      // redirect login) — cuma plan yang BENAR ada & modulnya BELUM aktif
      // (trial aktif TETAP boleh di-preselect, ini jalur upgrade). Tier
      // yang di-preselect landing WAJIB jadi tier aktif juga di sini
      // (bukan cuma modulnya ke-toggle, tier bisa salah kalau tidak
      // eksplisit di-set — default hook cuma tiers[0]).
      const preselect = searchParams.get("plans")?.split(",").filter(Boolean) ?? [];
      if (preselect.length > 0) {
        const validPlans = allPlans.filter((p) => preselect.includes(p.id) && !p.modules.some((m) => moduleMap.has(m) && !moduleMap.get(m)));
        const moduleKeys = new Set<string>();
        for (const p of validPlans) {
          const moduleKey = p.modules[0];
          if (!moduleKey) continue;
          moduleKeys.add(moduleKey);
          selectTier(moduleKey, p.id);
        }
        setSelectedModules(moduleKeys);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartTrial(e: React.MouseEvent, plan: Plan) {
    e.stopPropagation();
    setTryingPlanId(plan.id);
    const res = await api.subscriptions.trial.post({ planId: plan.id });
    setTryingPlanId(null);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(
        code === "TRIAL_ALREADY_USED"
          ? "Trial untuk sub-modul ini sudah pernah dipakai."
          : code === "MODULE_ALREADY_SUBSCRIBED"
            ? "Sub-modul ini sudah aktif."
            : "Gagal memulai trial. Coba lagi.",
      );
      return;
    }
    toast.success(`Trial "${plan.name}" aktif! Kamu bisa langsung mulai import.`);
    load();
  }

  const total = useMemo(() => selectedPlans.reduce((sum, p) => sum + p.price, 0), [selectedPlans]);

  async function handleCheckout() {
    if (selectedPlans.length === 0) return;
    setCheckingOut(true);
    const res = await api.subscriptions.checkout.post({ planIds: selectedPlans.map((p) => p.id) });
    setCheckingOut(false);
    if (res.error) {
      const code = (res.error.value as { code?: string; moduleKey?: string } | undefined)?.code;
      toast.error(
        code === "MODULE_ALREADY_SUBSCRIBED"
          ? "Salah satu sub-modul yang dipilih sudah kamu langgan atau masih menunggu pembayaran."
          : code === "PLAN_NOT_ACTIVE"
            ? "Salah satu paket sudah tidak tersedia."
            : "Gagal membuat pesanan. Coba lagi.",
      );
      return;
    }
    const data = res.data as { orderId: string };
    router.push(`/billing/${data.orderId}/pay`);
  }

  if (!plans) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Berlangganan</h1>
        <p className="text-sm text-muted-foreground">Pilih sub-modul yang kamu butuhkan — bisa lebih dari satu sekaligus.</p>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={Package} title="Belum ada paket tersedia" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groups.map((group) => {
              // § Fase 43 — "aktif" sekarang punya 2 rasa: paket ASLI
              // (blokir card, sama perilaku lama) vs trial (card TETAP
              // bisa diklik pilih ke cart, ini jalur upgrade).
              const isRealActive = activeModuleMap.get(group.moduleKey) === false;
              const isTrialActive = activeModuleMap.get(group.moduleKey) === true;
              const hasEverTrialed = everTrialedModules.has(group.moduleKey);
              const isSelected = isModuleSelected(group.moduleKey);
              const activePlan = activePlanFor(group);
              // § Fase 43 (koreksi) — tombol "Coba Gratis" cuma tampil
              // untuk TIER YANG SEDANG DIPILIH kalau admin tandai eksplisit
              // boleh ditrial (`trialEligible`) — kalau admin cuma nyalakan
              // di 1 tier, tombol otomatis hilang/muncul ikut pill aktif.
              const showTrialButton = activePlan?.trialEligible && !isRealActive && !isTrialActive && !hasEverTrialed;
              const moduleKey = group.moduleKey as ModuleKey;
              const Icon = LANDING_MODULE_ICON[moduleKey];
              const tagline = LANDING_MODULE_TAGLINE[moduleKey];
              return (
                // § Fase 53 (revisi UX) — kartu TIDAK lagi diklik langsung
                // (dulu whole-card-click toggle cart, ambigu begitu ada 2
                // aksi berbeda: "Berlangganan" vs "Coba Gratis"). SEMUA
                // aksi sekarang eksplisit lewat pill berlabel "Paket:".
                <div
                  key={group.moduleKey}
                  className={`rounded-xl border p-5 transition-colors ${isRealActive ? "opacity-50" : ""} ${
                    isSelected ? "border-primary-600 bg-primary-50" : "border-border/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {Icon && (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                      )}
                      <h3 className="font-medium text-foreground">{moduleLabel(group.moduleKey)}</h3>
                    </div>
                    {isRealActive && <Badge variant="success">Sudah Berlangganan</Badge>}
                    {isTrialActive && <Badge variant="warning">Sedang Trial</Badge>}
                  </div>
                  {tagline && <p className="mt-2 text-xs text-muted-foreground">{tagline}</p>}

                  {activePlan && (
                    <p className="mt-3 text-2xl font-semibold text-foreground">
                      {currencyFormatter.format(activePlan.price)}
                      <span className="text-sm font-normal text-muted-foreground"> / {formatDuration(activePlan.durationDays)}</span>
                    </p>
                  )}

                  {/* § border pemisah — pisahkan info (nama/deskripsi/harga) dari area pilihan interaktif di bawahnya */}
                  <div className="mt-4 border-t border-border" />

                  {group.tiers.length > 1 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pilih Periode</span>
                      <div className="flex gap-1.5">
                        {group.tiers.map((tier) => (
                          <button
                            key={tier.id}
                            type="button"
                            disabled={isRealActive}
                            onClick={() => selectTier(group.moduleKey, tier.id)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                              isTierActive(group, tier.id)
                                ? "border-primary-600 bg-primary-600 text-white"
                                : "border-border text-muted-foreground hover:border-primary-300"
                            }`}
                          >
                            {formatDuration(tier.durationDays)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* § ditemukan 2026-09-07 (feedback user) — trial itu OPSIONAL,
                     TIDAK boleh blokir upgrade ke paket asli. Sebelumnya
                     section ini ikut disembunyikan kalau `isTrialActive`,
                     bikin user yang lagi trial TIDAK BISA klik
                     "Berlangganan" sama sekali (harus nunggu trial habis
                     dulu) — salah, bukan itu maksud trial. `showTrialButton`
                     di bawah TETAP correctly exclude "Coba Gratis" saat
                     trial aktif (tidak masuk akal re-trial modul yang sama). */}
                  {!isRealActive && activePlan && (
                    <div className="mt-4 flex flex-col gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pilih Paket</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleModule(group.moduleKey)}
                          className={`flex items-center gap-1.5 rounded-[3px] border border-primary-600 px-3 py-1.5 text-xs font-medium transition-colors ${
                            isSelected ? "bg-primary-600 text-white" : "text-primary-700 hover:bg-primary-50"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                          Berlangganan
                        </button>
                        {showTrialButton && (
                          <button
                            type="button"
                            disabled={tryingPlanId === activePlan.id}
                            onClick={(e) => handleStartTrial(e, activePlan)}
                            className="rounded-[3px] border border-primary-600 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {tryingPlanId === activePlan.id ? "Memproses..." : "Coba Gratis"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {!isRealActive && !isTrialActive && !showTrialButton && hasEverTrialed && (
                    <p className="mt-2 text-xs text-muted-foreground">Trial sudah pernah dipakai</p>
                  )}
                </div>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ringkasan Pesanan</CardTitle>
              <CardDescription>Invoice dibuat setelah checkout — kamu pilih metode bayar (transfer bank/QRIS) di langkah berikutnya.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selectedPlans.length === 0 ? (
                <p className="text-sm text-muted-foreground">Pilih sub-modul di atas untuk melanjutkan.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedPlans.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {moduleLabel(p.modules[0] ?? "")} <span className="text-muted-foreground">({formatDuration(p.durationDays)})</span>
                      </span>
                      <span className="text-muted-foreground">{currencyFormatter.format(p.price)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                    <span>Total</span>
                    <span>{currencyFormatter.format(total)}</span>
                  </div>
                </div>
              )}
              <Button onClick={handleCheckout} disabled={selectedPlans.length === 0 || checkingOut} className="w-full">
                {checkingOut ? "Memproses..." : "Checkout"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
