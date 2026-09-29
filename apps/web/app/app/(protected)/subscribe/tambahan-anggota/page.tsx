"use client";

import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCT_LINES } from "@/lib/module-options";
import { currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { useSubscribeCart } from "@/components/subscribe/subscribe-cart-context";

// § Fase 161 — halaman sendiri untuk "Tambahan Anggota" (dulu section di
// bagian bawah `/subscribe` lama, Fase 110/127). Jadi card ke-4 sejajar
// Facport/Konverter/AutoProduksi di Step 0 (§ riset
// `architecture-user-tambahan.md` ADR-0032 — seat menempel ke Data Usaha,
// bukan ke salah satu Produk, dikonfirmasi user). Form pill+quantity LIFT
// APA ADANYA dari `subscribe-form.tsx` lama.
export default function SeatAddonPage() {
  const { plans, seatPlans, selectedSeatPlan, selectedSeatPlanId, seatQuantity, setSeatQuantity, setSelectedSeatPlanIdOverride, hasAnyRealActiveSubscription } =
    useSubscribeCart();

  const backLink = (
    <Link href="/subscribe" className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Kembali pilih Produk
    </Link>
  );

  if (!plans) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {backLink}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!hasAnyRealActiveSubscription) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {backLink}
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Users}
              title="Perlu 1 fitur aktif dulu"
              description="Anda perlu berlangganan minimal 1 fitur (dari Facport, Konverter, atau AutoProduksi) sebelum bisa menambah anggota tim — menambah anggota sebelum ada fitur untuk mereka pakai belum ada gunanya."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {PRODUCT_LINES.map((line) => (
                    <Link key={line.key} href={`/subscribe/${line.key}`} className={buttonVariants("outline", "sm")}>
                      Lihat {line.label}
                    </Link>
                  ))}
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (seatPlans.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {backLink}
        <EmptyState icon={Users} title="Belum ada paket Tambahan Anggota tersedia" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {backLink}
      <Card>
        <CardHeader>
          <CardTitle>Slot User Tambahan</CardTitle>
          <CardDescription>
            Undang orang lain akses SEMUA fitur aktif Data Usaha ini — dikelola di halaman &quot;Kelola Tim&quot;. 1 slot = akses ke SEMUA fitur aktif
            Data Usaha ini, otomatis ikut kalau langganan fitur bertambah/berkurang — berlaku lintas Facport, Konverter, maupun AutoProduksi.
          </CardDescription>
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
    </div>
  );
}
