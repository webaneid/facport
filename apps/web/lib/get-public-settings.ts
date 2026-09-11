// § Fase 12, ADR-0017 — dipanggil dari root layout (favicon, semua surface)
// dan layout admin/app (logo di AppShell). Data ini PUBLIK (allowlist
// server-side di `GET /settings/public`, § architecture-settings.md),
// TIDAK butuh cookie sesi — aman di-cache lebih lama dari fetch `/me`
// yang WAJIB selalu fresh (`cache: "no-store"`).
export type PublicSettings = {
  "company.name"?: string;
  "company.logo"?: string;
  // § Fase 103 (2026-09-11) — `company.logo` SEKARANG JUGA dirender di
  // Topbar (header, § app-shell.tsx), reuse field lama Fase 12 yang
  // sejak 2026-09-07 tidak dipakai di sidebar (diganti company.favicon).
  // `logoLinkUrl` = URL tujuan saat logo header diklik (opsional).
  "company.logoLinkUrl"?: string;
  "company.favicon"?: Record<string, string>;
  // § Fase 43 (audit timezone 2026-09-06) — dipakai `CompanyTimezoneProvider`
  // di root layout, supaya format tanggal konsisten dengan setting admin
  // di SEMUA surface (termasuk halaman publik tanpa login).
  "company.timezone"?: string;
  // § Fase 103 — tahun mulai footer copyright (§ app-shell/footer.tsx).
  "company.copyrightStartYear"?: number;
};

export async function getPublicSettings(): Promise<PublicSettings> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/settings/public`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    return (await res.json()) as PublicSettings;
  } catch {
    // § branding gagal dimuat TIDAK boleh menjatuhkan seluruh halaman —
    // fallback ke tanpa logo/favicon custom (wordmark teks, favicon default).
    return {};
  }
}
