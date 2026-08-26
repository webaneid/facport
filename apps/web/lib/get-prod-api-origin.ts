// Base URL API buat kode yang jalan DI BROWSER saat production — diturunkan
// dari hostname saat ini (window.location), BUKAN process.env.NEXT_PUBLIC_API_URL.
//
// Next.js nge-bake process.env.NEXT_PUBLIC_* ke bundle client SAAT BUILD
// (bukan dibaca ulang saat container jalan) — ketemu 2026-08-27 pas domain
// sementara presentasi (ane.web.id) beda dari yang ada di image (kosong
// waktu di-build di CI), sign-in browser gagal ("localhost:3001 connection
// refused") walau .env.production di server sudah benar. Detail lengkap →
// docs/lessons-learned.md.
//
// Subdomain "api" berbagi base domain yang sama dengan frontend/admin/app
// di semua environment (§ architecture-domain-routing.md) — cukup ganti
// label pertama hostname jadi "api", jalan di domain apa pun (ane.web.id
// sekarang, facport.com nanti) tanpa perlu tahu domainnya di build time,
// SATU image bisa dipakai ulang lintas environment tanpa rebuild.
export function getProdApiOrigin(): string {
  const { protocol, hostname } = window.location;
  const parts = hostname.split(".");
  parts[0] = "api";
  return `${protocol}//${parts.join(".")}`;
}
