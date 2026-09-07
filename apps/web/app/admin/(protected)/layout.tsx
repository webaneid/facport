import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell/app-shell";
import { getPublicSettings } from "@/lib/get-public-settings";

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

  const me = (await res.json()) as { id: string; email: string; name: string; roles: string[] };
  // § Fase 29, ADR-0027 — "staff" (label UI "Admin") sekarang JUGA boleh
  // akses surface ini, beda dari sebelumnya yang cuma "admin" (Super
  // Admin). Perbedaan izin antar keduanya dicek per-endpoint di backend
  // (`users.manage` vs `users.view`), BUKAN di sini.
  if (!me.roles.includes("admin") && !me.roles.includes("staff")) redirect("/login");

  const settings = await getPublicSettings();

  // § favicon (kotak, kecil), BUKAN company.logo (biasanya panjang/lebar) —
  // dipaksa muat ke box persegi 36px di IdentityCard sidebar, logo lebar
  // jadi kelihatan aneh (letterboxed) di situ. Ditemukan feedback user
  // 2026-09-07.
  return (
    <AppShell surface="admin" logoUrl={settings["company.favicon"]?.["180"]} user={{ name: me.name, email: me.email }}>
      {children}
    </AppShell>
  );
}
