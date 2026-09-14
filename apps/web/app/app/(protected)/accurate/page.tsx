import { redirect } from "next/navigation";
import { AccurateConnectionsForm } from "@/components/accurate/accurate-connections-form";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";

// § Fase 113 — Server Component tipis, pola SAMA `team/page.tsx`: baca
// `dataUsahaId` aktif dari cookie (sudah divalidasi `(protected)/layout.tsx`),
// teruskan ke Client Component sebagai prop. SEBELUM ini halaman langsung
// Client Component yang fetch tanpa scoping Data Usaha sama sekali (bug —
// lihat `docs/phases/phase-113-scoping-data-usaha-dashboard.md`).
export default async function AccuratePage() {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) redirect("/pilih-usaha");

  return <AccurateConnectionsForm dataUsahaId={dataUsahaId} />;
}
