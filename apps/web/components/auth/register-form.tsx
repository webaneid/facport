"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getSafeRedirect } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/auth/icon-input";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";

const schema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  return (
    // useSearchParams() WAJIB di-Suspense-boundary, pola sama login-form.tsx.
    <Suspense fallback={null}>
      <RegisterFormInner />
    </Suspense>
  );
}

// § architecture-subscription.md — jalur self-service. Verifikasi email
// WAJIB (§ lib/auth.ts `requireEmailVerification: true`) — signUp TIDAK
// langsung bikin sesi aktif, user harus klik link di email dulu.
//
// § Fase 48 — `redirect` (kalau ada, dibawa dari `?redirect=...` yang
// diteruskan `/login` § login-form.tsx) dikirim sebagai `callbackURL`
// mutlak (`window.location.origin` + path relatif tervalidasi) ke
// `signUp.email` — Better Auth simpan ini di link verifikasi email, DAN
// (dengan `autoSignInAfterVerification: true` § lib/auth.ts) redirect
// browser ke situ SETELAH auto-login berhasil pas user klik link. Jadi
// user yang pilih paket di landing → daftar → klik link email → LANGSUNG
// login & mendarat di `/subscribe?plans=...` dengan paket ke-preselect
// (§ subscribe/page.tsx), tidak perlu isi form login manual lagi.
// WAJIB absolute URL (`window.location.origin` + path, BUKAN path
// relatif polos) — link verifikasi di-generate & di-klik dari KONTEKS
// `apps/api` (origin beda dari `apps/web`), path relatif bakal resolve
// salah ke domain API, bukan ke surface app.
//
// Known limitation DEV LOKAL (`.localhost`): cookie sesi hasil
// auto-sign-in di atas di-set oleh `apps/api` (domain diklik langsung
// dari email, BUKAN lewat `api-proxy` seperti request browser biasa) —
// `crossSubDomainCookies` SENGAJA nonaktif khusus `.localhost` (§
// lib/auth.ts, `advanced.crossSubDomainCookies` — Chrome tolak diam-diam
// `Domain=.localhost`), jadi redirect ke `app.localhost:6209` TIDAK ikut
// bawa cookie sesi valid di dev — user akan kelihatan balik ke `/login`
// walau "auto-login"-nya sendiri sukses di sisi API. Production TIDAK
// kena batasan ini (`COOKIE_DOMAIN=.facport.com`, domain asli terdaftar)
// — alur ini WAJIB diverifikasi end-to-end di staging/production, bukan
// dev lokal.
function RegisterFormInner() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    const redirect = searchParams.get("redirect");
    const callbackURL = typeof window !== "undefined" ? `${window.location.origin}${getSafeRedirect(redirect)}` : undefined;
    const { error: signUpError } = await authClient.signUp.email({ ...values, callbackURL });
    if (signUpError) {
      setError(signUpError.message ?? "Pendaftaran gagal.");
      return;
    }
    setRegistered(true);
  }

  if (registered) {
    return (
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Pendaftaran berhasil — cek email kamu untuk link verifikasi sebelum bisa login.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full max-w-sm flex-col gap-3">
      <GoogleSignInButton />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        atau
        <div className="h-px flex-1 bg-border" />
      </div>
      <div>
        <IconInput icon={User} placeholder="Nama" {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <IconInput icon={Mail} type="email" placeholder="Email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <PasswordInput placeholder="Password" {...register("password")} />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">
        Daftar
      </Button>
    </form>
  );
}
