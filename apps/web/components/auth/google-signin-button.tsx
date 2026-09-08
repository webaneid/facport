"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { getSafeRedirect } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";

// § Fase 62 — logo resmi Google "G" (4 warna), inline SVG statis —
// TIDAK nambah dependency icon library baru cuma untuk 1 logo brand
// (`lucide-react` generic, tidak punya logo pihak ketiga).
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.84Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.11C3.25 21.3 7.31 24 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.61H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

// § dipakai `login-form.tsx` DAN `register-form.tsx` — 1 aksi yang sama
// persis (Google OAuth berfungsi ganda sebagai login/register: akun
// baru otomatis dibuat kalau email belum terdaftar, § ADR-0030).
// `callbackURL` pola SAMA PERSIS `register-form.tsx` (preselect paket
// dari landing, `?plans=...`, Fase 48, TETAP jalan lewat Google juga).
export function GoogleSignInButton() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const redirect = searchParams.get("redirect");
    const callbackURL = `${window.location.origin}${getSafeRedirect(redirect)}`;
    await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: `${window.location.origin}/login?error=google` });
    // § navigasi browser penuh (redirect ke Google) terjadi di dalam
    // signIn.social() — `setLoading(false)` SENGAJA tidak dipanggil di
    // sini, halaman akan pindah sebelum sempat re-render.
  }

  return (
    <Button type="button" variant="outline" loading={loading} onClick={handleClick} className="w-full">
      <GoogleLogo />
      Lanjutkan dengan Google
    </Button>
  );
}
