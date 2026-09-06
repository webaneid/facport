"use client";

import { useParams } from "next/navigation";
import { OrderPayFlow } from "@/components/billing/order-pay-flow";
import { api } from "@/lib/api-client";

// § Fase 16, ADR-0022 — halaman pembayaran manual (customer LOGIN).
// Route by `orderId` (bukan `invoiceId`) karena SEMUA endpoint backend
// fase ini dikunci by order. § Fase 27, ADR-0025 — UI/logic dipindah ke
// `OrderPayFlow` (shared), dipakai juga versi PUBLIK tanpa login di
// `app/landing/pay/[orderId]/page.tsx`.
export default function PayOrderPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  return <OrderPayFlow orderApi={api.orders({ id: orderId })} backHref="/billing" />;
}
