import { redirect } from "next/navigation";
import { headers } from "next/headers";

// § Medium finding security review Fase 01 — proxy.ts cuma cek keberadaan
// session cookie (existence-only, direkomendasikan Better Auth buat
// proxy/middleware — TIDAK ada query DB di sana). Cek ROLE sebenarnya
// terjadi DI SINI (Server Component, layout khusus route group
// `(protected)`) — `/admin/login` sengaja di LUAR grup ini supaya tidak
// ikut ke-gate (redirect loop kalau ikut).
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie") ?? "";

  const res = await fetch(`${apiUrl}/me`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) redirect("/login");

  const me = (await res.json()) as { roles: string[] };
  if (!me.roles.includes("admin")) redirect("/login");

  return <>{children}</>;
}
