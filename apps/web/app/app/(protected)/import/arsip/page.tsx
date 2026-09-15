import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ImportArchiveView } from "@/components/import-archive/import-archive-view";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";

// § Fase 113 — Server Component tipis, pola SAMA `team/page.tsx`: baca
// `dataUsahaId` aktif dari cookie (sudah divalidasi `(protected)/layout.tsx`),
// teruskan ke Client Component sebagai prop. SEBELUM ini halaman langsung
// Client Component yang fetch tanpa scoping Data Usaha sama sekali (bug —
// lihat `docs/phases/phase-113-scoping-data-usaha-dashboard.md`).
export default async function ImportArchivePage() {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) redirect("/pilih-usaha");

  // § Fase 125 poin 3 (2026-09-15) — halaman ini sekarang gabungan riwayat
  // SEMUA anggota tim (§ `/me/import-batches`), tapi tombol hapus tetap
  // HANYA boleh pemilik Data Usaha — fetch ulang di sini (pola sama
  // `app/(protected)/layout.tsx`), bukan thread context, konsisten
  // konvensi "Server Component tipis fetch sendiri" project ini.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie") ?? "";
  const dataUsahaRes = await fetch(`${apiUrl}/me/data-usaha`, { headers: { cookie }, cache: "no-store" });
  const dataUsahaList = dataUsahaRes.ok ? ((await dataUsahaRes.json()) as { dataUsaha: { id: string; isOwner: boolean }[] }).dataUsaha : [];
  const isDataUsahaOwner = dataUsahaList.find((d) => d.id === dataUsahaId)?.isOwner ?? false;

  return <ImportArchiveView dataUsahaId={dataUsahaId} isDataUsahaOwner={isDataUsahaOwner} />;
}
