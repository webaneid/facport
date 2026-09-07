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
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/auth/icon-input";
import { PasswordInput } from "@/components/auth/password-input";

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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    const { error: signInError } = await authClient.signIn.email(values);
    if (signInError) {
      setError("Email atau password salah.");
      return;
    }
    router.push(getSafeRedirect(searchParams.get("redirect")));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full max-w-sm flex-col gap-3">
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
        Login
      </Button>
      <Link href="/forgot-password" className="text-center text-xs text-muted-foreground hover:text-foreground">
        Lupa password?
      </Link>
    </form>
  );
}
