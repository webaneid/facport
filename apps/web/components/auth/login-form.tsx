"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getSafeRedirect } from "@/lib/safe-redirect";
import { clearActiveDataUsahaCookie } from "@/lib/active-data-usaha-cookie";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/auth/icon-input";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";

const schema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});
type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  return (
    // useSearchParams() WAJIB di-Suspense-boundary, kalau tidak `next build`
    // gagal prerender (bailout error) — bukan cuma dev-only warning.
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  );
}

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // § 2026-10-07 — email belum terverifikasi: tawarkan kirim ulang link verifikasi (dulu tersamar jadi "Email atau password salah").
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    setUnverifiedEmail(null);
    setResendInfo(null);
    const { error: signInError } = await authClient.signIn.email(values);
    if (signInError) {
      // § 2026-10-07 (laporan client: ganti password 2× tapi "selalu salah") — SEMUA kegagalan dulu dipukul rata jadi "Email atau password salah.", padahal
      // password bisa saja benar dan penyebabnya email belum terverifikasi / akun dinonaktifkan / terlalu banyak percobaan. Pesan sekarang sesuai penyebab.
      const failure = signInError as { status?: number; code?: string };
      if (failure.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(values.email);
        setError("Email kamu belum diverifikasi. Klik link verifikasi di email pendaftaran, atau kirim ulang link-nya di bawah ini.");
      } else if (failure.code === "ACCOUNT_DISABLED") {
        setError("Akun ini dinonaktifkan. Hubungi admin untuk bantuan.");
      } else if (failure.status === 429 || failure.code === "TOO_MANY_REQUESTS") {
        setError("Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.");
      } else if (typeof failure.status === "number" && failure.status >= 500) {
        setError("Server sedang bermasalah. Coba lagi beberapa saat lagi.");
      } else {
        setError("Email atau password salah.");
      }
      return;
    }
    // § diminta user 2026-10-02 — SETIAP login WAJIB lewat gerbang
    // /pilih-usaha dulu, lihat komentar lengkap di `clearActiveDataUsahaCookie`.
    clearActiveDataUsahaCookie();
    router.push(getSafeRedirect(searchParams.get("redirect")));
    router.refresh();
  }

  async function handleResendVerification() {
    if (!unverifiedEmail) return;
    setResending(true);
    const callbackURL = typeof window !== "undefined" ? `${window.location.origin}${getSafeRedirect(searchParams.get("redirect"))}` : undefined;
    const { error: resendError } = await authClient.sendVerificationEmail({ email: unverifiedEmail, callbackURL });
    setResending(false);
    setResendInfo(
      resendError
        ? "Gagal mengirim ulang email verifikasi — coba lagi beberapa saat lagi."
        : "Link verifikasi baru sudah dikirim — cek inbox dan folder spam, lalu klik link-nya.",
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
        <IconInput icon={Mail} type="email" placeholder="Email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <PasswordInput placeholder="Password" {...register("password")} />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {unverifiedEmail && (
        <div className="flex flex-col gap-1.5">
          <Button type="button" variant="outline" loading={resending} onClick={handleResendVerification} className="w-full">
            Kirim ulang email verifikasi
          </Button>
          {resendInfo && <p className="text-xs text-muted-foreground">{resendInfo}</p>}
        </div>
      )}
      <Button type="submit" loading={isSubmitting} className="w-full">
        Login
      </Button>
      <Link href="/forgot-password" className="text-center text-xs text-muted-foreground hover:text-foreground">
        Lupa password?
      </Link>
    </form>
  );
}
