"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, User as UserIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api-client";

const nameSchema = z.object({ name: z.string().min(1, "Nama wajib diisi") });
type NameFormValues = z.infer<typeof nameSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
    confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;

// § Fase 22, ADR-0023 — user dropdown sebelumnya cuma "Logout", belum ada
// akses akun mandiri sama sekali. Reuse endpoint Better Auth BAWAAN
// (`change-password`, `update-user` via `authClient`) — TIDAK ada
// endpoint baru ditulis di apps/api fase ini. Dipakai di 2 surface
// (admin & app) lewat page.tsx tipis masing-masing — § proxy.ts rewrite
// `/${surface}${pathname}` mensyaratkan 1 file page.tsx PER surface untuk
// URL path yang sama, tidak bisa 1 file dipakai lintas route group Next.js.
export function ProfileSettings() {
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await api.me.get();
      if (res.data) setMe(res.data as unknown as { name: string; email: string });
    }
    load();
  }, []);

  const nameForm = useForm<NameFormValues>({ resolver: zodResolver(nameSchema), values: me ? { name: me.name } : undefined });
  const passwordForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  async function onSaveName(values: NameFormValues) {
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      toast.error(error.message ?? "Gagal memperbarui nama.");
      return;
    }
    toast.success("Nama berhasil diperbarui.");
  }

  // § revokeOtherSessions: true — keputusan sengaja (§ phase doc Keputusan
  // Kecil): password baru berarti sesi LAMA di perangkat lain (termasuk
  // yang mungkin bocor/dipakai orang lain) langsung tidak valid lagi,
  // konsisten dengan tujuan ganti password itu sendiri.
  async function onChangePassword(values: PasswordFormValues) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      toast.error(error.message ?? "Gagal mengubah password — cek password saat ini.");
      return;
    }
    toast.success("Password berhasil diubah. Sesi di perangkat lain sudah keluar otomatis.");
    passwordForm.reset();
  }

  if (!me) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Profil" description="Kelola nama akun & password login kamu." />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-primary-600" />
            <CardTitle>Profil</CardTitle>
          </div>
          <CardDescription>Email: {me.email} (tidak bisa diubah sendiri, hubungi admin).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={nameForm.handleSubmit(onSaveName)} className="flex flex-col gap-3">
            <FormField label="Nama" error={nameForm.formState.errors.name?.message}>
              <Input {...nameForm.register("name")} />
            </FormField>
            <Button type="submit" loading={nameForm.formState.isSubmitting} className="self-start">
              Simpan Nama
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary-600" />
            <CardTitle>Ganti Password</CardTitle>
          </div>
          <CardDescription>Mengubah password akan mengeluarkan sesi login di perangkat lain.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="flex flex-col gap-3">
            <FormField label="Password Saat Ini" error={passwordForm.formState.errors.currentPassword?.message}>
              <Input type="password" {...passwordForm.register("currentPassword")} />
            </FormField>
            <FormField label="Password Baru" error={passwordForm.formState.errors.newPassword?.message}>
              <Input type="password" {...passwordForm.register("newPassword")} />
            </FormField>
            <FormField label="Konfirmasi Password Baru" error={passwordForm.formState.errors.confirmPassword?.message}>
              <Input type="password" {...passwordForm.register("confirmPassword")} />
            </FormField>
            <Button type="submit" loading={passwordForm.formState.isSubmitting} className="self-start">
              Ganti Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
