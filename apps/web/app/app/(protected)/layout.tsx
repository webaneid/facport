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

  // § Fase 13, ADR-0018 — nav difilter oleh modul plan langganan AKTIF.
  // `/me/subscription` balas body BENERAN KOSONG (bukan literal "null")
  // kalau belum ada subscription — res.json() langsung throw kalau
  // dipanggil di body kosong (§ lessons-learned.md 2026-08-27, gotcha
  // yang sama seperti app/app/(protected)/page.tsx `fetchJson`).
  const subRes = await fetch(`${apiUrl}/me/subscription`, { headers: { cookie }, cache: "no-store" });
  const subText = subRes.ok ? await subRes.text() : "";
  const subscriptionInfo = subText
    ? (JSON.parse(subText) as { subscription: { status: string }; plan: { modules: string[] } } | null)
    : null;
  // § `/me/subscription` balikin subscription TERBARU apa pun statusnya
  // (termasuk expired/cancelled/pending_payment) — nav cuma boleh percaya
  // modules dari subscription yang BENAR-BENAR "active", supaya tidak
  // nampilin menu yang bakal ditolak `moduleAccess` gate begitu diklik.
  const subscriptionModules = subscriptionInfo?.subscription.status === "active" ? subscriptionInfo.plan.modules : undefined;

  return (
    <AppShell surface="app" logoUrl={settings["company.logo"]} subscriptionModules={subscriptionModules} user={{ name: me.name, email: me.email }}>
      {children}
    </AppShell>
  );
}
