import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PilihUsahaForm } from "@/components/data-usaha/pilih-usaha-form";

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

  const res = await fetch(`${apiUrl}/me`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) redirect("/login");
  const me = (await res.json()) as { roles: string[] };
  if (!me.roles.includes("customer")) redirect("/login");

  return (
    <AuthLayout title="Pilih Data Usaha" subtitle="Dashboard kamu dikelompokkan per Data Usaha — pilih salah satu atau buat yang baru.">
      <PilihUsahaForm />
    </AuthLayout>
  );
}
