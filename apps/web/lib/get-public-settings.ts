// § Fase 12, ADR-0017 — dipanggil dari root layout (favicon, semua surface)
// dan layout admin/app (logo di AppShell). Data ini PUBLIK (allowlist
// server-side di `GET /settings/public`, § architecture-settings.md),
// TIDAK butuh cookie sesi — aman di-cache lebih lama dari fetch `/me`
// yang WAJIB selalu fresh (`cache: "no-store"`).
export type PublicSettings = {
  "company.name"?: string;
  "company.logo"?: string;
  "company.favicon"?: Record<string, string>;
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
