import { moduleCategory, MODULE_CATEGORIES } from "@/lib/module-options";
import type { ModuleGroup } from "@/lib/use-grouped-plans";
import { CategoryCard } from "./category-card";
import type { Plan } from "./module-pricing-panel";

// § Fase 127 — bucket `groups` (1 Produk, SEMUA modulnya) per Kategori,
// urut `MODULE_CATEGORIES`, buang kategori kosong. Pola SAMA PERSIS
// `groupItemsByCategory` di `components/app-shell/sidebar.tsx`, TAPI
// instance TERPISAH (§ plan "Redesign /subscribe" — sengaja duplikasi
// kecil drpd sentuh ulang sidebar yang baru saja stabil, § Fase 126).
function groupByCategory(groups: ModuleGroup<Plan>[]): { category: string; groups: ModuleGroup<Plan>[] }[] {
  const buckets = new Map<string, ModuleGroup<Plan>[]>();
  for (const group of groups) {
    const category = moduleCategory(group.moduleKey);
    if (!category) continue;
    const bucket = buckets.get(category) ?? [];
    bucket.push(group);
    buckets.set(category, bucket);
  }
  return MODULE_CATEGORIES.map((category) => ({ category, groups: buckets.get(category) ?? [] })).filter((b) => b.groups.length > 0);
}

// § Fase 127 — 1 Produk (Facport/Konverter/AutoProduksi) = 1 section:
// judul + garis + grid kartu Kategori. Komponen ini SENGAJA presentational
// murni (semua state/interaksi lewat props, tidak baca hook auth apa pun
// sendiri) — TUJUANNYA supaya nanti bisa ditarik ke landing page publik
// (`app/landing/module-features.tsx`) tanpa ubah struktur, cuma beda
// binding interaksi yang dioper (§ Context di plan file, TIDAK dieksekusi
// fase ini). JANGAN render section ini kalau `groups` kosong — dicek di
// pemanggil (`subscribe-form.tsx`), bukan di sini, supaya pemanggil yang
// tanggung jawab keputusan "produk mana yang tampil hari ini".
export function ProductCatalogSection({
  title,
  groups,
  activeModuleMap,
  everTrialedModules,
  isModuleSelected,
  activePlanFor,
  toggleModule,
  selectTier,
  tryingPlanId,
  onStartTrial,
}: {
  title: string;
  groups: ModuleGroup<Plan>[];
  activeModuleMap: Map<string, boolean>;
  everTrialedModules: Set<string>;
  isModuleSelected: (moduleKey: string) => boolean;
  activePlanFor: (group: ModuleGroup<Plan>) => Plan | undefined;
  toggleModule: (moduleKey: string) => void;
  selectTier: (moduleKey: string, planId: string) => void;
  tryingPlanId: string | null;
  onStartTrial: (e: React.MouseEvent, plan: Plan) => void;
}) {
  const categories = groupByCategory(groups);
  if (categories.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pilih fitur yang ingin Anda gunakan</p>
        <div className="mt-3 border-t border-border" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ category, groups: categoryGroups }) => (
          <CategoryCard
            key={category}
            category={category}
            groups={categoryGroups}
            activeModuleMap={activeModuleMap}
            everTrialedModules={everTrialedModules}
            isModuleSelected={isModuleSelected}
            activePlanFor={activePlanFor}
            toggleModule={toggleModule}
            selectTier={selectTier}
            tryingPlanId={tryingPlanId}
            onStartTrial={onStartTrial}
          />
        ))}
      </div>
    </div>
  );
}
