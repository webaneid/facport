// § Fase 103 (2026-09-11) — footer copyright di area putih (panel
// konten), dua surface (admin & app). Presentational murni — nilai
// (nama perusahaan, tahun mulai, versi aplikasi) SUDAH di-resolve di
// Server Component layout (§ app/admin/(protected)/layout.tsx,
// app/app/(protected)/layout.tsx) dan diteruskan sebagai props biasa,
// BUKAN fetch sendiri di sini.
export function Footer({
  companyName,
  copyrightStartYear,
  appVersion,
}: {
  companyName?: string;
  copyrightStartYear?: number;
  appVersion?: string;
}) {
  const currentYear = new Date().getFullYear();
  // § kalau admin belum isi tahun mulai, cukup tampilkan tahun sekarang
  // saja (tanpa rentang) — bukan asumsi tahun mulai sembarangan.
  const yearLabel =
    copyrightStartYear && copyrightStartYear !== currentYear ? `${copyrightStartYear} - ${currentYear}` : String(copyrightStartYear ?? currentYear);
  // § tag git selalu berawalan "v" (mis. "v1.27.2") — footer tampilkan
  // angka polos ("1.27.2") sesuai contoh yang diminta user. "dev"/
  // "staging" (§ Dockerfile/deploy-staging.yml) dibiarkan apa adanya.
  const versionLabel = appVersion ? appVersion.replace(/^v/, "") : "dev";

  return (
    <footer className="border-t border-admin-line px-4 py-3 text-center text-xs text-admin-muted sm:px-6">
      © Copyright {yearLabel} {companyName || "Facport"} - Facport versi: {versionLabel}
    </footer>
  );
}
