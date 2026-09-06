"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { moduleLabel, type ModuleKey } from "@/lib/module-options";
import { LANDING_MODULE_ICON, LANDING_MODULE_TAGLINE } from "@/lib/landing-content";
import { currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";

type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean };

// § Fase 47 — REPLACE `catalog-cart.tsx` lama. Tampilan diganti TOTAL
// (kartu icon+judul+checklist ala desain referensi, 1 kartu = 1
// sub-modul — BEDA dari referensi asli yang 1 kartu = banyak sub-item),
// tapi LOGIC cart-select-redirect DISALIN APA ADANYA dari versi lama
// (checkbox multi-select → `/login?redirect=/subscribe?plans=...`,
// § Fase 17 — landing TIDAK punya akses sesi customer, subdomain beda).
export function ModuleFeatures({ plans, appUrl }: { plans: Plan[]; appUrl: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(planId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  const selectedPlans = useMemo(() => plans.filter((p) => selected.has(p.id)), [plans, selected]);
  const total = useMemo(() => selectedPlans.reduce((sum, p) => sum + p.price, 0), [selectedPlans]);

  const subscribeUrl = useMemo(() => {
    const target = selectedPlans.length > 0 ? `/subscribe?plans=${selectedPlans.map((p) => p.id).join(",")}` : "/subscribe";
    return `${appUrl}/login?redirect=${encodeURIComponent(target)}`;
  }, [appUrl, selectedPlans]);

  if (plans.length === 0) {
    return <p id="fitur" className="text-center text-sm text-slate-500">Belum ada paket tersedia.</p>;
  }

  return (
    <div id="fitur" className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const moduleKey = plan.modules[0] as ModuleKey | undefined;
          const Icon = moduleKey ? LANDING_MODULE_ICON[moduleKey] : undefined;
          const tagline = moduleKey ? LANDING_MODULE_TAGLINE[moduleKey] : undefined;
          const isSelected = selected.has(plan.id);

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => toggle(plan.id)}
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
              <h3 className="font-semibold text-slate-900">{moduleKey ? moduleLabel(moduleKey) : plan.name}</h3>
              {tagline && (
                <p className="flex items-start gap-1.5 text-xs text-slate-500">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-landing-primary" />
                  {tagline}
                </p>
              )}
              <p className="mt-1 text-lg font-bold text-slate-900">
                {currencyFormatter.format(plan.price)}
                <span className="text-xs font-normal text-slate-500"> / {formatDuration(plan.durationDays)}</span>
              </p>
            </button>
          );
        })}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-slate-200 p-5 text-center">
        {selectedPlans.length === 0 ? (
          <p className="text-sm text-slate-500">Pilih sub-modul di atas untuk mulai berlangganan.</p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {selectedPlans.length} sub-modul dipilih — total {currencyFormatter.format(total)}
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
