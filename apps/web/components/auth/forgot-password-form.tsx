"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/auth/icon-input";

const schema = z.object({ email: z.string().email("Email tidak valid") });
type FormValues = z.infer<typeof schema>;

// § diminta user 2026-09-05 — jalur pemulihan password mandiri (belum
// ada sama sekali sebelumnya). Pesan sukses SENGAJA GENERIK ("kalau
// email ini terdaftar...") — sama seperti response server Better Auth
// sendiri (`{status:true, message:"If this email exists..."}") — TIDAK
// membedakan email terdaftar/tidak, mencegah enumerasi akun.
export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Kalau email ini terdaftar, link untuk atur password baru sudah dikirim — cek inbox (atau folder spam) kamu.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full max-w-sm flex-col gap-3">
      <div>
        <IconInput icon={Mail} type="email" placeholder="Email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Kirim Link Reset Password
      </Button>
    </form>
  );
}
