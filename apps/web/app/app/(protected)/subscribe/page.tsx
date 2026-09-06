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
import { moduleLabel } from "@/lib/module-options";
import { currencyFormatter } from "@/lib/utils";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  const [tryingPlanId, setTryingPlanId] = useState<string | null>(null);

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
      // (trial aktif TETAP boleh di-preselect, ini jalur upgrade).
      const preselect = searchParams.get("plans")?.split(",").filter(Boolean) ?? [];
      if (preselect.length > 0) {
        const validIds = allPlans
          .filter((p) => preselect.includes(p.id) && !p.modules.some((m) => moduleMap.has(m) && !moduleMap.get(m)))
          .map((p) => p.id);
        setSelected(new Set(validIds));
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

  function toggle(planId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  const selectedPlans = useMemo(() => (plans ?? []).filter((p) => selected.has(p.id)), [plans, selected]);
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

      {plans.length === 0 ? (
        <EmptyState icon={Package} title="Belum ada paket tersedia" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {plans.map((plan) => {
              // § Fase 43 — "aktif" sekarang punya 2 rasa: paket ASLI
              // (blokir card, sama perilaku lama) vs trial (card TETAP
              // bisa diklik pilih ke cart, ini jalur upgrade).
              const isRealActive = plan.modules.some((m) => activeModuleMap.get(m) === false);
              const isTrialActive = plan.modules.some((m) => activeModuleMap.get(m) === true);
              const hasEverTrialed = plan.modules.some((m) => everTrialedModules.has(m));
              // § Fase 43 (koreksi) — tombol "Coba Gratis" cuma tampil
              // untuk paket yang admin TANDAI eksplisit boleh ditrial
              // (`plan.trialEligible`), BUKAN otomatis semua paket.
              const isSelected = selected.has(plan.id);
              const showTrialButton = plan.trialEligible && !isRealActive && !isTrialActive && !hasEverTrialed;
              return (
                // § dulu <button>, diganti <div role="button"> — "Coba
                // Gratis" di dalamnya butuh <button> sendiri (stopPropagation
                // dari toggle cart), dan <button> tidak boleh bersarang.
                <div
                  key={plan.id}
                  role="button"
                  tabIndex={isRealActive ? -1 : 0}
                  aria-disabled={isRealActive}
                  onClick={() => !isRealActive && toggle(plan.id)}
                  onKeyDown={(e) => {
                    if (!isRealActive && (e.key === "Enter" || e.key === " ")) toggle(plan.id);
                  }}
                  className={`rounded-xl border p-5 text-left transition-colors ${
                    isRealActive ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  } ${isSelected ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-border/60 hover:bg-muted/50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-foreground">{plan.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{plan.modules.map(moduleLabel).join(", ")}</p>
                    </div>
                    {isRealActive ? (
                      <Badge variant="success">Sudah Berlangganan</Badge>
                    ) : isTrialActive ? (
                      <Badge variant="warning">Sedang Trial</Badge>
                    ) : (
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected ? "border-primary-600 bg-primary-600" : "border-border"
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-foreground">
                    {currencyFormatter.format(plan.price)}
                    <span className="text-sm font-normal text-muted-foreground"> /{plan.durationDays} hari</span>
                  </p>
                  {showTrialButton ? (
                    <Button variant="outline" size="sm" className="mt-3" disabled={tryingPlanId === plan.id} onClick={(e) => handleStartTrial(e, plan)}>
                      {tryingPlanId === plan.id ? "Memproses..." : "Coba Gratis"}
                    </Button>
                  ) : (
                    !isRealActive &&
                    !isTrialActive &&
                    hasEverTrialed && <p className="mt-3 text-xs text-muted-foreground">Trial sudah pernah dipakai</p>
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
                      <span className="text-foreground">{p.name}</span>
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
