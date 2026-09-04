import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell/app-shell";
import { getPublicSettings } from "@/lib/get-public-settings";

// § Medium finding security review Fase 01 (pola sama dengan
// app/admin/(protected)/layout.tsx) — proxy.ts cuma cek keberadaan session
// cookie, BUKAN role. Cek ROLE sebenarnya terjadi DI SINI (Server
// Component). `/app/login`, `/app/register` sengaja di LUAR grup ini
// supaya tidak ikut ke-gate (cegah redirect loop).
export default async function AppProtectedLayout({ children }: { children: React.ReactNode }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie") ?? "";

  const res = await fetch(`${apiUrl}/me`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) redirect("/login");

  const me = (await res.json()) as { id: string; email: string; name: string; roles: string[] };
  if (!me.roles.includes("customer")) redirect("/login");

  const settings = await getPublicSettings();

  // § Fase 14, ADR-0019 — nav difilter oleh UNION modul dari SEMUA
  // subscription AKTIF (1 user bisa punya banyak subscription, 1 per
  // sub-modul). `/me/subscriptions` (JAMAK) sudah cuma balikin baris
  // `status: "active"` (server-side filtered) — tidak perlu filter
  // status lagi di sini seperti versi `/me/subscription` (tunggal) lama.
  const subRes = await fetch(`${apiUrl}/me/subscriptions`, { headers: { cookie }, cache: "no-store" });
  const subJson = subRes.ok ? ((await subRes.json()) as { subscriptions: { plan: { modules: string[] } }[] }) : { subscriptions: [] };
  const subscriptionModules = subJson.subscriptions.length
    ? [...new Set(subJson.subscriptions.flatMap((s) => s.plan.modules))]
    : undefined;

  return (
    <AppShell surface="app" logoUrl={settings["company.logo"]} subscriptionModules={subscriptionModules} user={{ name: me.name, email: me.email }}>
      {children}
    </AppShell>
  );
}
