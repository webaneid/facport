"use client";

import { useMemo, useState } from "react";

export type PlanLike = {
  id: string;
  price: number;
  durationDays: number;
  modules: string[];
  trialEligible?: boolean;
};

export type ModuleGroup<T extends PlanLike> = {
  moduleKey: string;
  tiers: T[]; // diurutkan durationDays DESC (tier durasi terpanjang dulu, mis. tahunan, lalu bulanan, lalu harian kalau ada)
};

// § Fase 53 — 1 sub-modul sekarang boleh punya BEBERAPA baris `plans`
// (tier durasi/harga berbeda, mis. Bulanan vs Tahunan) — backend TIDAK
// berubah (masih plan-id-based apa adanya, lihat phase-53 doc), grouping
// murni di frontend. Dipakai landing (`module-features.tsx`) DAN
// `/subscribe` — state/logic grouping SAMA PERSIS di keduanya, cuma
// rendering yang beda konteks (landing simpel, subscribe ada state
// active/trial per modul) — hindari duplikasi logic yang sama persis 2x.
export function useGroupedPlans<T extends PlanLike>(plans: T[], initialSelectedModules: Set<string> = new Set()) {
  const groups = useMemo<ModuleGroup<T>[]>(() => {
    const byModule = new Map<string, T[]>();
    for (const plan of plans) {
      const moduleKey = plan.modules[0];
      if (!moduleKey) continue;
      const existing = byModule.get(moduleKey);
      if (existing) existing.push(plan);
      else byModule.set(moduleKey, [plan]);
    }
    return [...byModule.entries()].map(([moduleKey, tiers]) => ({
      moduleKey,
      // § diminta user 2026-09-08 — SEBELUMNYA ASC (bulanan dulu, jadi
      // default auto-select). Prioritas auto-select & urutan tampil pill
      // HARUS tahunan dulu, baru bulanan, baru harian (kalau ada) — jadi
      // DESC by durationDays (durasi terpanjang dulu).
      tiers: [...tiers].sort((a, b) => b.durationDays - a.durationDays),
    }));
  }, [plans]);

  const [selectedModules, setSelectedModules] = useState<Set<string>>(initialSelectedModules);
  // default tier aktif = durasi terpanjang (tiers[0], sudah DESC) per modul
  const [activeTier, setActiveTier] = useState<Record<string, string>>({});

  function tierIdFor(group: ModuleGroup<T>): string | undefined {
    return activeTier[group.moduleKey] ?? group.tiers[0]?.id;
  }

  function isModuleSelected(moduleKey: string) {
    return selectedModules.has(moduleKey);
  }

  function isTierActive(group: ModuleGroup<T>, planId: string) {
    return tierIdFor(group) === planId;
  }

  function toggleModule(moduleKey: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  }

  function selectTier(moduleKey: string, planId: string) {
    setActiveTier((prev) => ({ ...prev, [moduleKey]: planId }));
  }

  const selectedPlans = useMemo(
    () =>
      groups
        .filter((g) => selectedModules.has(g.moduleKey))
        .map((g) => g.tiers.find((t) => t.id === tierIdFor(g)) ?? g.tiers[0])
        .filter((p): p is T => p !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tierIdFor closes over activeTier, sudah termasuk di deps
    [groups, selectedModules, activeTier],
  );

  return {
    groups,
    isModuleSelected,
    isTierActive,
    activePlanFor: (group: ModuleGroup<T>) => group.tiers.find((t) => t.id === tierIdFor(group)) ?? group.tiers[0],
    toggleModule,
    selectTier,
    // § dipakai jalur pre-select dari query string (mis. `/subscribe`
    // dibawa dari landing) — SET langsung (bukan toggle), supaya aman
    // dipanggil di effect yang mungkin jalan 2x (React Strict Mode dev)
    // tanpa risiko toggle-off yang tidak disengaja.
    setSelectedModules,
    selectedPlans,
    selectedPlanIds: selectedPlans.map((p) => p.id),
  };
}
