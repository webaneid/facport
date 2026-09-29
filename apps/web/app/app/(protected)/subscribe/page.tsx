"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChefHat, RefreshCw, Users, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCT_LINES, moduleProductLine, type ProductLineKey } from "@/lib/module-options";
import { PRODUCT_LINE_CARD_COPY, SEAT_ADDON_CARD_COPY } from "@/lib/product-line-copy";
import { resolveSinglePreselectProductLine } from "@/lib/resolve-preselect-product-line";
import { useSubscribeCart } from "@/components/subscribe/subscribe-cart-context";

const PRODUCT_LINE_ICON: Record<ProductLineKey, typeof Zap> = {
  facport: Zap,
  konverter: RefreshCw,
  autoproduksi: ChefHat,
};

// § Fase 161 — Step 0 pengganti halaman flat lama (Fase 127): 4 card
// sejajar (3 Produk + Tambahan Anggota, § riset `architecture-user-tambahan.md`
// ADR-0032 kenapa seat jadi card ke-4 BUKAN bagian salah satu Produk —
// menempel ke Data Usaha, bukan ke Produk tertentu). Klik card → katalog
// 1 Produk (`/subscribe/[productLine]`) atau form seat (`/subscribe/tambahan-anggota`).
export default function SubscribeChooserPage() {
  const router = useRouter();
  const { plans, groupsByProductLine, activeModuleMap, hasAnyRealActiveSubscription, preselectedModuleKeys, clearPreselect } = useSubscribeCart();

  // § kompatibilitas `?plans=` dari landing (`module-features.tsx`) —
  // begitu context selesai resolve preselect, kalau SEMUA modulnya dari 1
  // Produk yang sama, langsung masuk ke katalog Produk itu (bukan berhenti
  // di Step 0) supaya alur klik-dari-landing tetap secepat sebelum
  // redesain ini.
  useEffect(() => {
    if (!preselectedModuleKeys) return;
    const line = resolveSinglePreselectProductLine(preselectedModuleKeys);
    clearPreselect();
    if (line) router.replace(`/subscribe/${line}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedModuleKeys]);

  if (!plans) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  function activeCountFor(productLine: ProductLineKey): number {
    const moduleKeys = new Set((groupsByProductLine.get(productLine) ?? []).map((g) => g.moduleKey));
    return [...activeModuleMap.keys()].filter((m) => moduleKeys.has(m) && moduleProductLine(m) === productLine).length;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Berlangganan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pilih Produk yang mau digunakan.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PRODUCT_LINES.map((line) => {
          const Icon = PRODUCT_LINE_ICON[line.key];
          const activeCount = activeCountFor(line.key);
          return (
            <Link key={line.key} href={`/subscribe/${line.key}`}>
              <Card className="h-full transition-colors hover:border-primary-300">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle>{line.label}</CardTitle>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <CardDescription>{PRODUCT_LINE_CARD_COPY[line.key]}</CardDescription>
                  {activeCount > 0 && <span className="text-xs font-medium text-primary-700">{activeCount} fitur aktif</span>}
                </CardContent>
              </Card>
            </Link>
          );
        })}

        <Link href="/subscribe/tambahan-anggota">
          <Card className="h-full transition-colors hover:border-primary-300">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
                  <Users className="h-5 w-5" />
                </span>
                <CardTitle>Tambahan Anggota</CardTitle>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <CardDescription>{SEAT_ADDON_CARD_COPY}</CardDescription>
              {!hasAnyRealActiveSubscription && <span className="text-xs text-muted-foreground">Perlu 1 fitur aktif dulu</span>}
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
