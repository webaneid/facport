"use client";

import { OrderPayFlow } from "@/components/billing/order-pay-flow";
import { api } from "@/lib/api-client";

// § Fase 27, ADR-0025 — link pembayaran PUBLIK (tanpa login). Eden
// binding `api.public.orders({id})` (prefix `/public/orders`, backend
// TANPA `auth:true`) — struktural sama dengan `api.orders({id})` versi
// login (§ `OrderApiBinding` di `order-pay-flow.tsx`), makanya bisa
// dipakai komponen SAMA tanpa adaptasi.
export function PublicPayClient({ orderId }: { orderId: string }) {
  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <OrderPayFlow orderApi={api.public.orders({ id: orderId })} />
    </div>
  );
}
