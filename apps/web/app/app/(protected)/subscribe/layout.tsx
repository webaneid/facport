import { redirect } from "next/navigation";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";
import { SubscribeCartProvider } from "@/components/subscribe/subscribe-cart-context";

// § Fase 161 — guard cookie Data Usaha PERSIS `page.tsx` lama (Fase 109,
// architecture-user-tambahan.md § Fase B2), dipindah ke layout supaya
// berlaku utk SEMUA halaman `/subscribe/*` (Step 0, katalog per-Produk,
// Tambahan Anggota) tanpa duplikasi guard di tiap page.tsx. Layout ini
// JUGA yang membungkus `SubscribeCartProvider` — Next.js App Router TIDAK
// remount layout yang sama saat navigasi client-side antar route anaknya,
// jadi keranjang (state di dalam Provider) tetap gabungan lintas halaman.
export default async function SubscribeLayout({ children }: { children: React.ReactNode }) {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) redirect("/pilih-usaha");

  return <SubscribeCartProvider dataUsahaId={dataUsahaId}>{children}</SubscribeCartProvider>;
}
