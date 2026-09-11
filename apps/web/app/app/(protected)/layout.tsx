import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell/app-shell";
import { getPublicSettings } from "@/lib/get-public-settings";
import { CustomerCareWidget } from "@/components/customer-care/customer-care-widget";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";

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

  // § Fase 109, architecture-user-tambahan.md § Fase B2 — dashboard
  // WAJIB di-scope ke SATU Data Usaha aktif (gerbang `/pilih-usaha`,
  // lihat komentar di sana soal kenapa halaman itu di LUAR grup ini).
  // Validasi id dari cookie terhadap daftar Data Usaha MILIK user ini
  // (bukan cuma "ada tidaknya cookie") — self-heal kalau cookie basi
  // (Data Usaha sudah dihapus, dst): redirect balik ke gerbang daripada
  // render dashboard kosong/ambigu.
  const dataUsahaRes = await fetch(`${apiUrl}/me/data-usaha`, { headers: { cookie }, cache: "no-store" });
  const dataUsahaList = dataUsahaRes.ok
    ? ((await dataUsahaRes.json()) as { dataUsaha: { id: string; name: string; isOwner: boolean }[] }).dataUsaha
    : [];
  const activeDataUsahaId = await getActiveDataUsahaIdCookie();
  const activeDataUsaha = dataUsahaList.find((d) => d.id === activeDataUsahaId);
  if (!activeDataUsaha) redirect("/pilih-usaha");

  // § Fase 14, ADR-0019 — nav difilter oleh UNION modul dari SEMUA
  // subscription AKTIF (1 user bisa punya banyak subscription, 1 per
  // sub-modul). `/me/subscriptions` (JAMAK) sudah cuma balikin baris
  // `status: "active"` (server-side filtered) — tidak perlu filter
  // status lagi di sini seperti versi `/me/subscription` (tunggal) lama.
  // § Fase 109 — SEKARANG juga di-scope ke `activeDataUsaha.id` SEBELUM
  // dihitung jadi `subscriptionModules`/`modulePlanNames` — sejak Fase
  // 108, 1 modul BISA aktif di lebih dari 1 Data Usaha sekaligus (itu
  // tujuan restrukturisasi ini), jadi tanpa filter ini `modulePlanNames`
  // (Record 1-nilai-per-moduleKey) bisa diam-diam menimpa data instance
  // lain. Begitu di-scope ke 1 Data Usaha, invariant "1 modul = 1
  // subscription" balik berlaku DALAM konteks itu — Record tetap aman
  // dipakai apa adanya, tidak perlu direstrukturisasi jadi array.
  const subRes = await fetch(`${apiUrl}/me/subscriptions`, { headers: { cookie }, cache: "no-store" });
  const subJson = subRes.ok
    ? ((await subRes.json()) as {
        subscriptions: { subscription: { dataUsahaId: string }; plan: { name: string; modules: string[] } }[];
      })
    : { subscriptions: [] };
  const activeSubscriptions = subJson.subscriptions.filter((s) => s.subscription.dataUsahaId === activeDataUsaha.id);
  const subscriptionModules = activeSubscriptions.length ? [...new Set(activeSubscriptions.flatMap((s) => s.plan.modules))] : undefined;
  // § diminta user 2026-09-05 — label sidebar "Import Data" ikut nama
  // paket yang admin buat (bukan nama fitur generik), supaya customer
  // langsung tahu link itu bagian paket apa yang mereka beli. Cuma
  // dipakai `Sidebar` buat OVERRIDE TEKS TAMPILAN — TIDAK mempengaruhi
  // filter modul (`subscriptionModules` di atas) sama sekali.
  const modulePlanNames = Object.fromEntries(activeSubscriptions.flatMap((s) => s.plan.modules.map((m) => [m, s.plan.name])));

  return (
    <AppShell
      surface="app"
      // § favicon (kotak, kecil), BUKAN company.logo — lihat catatan sama
      // di admin/(protected)/layout.tsx.
      logoUrl={settings["company.favicon"]?.["180"]}
      // § Fase 103 (2026-09-11) — logo header (Topbar) + footer copyright,
      // lihat catatan lengkap di admin/(protected)/layout.tsx.
      headerLogoUrl={settings["company.logo"]}
      headerLogoLinkUrl={settings["company.logoLinkUrl"]}
      companyName={settings["company.name"]}
      copyrightStartYear={settings["company.copyrightStartYear"]}
      appVersion={process.env.APP_VERSION}
      subscriptionModules={subscriptionModules}
      modulePlanNames={modulePlanNames}
      activeDataUsahaName={activeDataUsaha.name}
      isDataUsahaOwner={activeDataUsaha.isOwner}
      user={{ name: me.name, email: me.email }}
    >
      {children}
      <CustomerCareWidget />
    </AppShell>
  );
}
