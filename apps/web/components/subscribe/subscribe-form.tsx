"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { moduleLabel, moduleProductLine, PRODUCT_LINES, productLineLabel } from "@/lib/module-options";
import { currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { useGroupedPlans, type ModuleGroup } from "@/lib/use-grouped-plans";
import { ProductCatalogSection } from "./product-catalog-section";
import type { Plan } from "./module-pricing-panel";

// § Fase 17 — cart halaman dashboard (sudah login). Reuse endpoint yang
// SUDAH ADA sejak Fase 16 (`POST /subscriptions/checkout`) — halaman ini
// MURNI UI pemilihan sub-modul + panggil checkout, TIDAK ada logic
// pembayaran di sini (itu di `/billing/[orderId]/pay`, sudah lengkap).
// § Fase 109 — `dataUsahaId` WAJIB dioper dari `page.tsx` (Server
// Component, baca cookie `active_data_usaha_id` yang SUDAH divalidasi
// `(protected)/layout.tsx` sebelum halaman ini sempat render) — BUKAN
// lagi dari endpoint jembatan `GET /me/data-usaha/default` (dihapus Fase
// 109, lihat `docs/phases/phase-107-migrasi-data-usaha.md` Known
// Limitations). Semua subscription/trial yang ditampilkan di sini JUGA
// di-scope ke Data Usaha ini (§ load()).
export function SubscribeForm({ dataUsahaId }: { dataUsahaId: string }) {
  return (
    // useSearchParams() WAJIB di-Suspense-boundary (pola sama login-form.tsx)
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SubscribeFormInner dataUsahaId={dataUsahaId} />
    </Suspense>
  );
}

function SubscribeFormInner({ dataUsahaId }: { dataUsahaId: string }) {
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
  // § Fase 110 — `useGroupedPlans` SENGAJA skip plan `seat_addon`
  // (`modules: []`, § lib/use-grouped-plans.ts `if (!moduleKey) continue`)
  // — seat DITANGANI TERPISAH di bawah (`seatPlans`/`seatQuantity`), bukan
  // dipaksa masuk konsep "grup modul" yang memang tidak cocok untuknya.
  const { groups, isModuleSelected, activePlanFor, toggleModule, selectTier, setSelectedModules, selectedPlans } = useGroupedPlans(plans ?? []);

  // § Fase 127 — 1 Varian boleh terbuka SE-HALAMAN (lintas kartu Kategori,
  // lintas Produk) — Radix `Accordion type="single" collapsible` di SATU
  // Root yang membungkus SEMUA `ProductCatalogSection` di bawah (bukan 1
  // Accordion per kartu) kasih exclusivity ini otomatis lewat 1 state ini.
  const [openModuleKey, setOpenModuleKey] = useState<string | undefined>(undefined);

  // § split `groups` (flat, semua Produk campur) per `productLine` —
  // tiap Produk yang py minimal 1 grup dapat section sendiri (§
  // `ProductCatalogSection`), Produk 0 grup (Konverter/AutoProduksi hari
  // ini) TIDAK dapat section sama sekali (bukan "Coming Soon" kosong).
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
  // § pilihan EKSPLISIT user — null berarti "belum pilih", fallback ke
  // seatPlans[0] dihitung saat render (derived), bukan di-setState lewat
  // effect supaya tidak ada render tambahan begitu `seatPlans` termuat.
  const [selectedSeatPlanIdOverride, setSelectedSeatPlanIdOverride] = useState<string | null>(null);
  // § 0 = tidak disertakan ke pesanan (opt-in, beda dari tier modul yang
  // opt-in lewat toggle "Berlangganan" — di sini cukup quantity > 0).
  const [seatQuantity, setSeatQuantity] = useState(0);
  const selectedSeatPlan =
    seatPlans.find((p) => p.id === selectedSeatPlanIdOverride) ?? seatPlans[0] ?? null;
  const selectedSeatPlanId = selectedSeatPlan?.id ?? null;

  async function load() {
    const [plansRes, subsRes] = await Promise.all([api.plans.get(), api.me.subscriptions.get()]);
    const allPlans = (plansRes.data as unknown as Plan[] | undefined) ?? [];
    setPlans(allPlans);

    const subsData = subsRes.data as unknown as
      | {
          subscriptions: { subscription: { isTrial: boolean; dataUsahaId: string }; plan: { modules: string[] } }[];
          everTrialedModules: string[];
        }
      | undefined;
    // § Fase 109 — scope ke Data Usaha AKTIF saja, konsisten
    // `(protected)/layout.tsx` (lihat komentar di sana soal kenapa ini
    // WAJIB sejak 1 modul bisa aktif di >1 Data Usaha).
    const subs = (subsData?.subscriptions ?? []).filter((s) => s.subscription.dataUsahaId === dataUsahaId);
    const moduleMap = new Map<string, boolean>();
    for (const s of subs) {
      for (const m of s.plan.modules) moduleMap.set(m, s.subscription.isTrial);
    }
    setActiveModuleMap(moduleMap);
    // § "pernah ditrial" WAJIB ikut di-scope per Data Usaha juga — kalau
    // tidak, modul yang pernah ditrial di Data Usaha LAIN ikut dianggap
    // "sudah pernah" di sini, padahal trial itu scope-nya per Data Usaha
    // sejak Fase 108 (`subscriptions.route.ts` trial guard).
    const everTrialedModulesForThisDataUsaha = new Set(subs.filter((s) => s.subscription.isTrial).flatMap((s) => s.plan.modules));
    setEverTrialedModules(everTrialedModulesForThisDataUsaha);
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

  const seatTotal = selectedSeatPlan ? selectedSeatPlan.price * seatQuantity : 0;
  const total = useMemo(() => selectedPlans.reduce((sum, p) => sum + p.price, 0) + seatTotal, [selectedPlans, seatTotal]);

  async function handleCheckout() {
    // § Fase 110 — N slot User Tambahan = N kali `selectedSeatPlan.id`
    // diulang di `planIds` (§ Keputusan Desain arsitektur "quantity via N
    // row") — checkout endpoint TIDAK berubah sama sekali, cukup array
    // lebih panjang.
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

  if (!plans) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {groups.length === 0 ? (
        <EmptyState icon={Package} title="Belum ada paket tersedia" />
      ) : (
        <>
          {/* § Fase 127 — SATU Accordion Root membungkus SEMUA section
             Produk supaya "1 Varian terbuka se-halaman" berlaku LINTAS
             kartu Kategori, bahkan lintas Produk — bukan 1 Accordion per
             kartu (§ plan "Redesign /subscribe" poin 4). */}
          <Accordion type="single" collapsible value={openModuleKey} onValueChange={setOpenModuleKey} className="flex flex-col gap-8">
            {PRODUCT_LINES.map((productLine) => {
              const lineGroups = groupsByProductLine.get(productLine.key) ?? [];
              if (lineGroups.length === 0) return null;
              return (
                <ProductCatalogSection
                  key={productLine.key}
                  title={productLineLabel(productLine.key)}
                  groups={lineGroups}
                  activeModuleMap={activeModuleMap}
                  everTrialedModules={everTrialedModules}
                  isModuleSelected={isModuleSelected}
                  activePlanFor={activePlanFor}
                  toggleModule={toggleModule}
                  selectTier={selectTier}
                  tryingPlanId={tryingPlanId}
                  onStartTrial={handleStartTrial}
                />
              );
            })}
          </Accordion>

          {seatPlans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Slot User Tambahan</CardTitle>
                <CardDescription>Undang orang lain akses SEMUA fitur aktif Data Usaha ini — dikelola di halaman &quot;Kelola Tim&quot;.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {seatPlans.length > 1 && (
                  <div className="flex gap-1.5">
                    {seatPlans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedSeatPlanIdOverride(p.id)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selectedSeatPlanId === p.id
                            ? "border-primary-600 bg-primary-600 text-white"
                            : "border-border text-muted-foreground hover:border-primary-300"
                        }`}
                      >
                        {formatDuration(p.durationDays)} — {currencyFormatter.format(p.price)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label htmlFor="seat-quantity" className="text-sm text-foreground">
                    Jumlah slot
                  </label>
                  <input
                    id="seat-quantity"
                    type="number"
                    min={0}
                    value={seatQuantity}
                    onChange={(e) => setSeatQuantity(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  {selectedSeatPlan && seatQuantity > 0 && (
                    <span className="text-sm text-muted-foreground">= {currencyFormatter.format(selectedSeatPlan.price * seatQuantity)}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Ringkasan Pesanan</CardTitle>
              <CardDescription>Invoice dibuat setelah checkout — kamu pilih metode bayar (transfer bank/QRIS) di langkah berikutnya.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selectedPlans.length === 0 && seatQuantity === 0 ? (
                <p className="text-sm text-muted-foreground">Pilih fitur di atas untuk melanjutkan.</p>
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
                  {selectedSeatPlan && seatQuantity > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {seatQuantity}x Slot User Tambahan <span className="text-muted-foreground">({formatDuration(selectedSeatPlan.durationDays)})</span>
                      </span>
                      <span className="text-muted-foreground">{currencyFormatter.format(seatTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                    <span>Total</span>
                    <span>{currencyFormatter.format(total)}</span>
                  </div>
                </div>
              )}
              <Button onClick={handleCheckout} disabled={(selectedPlans.length === 0 && seatQuantity === 0) || checkingOut} className="w-full">
                {checkingOut ? "Memproses..." : "Checkout"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
