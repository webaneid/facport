"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { moduleLabel, type ModuleKey } from "@/lib/module-options";
import { LANDING_MODULE_ICON, LANDING_MODULE_TAGLINE } from "@/lib/landing-content";
import { currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { useGroupedPlans } from "@/lib/use-grouped-plans";

type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean; trialEligible?: boolean };

// § Fase 47 — REPLACE `catalog-cart.tsx` lama. Tampilan diganti TOTAL
// (kartu icon+judul+checklist ala desain referensi, 1 kartu = 1
// sub-modul — BEDA dari referensi asli yang 1 kartu = banyak sub-item),
// tapi LOGIC cart-select-redirect DISALIN APA ADANYA dari versi lama
// (checkbox multi-select → `/login?redirect=/subscribe?plans=...`,
// § Fase 17 — landing TIDAK punya akses sesi customer, subdomain beda).
// § Fase 53 — 1 kartu sekarang = 1 GRUP MODUL (bisa >1 tier durasi/harga
// per modul, mis. Bulanan/Tahunan), bukan lagi 1 kartu = 1 baris plan.
// Grouping via `useGroupedPlans` (shared sama `/subscribe`).
export function ModuleFeatures({ plans, appUrl }: { plans: Plan[]; appUrl: string }) {
  const { groups, isModuleSelected, isTierActive, activePlanFor, toggleModule, selectTier, selectedPlans } = useGroupedPlans(plans);

  const total = useMemo(() => selectedPlans.reduce((sum, p) => sum + p.price, 0), [selectedPlans]);

  const subscribeUrl = useMemo(() => {
    const target = selectedPlans.length > 0 ? `/subscribe?plans=${selectedPlans.map((p) => p.id).join(",")}` : "/subscribe";
    return `${appUrl}/login?redirect=${encodeURIComponent(target)}`;
  }, [appUrl, selectedPlans]);

  // § "Coba Gratis" TIDAK BISA langsung aktifkan trial dari landing (tidak
  // ada sesi customer di sini, § komentar atas) — redirect ke login bawa
  // 1 plan spesifik, sama pola `subscribeUrl` di atas. Aktivasi trial
  // sesungguhnya baru terjadi di `/subscribe` (customer klik lagi di sana,
  // sudah didukung penuh) — konsisten dengan "Berlangganan" yang juga
  // butuh 1 klik lagi setelah login, bukan langsung checkout dari landing.
  function trialUrl(planId: string): string {
    return `${appUrl}/login?redirect=${encodeURIComponent(`/subscribe?plans=${planId}`)}`;
  }

  if (plans.length === 0) {
    return <p id="fitur" className="text-center text-sm text-slate-500">Belum ada paket tersedia.</p>;
  }

  return (
    <div id="fitur" className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const moduleKey = group.moduleKey as ModuleKey;
          const Icon = LANDING_MODULE_ICON[moduleKey];
          const tagline = LANDING_MODULE_TAGLINE[moduleKey];
          const isSelected = isModuleSelected(group.moduleKey);
          const activePlan = activePlanFor(group);

          return (
            // § Fase 53 — `<div role="button">` (bukan `<button>`) karena
            // pill tier di bawah HARUS `<button>` sungguhan (nested
            // `<button>` di dalam `<button>` invalid HTML/a11y).
            <div
              key={group.moduleKey}
              role="button"
              tabIndex={0}
              onClick={() => toggleModule(group.moduleKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleModule(group.moduleKey);
              }}
              className={`relative flex flex-col gap-3 rounded-xl border py-5 pl-6 pr-5 text-left transition-colors ${
                isSelected ? "border-landing-primary bg-landing-primary-light" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span
                className={`absolute inset-y-4 left-0 w-1 rounded-full ${isSelected ? "bg-landing-primary" : "bg-landing-primary/40"}`}
                aria-hidden
              />
              <div className="flex items-center justify-between gap-2">
                {Icon && (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-landing-primary text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                )}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? "border-landing-primary bg-landing-primary" : "border-slate-300"
                  }`}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
              </div>
              <h3 className="font-semibold text-slate-900">{moduleLabel(moduleKey)}</h3>
              {tagline && (
                <p className="flex items-start gap-1.5 text-xs text-slate-500">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-landing-primary" />
                  {tagline}
                </p>
              )}

              {/* § border pemisah — sama pola /subscribe, pisahkan info (nama/deskripsi) dari harga+pilihan di bawahnya */}
              <div className="border-t border-slate-200" />

              {activePlan && (
                <p className="text-lg font-bold text-slate-900">
                  {currencyFormatter.format(activePlan.price)}
                  <span className="text-xs font-normal text-slate-500"> / {formatDuration(activePlan.durationDays)}</span>
                </p>
              )}

              {group.tiers.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pilih Periode</span>
                  <div className="flex gap-1.5">
                    {group.tiers.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectTier(group.moduleKey, tier.id);
                        }}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          isTierActive(group, tier.id)
                            ? "border-landing-primary bg-landing-primary text-white"
                            : "border-slate-200 text-slate-500 hover:border-landing-primary/50"
                        }`}
                      >
                        {formatDuration(tier.durationDays)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pilih Paket</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleModule(group.moduleKey);
                    }}
                    className={`flex w-fit items-center gap-1.5 rounded-[3px] border border-landing-primary px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected ? "bg-landing-primary text-white" : "text-landing-primary hover:bg-landing-primary-light"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    Berlangganan
                  </button>
                  {activePlan?.trialEligible && (
                    <a
                      href={trialUrl(activePlan.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex w-fit items-center rounded-[3px] border border-landing-primary px-3 py-1.5 text-xs font-medium text-landing-primary transition-colors hover:bg-landing-primary-light"
                    >
                      Coba Gratis
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-slate-200 p-5 text-center">
        {selectedPlans.length === 0 ? (
          <p className="text-sm text-slate-500">Pilih fitur di atas untuk mulai berlangganan.</p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {selectedPlans.length} fitur dipilih — total {currencyFormatter.format(total)}
            </p>
          </>
        )}
        <a
          href={subscribeUrl}
          className={`w-full rounded-full px-6 py-3 text-center text-sm font-medium text-white transition-colors ${
            selectedPlans.length === 0 ? "pointer-events-none bg-slate-300" : "bg-landing-primary hover:bg-landing-primary-dark"
          }`}
        >
          Berlangganan Sekarang
        </a>
      </div>
    </div>
  );
}
