import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { moduleLabel, type ModuleKey } from "@/lib/module-options";
import { currencyFormatter, formatDate } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { LANDING_MODULE_ICON, LANDING_MODULE_TAGLINE } from "@/lib/landing-content";
import type { ModuleGroup } from "@/lib/use-grouped-plans";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

export type Plan = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  modules: string[];
  isActive: boolean;
  trialEligible: boolean;
  kind: "module" | "seat_addon";
};

// § Fase 130 (diminta user 2026-09-17) — tanggal subscription AKTUAL
// (beda dari `activePlan.durationDays` yang cuma info KATALOG paket).
// Undefined = belum ada subscription aktif utk modul ini sama sekali.
export type SubscriptionInfo = { startAt: string | null; endAt: string | null };

// § Fase 127 — isi panel accordion 1 Varian (dulu ISI KARTU SATU-SATUNYA
// per modul di `/subscribe`, § subscribe-form.tsx versi lama baris
// 243-327 — DIPINDAH APA ADANYA ke sini, cuma di-parameterize lewat props
// alih-alih closure langsung ke state `SubscribeFormInner`, supaya bisa
// dipakai di dalam `AccordionContent` — lihat `category-card.tsx`). Nol
// perubahan behavior/tampilan dari versi lama, murni relokasi.
export function ModulePricingPanel({
  group,
  activePlan,
  isSelected,
  isRealActive,
  isTrialActive,
  subscriptionInfo,
  hasEverTrialed,
  showTrialButton,
  tryingPlanId,
  onToggle,
  onSelectTier,
  onStartTrial,
}: {
  group: ModuleGroup<Plan>;
  activePlan: Plan | undefined;
  isSelected: boolean;
  isRealActive: boolean;
  isTrialActive: boolean;
  subscriptionInfo: SubscriptionInfo | undefined;
  hasEverTrialed: boolean;
  showTrialButton: boolean | undefined;
  tryingPlanId: string | null;
  onToggle: () => void;
  onSelectTier: (planId: string) => void;
  onStartTrial: (e: React.MouseEvent, plan: Plan) => void;
}) {
  const moduleKey = group.moduleKey as ModuleKey;
  const Icon = LANDING_MODULE_ICON[moduleKey];
  const tagline = LANDING_MODULE_TAGLINE[moduleKey];
  const companyTimezone = useCompanyTimezone();

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
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
      {(isRealActive || isTrialActive) && subscriptionInfo && (subscriptionInfo.startAt || subscriptionInfo.endAt) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {subscriptionInfo.startAt && `Mulai ${formatDate(subscriptionInfo.startAt, companyTimezone)}`}
          {subscriptionInfo.startAt && subscriptionInfo.endAt && " — "}
          {subscriptionInfo.endAt && `Berakhir ${formatDate(subscriptionInfo.endAt, companyTimezone)}`}
        </p>
      )}

      {activePlan && (
        <p className="mt-3 text-2xl font-semibold text-foreground">
          {currencyFormatter.format(activePlan.price)}
          <span className="text-sm font-normal text-muted-foreground"> / {formatDuration(activePlan.durationDays)}</span>
        </p>
      )}

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
                onClick={() => onSelectTier(tier.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  activePlan?.id === tier.id
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

      {!isRealActive && activePlan && (
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pilih Paket</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onToggle}
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
                onClick={(e) => onStartTrial(e, activePlan)}
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
}
