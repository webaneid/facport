"use client";

import Link from "next/link";
import { redirect, useParams } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PRODUCT_LINES, type ProductLineKey } from "@/lib/module-options";
import { PRODUCT_LINE_SUBSCRIBE_COPY } from "@/lib/product-line-copy";
import { useSubscribeCart } from "@/components/subscribe/subscribe-cart-context";
import { ProductCatalogSection } from "@/components/subscribe/product-catalog-section";

const VALID_PRODUCT_LINES = new Set(PRODUCT_LINES.map((l) => l.key));

// § Fase 161 — katalog 1 Produk (dulu SEMUA Produk ditumpuk di 1 halaman,
// Fase 127). `ProductCatalogSection` TIDAK diubah sama sekali (sudah
// presentational murni sejak dirancang), cuma dipanggil 1x untuk Produk
// dari param URL, bukan di-loop `PRODUCT_LINES.map(...)` seperti sebelumnya.
export default function ProductCatalogPage() {
  const params = useParams<{ productLine: string }>();
  const productLine = params.productLine as ProductLineKey;
  // § param URL bebas ditulis siapa pun — divalidasi dulu terhadap
  // whitelist `PRODUCT_LINES` SEBELUM dipakai untuk lookup (`groupsByProductLine.get`,
  // `PRODUCT_LINE_SUBSCRIBE_COPY[...]` di bawah). Redirect balik ke Step 0
  // (bukan 404 generik) — konsisten pola self-heal project ini utk state
  // URL tidak valid (§ `/pilih-usaha` di `(protected)/layout.tsx`).
  if (!VALID_PRODUCT_LINES.has(productLine)) redirect("/subscribe");

  const {
    plans,
    groupsByProductLine,
    activeModuleMap,
    activeSubscriptionInfo,
    everTrialedModules,
    isModuleSelected,
    activePlanFor,
    toggleModule,
    selectTier,
    tryingPlanId,
    onStartTrial,
    turnOffRenewal,
  } = useSubscribeCart();

  if (!plans) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const groups = groupsByProductLine.get(productLine) ?? [];
  const copy = PRODUCT_LINE_SUBSCRIBE_COPY[productLine];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link href="/subscribe" className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Kembali pilih Produk
      </Link>

      {groups.length === 0 ? (
        <EmptyState icon={Package} title="Belum ada fitur di Produk ini" />
      ) : (
        <ProductCatalogSection
          title={copy.title}
          description={copy.description}
          groups={groups}
          activeModuleMap={activeModuleMap}
          activeSubscriptionInfo={activeSubscriptionInfo}
          everTrialedModules={everTrialedModules}
          isModuleSelected={isModuleSelected}
          activePlanFor={activePlanFor}
          toggleModule={toggleModule}
          selectTier={selectTier}
          tryingPlanId={tryingPlanId}
          onStartTrial={onStartTrial}
          onTurnOffRenewal={turnOffRenewal}
        />
      )}
    </div>
  );
}
