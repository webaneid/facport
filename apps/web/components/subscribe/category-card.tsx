"use client";

import { Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CATEGORY_ICON, CATEGORY_ICON_FALLBACK } from "@/lib/category-icons";
import { moduleLabel } from "@/lib/module-options";
import type { ModuleGroup } from "@/lib/use-grouped-plans";
import { ModulePricingPanel, type Plan, type SubscriptionInfo } from "./module-pricing-panel";

// § Fase 127 — 1 kartu = 1 Kategori (dulu 1 kartu = 1 modul, § plan
// "Redesign /subscribe" poin 2). Checklist Varian di bawah header —
// klik 1 baris buka `ModulePricingPanel` di bawahnya (`AccordionContent`).
// § Fase 129 (diminta user 2026-09-17) — DULU tidak render `<Accordion>`
// Root sendiri (exclusivity "1 Varian terbuka se-halaman" dikontrol 1
// level di atas, `subscribe-form.tsx`). SEKARANG tiap kartu Kategori
// PUNYA `<Accordion>` Root SENDIRI, `defaultValue` = Varian PERTAMA —
// user eksplisit minta baris pertama tiap kartu SELALU terbuka
// (harga+info langsung kelihatan, biar jadi trigger orang berlangganan)
// dan ini "berlaku untuk semua modul" SEKALIGUS, bukan cuma 1 se-halaman
// — makanya exclusivity dipersempit jadi PER KARTU (bukan lintas kartu
// lagi), tiap kartu independen.
export function CategoryCard({
  category,
  groups,
  activeModuleMap,
  activeSubscriptionInfo,
  everTrialedModules,
  isModuleSelected,
  activePlanFor,
  toggleModule,
  selectTier,
  tryingPlanId,
  onStartTrial,
}: {
  category: string;
  groups: ModuleGroup<Plan>[];
  activeModuleMap: Map<string, boolean>;
  activeSubscriptionInfo: Map<string, SubscriptionInfo>;
  everTrialedModules: Set<string>;
  isModuleSelected: (moduleKey: string) => boolean;
  activePlanFor: (group: ModuleGroup<Plan>) => Plan | undefined;
  toggleModule: (moduleKey: string) => void;
  selectTier: (moduleKey: string, planId: string) => void;
  tryingPlanId: string | null;
  onStartTrial: (e: React.MouseEvent, plan: Plan) => void;
}) {
  const Icon = CATEGORY_ICON[category] ?? CATEGORY_ICON_FALLBACK;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Icon className="h-5 w-5" />
        </span>
        <CardTitle>{category}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <Accordion type="single" collapsible defaultValue={groups[0]?.moduleKey} className="flex flex-col">
          {groups.map((group) => {
            // § Fase 43 — "aktif" punya 2 rasa: paket ASLI (blokir card) vs
            // trial (tetap bisa dipilih ke cart, jalur upgrade) — sama
            // logic yang sudah ada di versi lama `subscribe-form.tsx`.
            const isRealActive = activeModuleMap.get(group.moduleKey) === false;
            const isTrialActive = activeModuleMap.get(group.moduleKey) === true;
            const hasEverTrialed = everTrialedModules.has(group.moduleKey);
            const isSelected = isModuleSelected(group.moduleKey);
            const activePlan = activePlanFor(group);
            const showTrialButton = Boolean(activePlan?.trialEligible) && !isRealActive && !isTrialActive && !hasEverTrialed;
            return (
              <AccordionItem key={group.moduleKey} value={group.moduleKey}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary-600" />
                    {moduleLabel(group.moduleKey)}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ModulePricingPanel
                    group={group}
                    activePlan={activePlan}
                    isSelected={isSelected}
                    isRealActive={isRealActive}
                    isTrialActive={isTrialActive}
                    subscriptionInfo={activeSubscriptionInfo.get(group.moduleKey)}
                    hasEverTrialed={hasEverTrialed}
                    showTrialButton={showTrialButton}
                    tryingPlanId={tryingPlanId}
                    onToggle={() => toggleModule(group.moduleKey)}
                    onSelectTier={(planId) => selectTier(group.moduleKey, planId)}
                    onStartTrial={onStartTrial}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
