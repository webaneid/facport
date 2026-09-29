"use client";

import { createContext, Suspense, useContext, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { moduleProductLine } from "@/lib/module-options";
import { hasAnyRealActiveSubscription as hasAnyRealActiveSubscriptionFn } from "@/lib/subscribe-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupedPlans, type ModuleGroup } from "@/lib/use-grouped-plans";
import type { Plan, SubscriptionInfo } from "./module-pricing-panel";
import { CartBar } from "./cart-bar";

// § Fase 161 — SEMUA state+handler di bawah ini adalah PINDAHAN dari
// `SubscribeFormInner` lama (`subscribe-form.tsx`, Fase 17/43/109/127/130,
// DIHAPUS fase ini), TIDAK ada logic baru ditulis ulang. Alasan pindah:
// dulu 1 halaman flat merender SEMUA Produk sekaligus jadi state cukup
// hidup se-render itu saja; sekarang katalog dipecah per halaman
// (`/subscribe/[productLine]`, `/subscribe/tambahan-anggota`) TAPI
// keranjang HARUS tetap gabungan lintas halaman (1 checkout = 1 invoice,
// dikonfirmasi user) — satu-satunya cara tanpa ubah backend sama sekali
// adalah naikkan state ini ke Context yang membungkus SEMUA halaman
// `/subscribe/*` lewat `layout.tsx` (Next.js App Router TIDAK remount
// layout yang sama saat navigasi client-side antar route anaknya, jadi
// Context ini tidak reset saat pindah Produk).
type SubscribeCartContextValue = {
  plans: Plan[] | null;
  groupsByProductLine: Map<string, ModuleGroup<Plan>[]>;
  activeModuleMap: Map<string, boolean>;
  activeSubscriptionInfo: Map<string, SubscriptionInfo>;
  everTrialedModules: Set<string>;
  isModuleSelected: (moduleKey: string) => boolean;
  activePlanFor: (group: ModuleGroup<Plan>) => Plan | undefined;
  toggleModule: (moduleKey: string) => void;
  selectTier: (moduleKey: string, planId: string) => void;
  selectedPlans: Plan[];
  tryingPlanId: string | null;
  onStartTrial: (e: React.MouseEvent, plan: Plan) => void;
  seatPlans: Plan[];
  selectedSeatPlan: Plan | null;
  selectedSeatPlanId: string | null;
  seatQuantity: number;
  setSeatQuantity: (n: number) => void;
  setSelectedSeatPlanIdOverride: (id: string | null) => void;
  hasAnyRealActiveSubscription: boolean;
  total: number;
  seatTotal: number;
  checkingOut: boolean;
  handleCheckout: () => Promise<void>;
  // § dipakai Step 0 (`/subscribe/page.tsx`) buat auto-redirect ke katalog
  // 1 Produk kalau preselect `?plans=` dari landing SEMUANYA dari Produk
  // yang sama — lihat `resolveSinglePreselectProductLine`. `null` = belum
  // ada preselect ATAU sudah dikonsumsi (§ `clearPreselect`).
  preselectedModuleKeys: string[] | null;
  clearPreselect: () => void;
};

const SubscribeCartContext = createContext<SubscribeCartContextValue | null>(null);

export function useSubscribeCart(): SubscribeCartContextValue {
  const ctx = useContext(SubscribeCartContext);
  if (!ctx) throw new Error("useSubscribeCart harus dipanggil di dalam <SubscribeCartProvider>");
  return ctx;
}

export function SubscribeCartProvider({ dataUsahaId, children }: { dataUsahaId: string; children: React.ReactNode }) {
  return (
    // useSearchParams() WAJIB di-Suspense-boundary (pola sama login-form.tsx, subscribe-form.tsx lama)
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SubscribeCartProviderInner dataUsahaId={dataUsahaId}>{children}</SubscribeCartProviderInner>
    </Suspense>
  );
}

function SubscribeCartProviderInner({ dataUsahaId, children }: { dataUsahaId: string; children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [activeModuleMap, setActiveModuleMap] = useState<Map<string, boolean>>(new Map());
  const [activeSubscriptionInfo, setActiveSubscriptionInfo] = useState<Map<string, SubscriptionInfo>>(new Map());
  const [everTrialedModules, setEverTrialedModules] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  const [tryingPlanId, setTryingPlanId] = useState<string | null>(null);
  const [preselectedModuleKeys, setPreselectedModuleKeys] = useState<string[] | null>(null);

  const { groups, isModuleSelected, activePlanFor, toggleModule, selectTier, setSelectedModules, selectedPlans } = useGroupedPlans(plans ?? []);

  const groupsByProductLine = useMemo(() => {
    const byLine = new Map<string, ModuleGroup<Plan>[]>();
    for (const group of groups) {
      const line = moduleProductLine(group.moduleKey);
      if (!line) continue;
      const bucket = byLine.get(line) ?? [];
      bucket.push(group);
      byLine.set(line, bucket);
    }
    return byLine;
  }, [groups]);

  const seatPlans = useMemo(
    () => (plans ?? []).filter((p) => p.kind === "seat_addon" && p.isActive).sort((a, b) => b.durationDays - a.durationDays),
    [plans],
  );
  const [selectedSeatPlanIdOverride, setSelectedSeatPlanIdOverride] = useState<string | null>(null);
  const [seatQuantity, setSeatQuantity] = useState(0);
  const selectedSeatPlan = seatPlans.find((p) => p.id === selectedSeatPlanIdOverride) ?? seatPlans[0] ?? null;
  const selectedSeatPlanId = selectedSeatPlan?.id ?? null;

  async function load() {
    const [plansRes, subsRes] = await Promise.all([api.plans.get(), api.me.subscriptions.get()]);
    const allPlans = (plansRes.data as unknown as Plan[] | undefined) ?? [];
    setPlans(allPlans);

    const subsData = subsRes.data as unknown as
      | {
          subscriptions: {
            subscription: { isTrial: boolean; dataUsahaId: string; startAt: string | null; endAt: string | null };
            plan: { modules: string[] };
          }[];
          everTrialedModules: string[];
        }
      | undefined;
    const subs = (subsData?.subscriptions ?? []).filter((s) => s.subscription.dataUsahaId === dataUsahaId);
    const moduleMap = new Map<string, boolean>();
    const subscriptionInfoMap = new Map<string, SubscriptionInfo>();
    for (const s of subs) {
      for (const m of s.plan.modules) {
        moduleMap.set(m, s.subscription.isTrial);
        subscriptionInfoMap.set(m, { startAt: s.subscription.startAt, endAt: s.subscription.endAt });
      }
    }
    setActiveModuleMap(moduleMap);
    setActiveSubscriptionInfo(subscriptionInfoMap);
    const everTrialedModulesForThisDataUsaha = new Set(subs.filter((s) => s.subscription.isTrial).flatMap((s) => s.plan.modules));
    setEverTrialedModules(everTrialedModulesForThisDataUsaha);
    return { allPlans, moduleMap };
  }

  useEffect(() => {
    async function init() {
      const { allPlans, moduleMap } = await load();

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
        if (moduleKeys.size > 0) setPreselectedModuleKeys([...moduleKeys]);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartTrial(e: React.MouseEvent, plan: Plan) {
    e.stopPropagation();
    setTryingPlanId(plan.id);
    const res = await api.subscriptions.trial.post({ planId: plan.id, dataUsahaId });
    setTryingPlanId(null);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(
        code === "TRIAL_ALREADY_USED"
          ? "Trial untuk fitur ini sudah pernah dipakai."
          : code === "MODULE_ALREADY_SUBSCRIBED"
            ? "Fitur ini sudah aktif."
            : "Gagal memulai trial. Coba lagi.",
      );
      return;
    }
    toast.success(`Trial "${plan.name}" aktif! Kamu bisa langsung mulai import.`);
    load();
  }

  const hasAnyRealActiveSubscription = hasAnyRealActiveSubscriptionFn(activeModuleMap);

  const seatTotal = selectedSeatPlan ? selectedSeatPlan.price * seatQuantity : 0;
  const total = useMemo(() => selectedPlans.reduce((sum, p) => sum + p.price, 0) + seatTotal, [selectedPlans, seatTotal]);

  async function handleCheckout() {
    const seatPlanIds = selectedSeatPlan ? Array(seatQuantity).fill(selectedSeatPlan.id) : [];
    const planIds = [...selectedPlans.map((p) => p.id), ...seatPlanIds];
    if (planIds.length === 0) return;
    setCheckingOut(true);
    const res = await api.subscriptions.checkout.post({ planIds, dataUsahaId });
    setCheckingOut(false);
    if (res.error) {
      const code = (res.error.value as { code?: string; moduleKey?: string } | undefined)?.code;
      toast.error(
        code === "MODULE_ALREADY_SUBSCRIBED"
          ? "Salah satu fitur yang dipilih sudah kamu langgan atau masih menunggu pembayaran."
          : code === "PLAN_NOT_ACTIVE"
            ? "Salah satu paket sudah tidak tersedia."
            : "Gagal membuat pesanan. Coba lagi.",
      );
      return;
    }
    const data = res.data as { orderId: string };
    router.push(`/billing/${data.orderId}/pay`);
  }

  const value: SubscribeCartContextValue = {
    plans,
    groupsByProductLine,
    activeModuleMap,
    activeSubscriptionInfo,
    everTrialedModules,
    isModuleSelected,
    activePlanFor,
    toggleModule,
    selectTier,
    selectedPlans,
    tryingPlanId,
    onStartTrial: handleStartTrial,
    seatPlans,
    selectedSeatPlan,
    selectedSeatPlanId,
    seatQuantity,
    setSeatQuantity,
    setSelectedSeatPlanIdOverride,
    hasAnyRealActiveSubscription,
    total,
    seatTotal,
    checkingOut,
    handleCheckout,
    preselectedModuleKeys,
    clearPreselect: () => setPreselectedModuleKeys(null),
  };

  return (
    <SubscribeCartContext.Provider value={value}>
      {children}
      <CartBar />
    </SubscribeCartContext.Provider>
  );
}
