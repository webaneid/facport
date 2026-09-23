import { redirect } from "next/navigation";
import { ConversionLogView } from "@/components/conversion-logs/conversion-log-view";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";

// § Fase 150, ADR-0038 — Server Component tipis, pola SAMA `import/arsip/page.tsx` (Facport): baca `dataUsahaId`
// aktif dari cookie (sudah divalidasi `(protected)/layout.tsx`), teruskan ke Client Component sebagai prop.
export default async function ConversionLogsPage() {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) redirect("/pilih-usaha");

  return <ConversionLogView dataUsahaId={dataUsahaId} />;
}
