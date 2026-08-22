"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
type FormValues = z.infer<typeof schema>;

// § architecture-subscription.md — jalur self-service. Verifikasi email
// WAJIB (§ lib/auth.ts `requireEmailVerification: true`) — signUp TIDAK
// langsung bikin sesi aktif, user harus klik link di email dulu sebelum
// bisa login. Setelah verifikasi + login, user pilih paket & checkout
// (belum diarahkan otomatis di Fase 01, provider payment belum final —
// lihat Known Limitations).
export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    const { error: signUpError } = await authClient.signUp.email(values);
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
      <div>
        <Input placeholder="Nama" {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <Input type="email" placeholder="Email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <Input type="password" placeholder="Password" {...register("password")} />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Memproses..." : "Daftar"}
      </Button>
    </form>
  );
}
