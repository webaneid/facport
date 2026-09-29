"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { moduleLabel } from "@/lib/module-options";
import { currencyFormatter } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { useSubscribeCart } from "./subscribe-cart-context";

// § Fase 161 — bar mengambang fixed-bottom, dirender 1x di
// `SubscribeCartProvider` (bukan per halaman) supaya tetap tampil sama
// persis saat customer pindah dari 1 halaman Produk ke halaman Produk lain
// — inilah yang bikin "keranjang gabungan lintas halaman" terlihat NYATA
// oleh customer (bukan cuma benar secara state internal). Isi Dialog =
// PERSIS Card "Ringkasan Pesanan" yang dulu selalu ada di bagian bawah
// `subscribe-form.tsx` lama, dipindah apa adanya ke sini (bukan ditulis
// ulang) — cuma sekarang muncul on-demand lewat tombol, bukan selalu
// kelihatan di scroll paling bawah.
export function CartBar() {
  const { selectedPlans, seatQuantity, selectedSeatPlan, seatTotal, total, checkingOut, handleCheckout } = useSubscribeCart();
  const [open, setOpen] = useState(false);

  const itemCount = selectedPlans.length + (seatQuantity > 0 ? 1 : 0);
  if (itemCount === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full max-w-md items-center justify-between gap-3 rounded-2xl border border-border bg-white px-5 py-3.5 text-left shadow-[0_20px_50px_rgba(16,24,40,.18)] transition-colors hover:border-primary-300"
        >
          <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            <ShoppingCart className="h-4 w-4 text-primary-600" />
            {itemCount} fitur dipilih
          </span>
          <span className="flex items-center gap-2 text-sm font-semibold text-primary-700">
            {currencyFormatter.format(total)}
            <span className="text-xs font-normal text-muted-foreground">Lihat &amp; Checkout →</span>
          </span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Ringkasan Pesanan</DialogTitle>
          <DialogDescription>Invoice dibuat setelah checkout — kamu pilih metode bayar (transfer bank/QRIS) di langkah berikutnya.</DialogDescription>
          <div className="mt-4 flex flex-col gap-2">
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
          <DialogFooter>
            <Button onClick={handleCheckout} disabled={checkingOut} className="w-full">
              {checkingOut ? "Memproses..." : "Checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
