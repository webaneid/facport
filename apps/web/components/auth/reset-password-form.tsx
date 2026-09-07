"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";

const schema = z
  .object({
    newPassword: z.string().min(8, "Password minimal 8 karakter"),
    confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof schema>;

// § diminta user 2026-09-05 — halaman tujuan link email "Reset password
// Facport" (§ lib/auth.ts `sendResetPassword`). `token` datang dari
// query string (`?token=...`, ditambahkan Better Auth sendiri saat
// redirect dari `/api/auth/reset-password/:token` ke `redirectTo` yang
// dikirim `ForgotPasswordForm`) — WAJIB Suspense boundary sama seperti
// `LoginForm` (`useSearchParams()`).
export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Link reset password tidak valid atau sudah kadaluarsa — minta link baru lewat halaman{" "}
        <Link href="/forgot-password" className="font-medium text-primary-600 hover:text-primary-700">
          Lupa Password
        </Link>
        .
      </p>
    );
  }

  async function onSubmit(values: FormValues) {
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword: values.newPassword, token: token! });
    if (resetError) {
      setError("Link sudah kadaluarsa atau tidak valid — minta link baru.");
      return;
    }
    router.push("/login");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full max-w-sm flex-col gap-3">
      <div>
        <PasswordInput placeholder="Password Baru" {...register("newPassword")} />
        {errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>}
      </div>
      <div>
        <PasswordInput placeholder="Konfirmasi Password Baru" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">
        Simpan Password Baru
      </Button>
    </form>
  );
}
