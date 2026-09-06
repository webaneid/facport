import type { Metadata } from "next";
import { PublicPayClient } from "./public-pay-client";

// § Fase 27, ADR-0025 — dokumen finansial personal, jangan ter-index
// mesin pencari (pola sama jalajogja `app/(public)/[tenant]/invoice/[id]/page.tsx`).
export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } };
}

type Props = { params: Promise<{ orderId: string }> };

export default async function PublicPayPage({ params }: Props) {
  const { orderId } = await params;
  return <PublicPayClient orderId={orderId} />;
}
