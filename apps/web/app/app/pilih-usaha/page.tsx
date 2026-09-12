import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PilihUsahaForm } from "@/components/data-usaha/pilih-usaha-form";
import { getPublicSettings } from "@/lib/get-public-settings";

// § Fase 109, architecture-user-tambahan.md § Fase B2 — gerbang "Pilih
// Data Usaha", SENGAJA di LUAR grup `(protected)` (pola sama
// `/login`/`/register`, § comment `(protected)/layout.tsx`) supaya TIDAK
// ikut digate-balik oleh cek "sudah punya Data Usaha aktif?" milik
// layout itu — kalau ikut, user yang BELUM pilih Data Usaha akan terjebak
// redirect loop (layout redirect ke sini, tapi halaman ini sendiri di
// dalam grup yang sama akan di-redirect lagi). Auth/role check DIDUPLIKASI
// di sini (bukan lewat layout) — cuma beberapa baris, pola yang sama
// dipakai `/login` untuk alasan yang sama.
export default async function PilihUsahaPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie") ?? "";

  const [res, settings] = await Promise.all([fetch(`${apiUrl}/me`, { headers: { cookie }, cache: "no-store" }), getPublicSettings()]);
  if (!res.ok) redirect("/login");
  const me = (await res.json()) as { name: string; email: string; roles: string[] };
  if (!me.roles.includes("customer")) redirect("/login");

  return (
    <PilihUsahaForm
      user={{ name: me.name, email: me.email }}
      logoUrl={settings["company.logo"]}
      faviconUrl={settings["company.favicon"]?.["32"]}
    />
  );
}
