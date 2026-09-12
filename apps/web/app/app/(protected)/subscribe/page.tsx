import { redirect } from "next/navigation";
import { SubscribeForm } from "@/components/subscribe/subscribe-form";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";

// § Fase 109, architecture-user-tambahan.md § Fase B2 — Server Component
// tipis: baca `dataUsahaId` aktif dari cookie (sudah divalidasi
// `(protected)/layout.tsx` sebelum halaman ini sempat render, jadi
// SEHARUSNYA selalu ada — redirect di bawah cuma pengaman kalau layout
// itu ter-skip/berubah nanti, bukan jalur normal) lalu teruskan ke
// `SubscribeForm` (Client Component, § subscribe-form.tsx) sebagai prop.
export default async function SubscribePage() {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) redirect("/pilih-usaha");

  return <SubscribeForm dataUsahaId={dataUsahaId} />;
}
