"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";

type Preview = { email: string; fromUserName: string; dataUsahaName: string; emailAlreadyRegistered: boolean };

const acceptSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
type AcceptFormValues = z.infer<typeof acceptSchema>;

// § Fase 111, architecture-user-tambahan.md — struktur SAMA PERSIS
// `invite-accept-form.tsx` (Fase 110): 2 jalur penerimaan (akun baru via
// signup+auto-login client-side, akun existing via login manual dulu).
export function TransferAcceptForm({ token }: { token: string }) {
  return (
    <Suspense fallback={null}>
      <TransferAcceptFormInner token={token} />
    </Suspense>
  );
}

function TransferAcceptFormInner({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null | "not_found">(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null | undefined>(undefined);
  const form = useForm<AcceptFormValues>({ resolver: zodResolver(acceptSchema) });

  useEffect(() => {
    async function load() {
      const [previewRes, meRes] = await Promise.all([api.transfers({ token }).get(), api.me.get()]);
      setPreview(previewRes.error ? "not_found" : (previewRes.data as unknown as Preview));
      setCurrentUserEmail(meRes.error ? null : (meRes.data as unknown as { email: string }).email);
    }
    load();
  }, [token]);

  async function handleAcceptNew(values: AcceptFormValues) {
    const res = await api.transfers({ token }).accept.post(values);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(code === "EMAIL_ALREADY_REGISTERED" ? "Email ini sudah terdaftar — silakan login dulu." : "Gagal menerima transfer. Coba lagi.");
      return;
    }
    const { error: signInError } = await authClient.signIn.email({ email: (preview as Preview).email, password: values.password });
    if (signInError) {
      toast.success("Akun dibuat — silakan login.");
      router.push("/login");
      return;
    }
    toast.success("Transfer diterima! Selamat datang di Facport.");
    router.push("/");
    router.refresh();
  }

  async function handleAcceptExisting() {
    const res = await api.transfers({ token })["accept-existing"].post();
    if (res.error) {
      toast.error("Gagal menerima transfer. Coba lagi.");
      return;
    }
    toast.success("Transfer diterima!");
    router.push("/");
    router.refresh();
  }

  async function handleLogoutAndRelogin() {
    await authClient.signOut();
    router.push(`/login?redirect=${encodeURIComponent(`/transfer/${token}`)}`);
  }

  if (preview === null || currentUserEmail === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (preview === "not_found") {
    return <p className="text-center text-sm text-muted-foreground">Transfer ini tidak valid atau sudah kadaluarsa.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-foreground">
        <strong>{preview.fromUserName || "Seseorang"}</strong> ingin memindahkan kepemilikan Data Usaha{" "}
        <strong>{preview.dataUsahaName}</strong> ke kamu.
      </p>

      {preview.emailAlreadyRegistered ? (
        currentUserEmail && currentUserEmail.toLowerCase() === preview.email.toLowerCase() ? (
          <Button onClick={handleAcceptExisting} className="w-full">
            Terima Kepemilikan
          </Button>
        ) : currentUserEmail ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Transfer ini untuk <strong>{preview.email}</strong>, tapi kamu sedang login sebagai <strong>{currentUserEmail}</strong>.
            </p>
            <Button variant="outline" onClick={handleLogoutAndRelogin} className="w-full">
              Logout &amp; Login sebagai {preview.email}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-sm text-muted-foreground">Email ini sudah punya akun Facport — login dulu untuk menerima transfer.</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/transfer/${token}`)}`}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
            >
              Login
            </Link>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <GoogleSignInButton />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            atau
            <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={form.handleSubmit(handleAcceptNew)} className="flex flex-col gap-3">
            <FormField label="Nama" error={form.formState.errors.name?.message}>
              <Input autoFocus placeholder="Nama lengkap" {...form.register("name")} />
            </FormField>
            <FormField label="Password" error={form.formState.errors.password?.message} hint="Minimal 8 karakter.">
              <Input type="password" {...form.register("password")} />
            </FormField>
            <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
              Buat Akun &amp; Terima Kepemilikan
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
