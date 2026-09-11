import { redirect } from "next/navigation";
import { TeamForm } from "@/components/team/team-form";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";

// § Fase 110, architecture-user-tambahan.md — "Kelola Tim" (User Tambahan),
// Server Component tipis — pola SAMA `/subscribe` (§ Fase 109): baca
// `dataUsahaId` aktif dari cookie (sudah divalidasi `(protected)/layout.tsx`),
// teruskan ke Client Component sebagai prop.
export default async function TeamPage() {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) redirect("/pilih-usaha");

  return <TeamForm dataUsahaId={dataUsahaId} />;
}
