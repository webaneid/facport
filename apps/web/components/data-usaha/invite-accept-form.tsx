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

type Preview = { email: string; primaryUserName: string; dataUsahaName: string; emailAlreadyRegistered: boolean };

const acceptSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
type AcceptFormValues = z.infer<typeof acceptSchema>;

// § Fase 110, architecture-user-tambahan.md — 2 jalur penerimaan:
// 1. Email BELUM py akun — form set nama+password, bikin akun baru, LALU
//    login otomatis (client-side `authClient.signIn.email`, § alasan di
//    komentar `handleAcceptNew` — `auth.api.signUpEmail()` server-side di
//    `routes/invites.route.ts` TIDAK set cookie sesi browser).
// 2. Email SUDAH py akun — WAJIB login dulu (sendiri, lewat `/login`
//    biasa) baru bisa klik "Terima", supaya invite tidak bisa diklaim
//    akun lain yang kebetulan sedang login di browser yang sama.
export function InviteAcceptForm({ token }: { token: string }) {
  return (
    // useSearchParams() (dipakai GoogleSignInButton) WAJIB di-Suspense-boundary,
    // pola sama login-form.tsx/register-form.tsx.
    <Suspense fallback={null}>
      <InviteAcceptFormInner token={token} />
    </Suspense>
  );
}

function InviteAcceptFormInner({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null | "not_found">(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null | undefined>(undefined);
  const form = useForm<AcceptFormValues>({ resolver: zodResolver(acceptSchema) });

  useEffect(() => {
    async function load() {
      const [previewRes, meRes] = await Promise.all([api.invites({ token }).get(), api.me.get()]);
      setPreview(previewRes.error ? "not_found" : (previewRes.data as unknown as Preview));
      setCurrentUserEmail(meRes.error ? null : (meRes.data as unknown as { email: string }).email);
    }
    load();
  }, [token]);

  async function handleAcceptNew(values: AcceptFormValues) {
    const res = await api.invites({ token }).accept.post(values);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(
        code === "EMAIL_ALREADY_REGISTERED" ? "Email ini sudah terdaftar — silakan login dulu." : "Gagal menerima undangan. Coba lagi.",
      );
      return;
    }
    // § akun baru dibuat server-side TANPA sesi browser — login manual
    // client-side supaya cookie sesi BENAR ter-set (pola sama alur
    // register biasa, § components/auth/register-form.tsx).
    const { error: signInError } = await authClient.signIn.email({ email: (preview as Preview).email, password: values.password });
    if (signInError) {
      toast.success("Akun dibuat — silakan login.");
      router.push("/login");
      return;
    }
    toast.success("Undangan diterima! Selamat datang di Facport.");
    router.push("/");
    router.refresh();
  }

  async function handleAcceptExisting() {
    const res = await api.invites({ token })["accept-existing"].post();
    if (res.error) {
      toast.error("Gagal menerima undangan. Coba lagi.");
      return;
    }
    toast.success("Undangan diterima!");
    router.push("/");
    router.refresh();
  }

  async function handleLogoutAndRelogin() {
    await authClient.signOut();
    router.push(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`);
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
    return <p className="text-center text-sm text-muted-foreground">Undangan ini tidak valid atau sudah kadaluarsa.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-foreground">
        <strong>{preview.primaryUserName || "Seseorang"}</strong> mengundangmu sebagai User Tambahan untuk Data Usaha{" "}
        <strong>{preview.dataUsahaName}</strong>.
      </p>

      {preview.emailAlreadyRegistered ? (
        currentUserEmail && currentUserEmail.toLowerCase() === preview.email.toLowerCase() ? (
          <Button onClick={handleAcceptExisting} className="w-full">
            Terima Undangan
          </Button>
        ) : currentUserEmail ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Undangan ini untuk <strong>{preview.email}</strong>, tapi kamu sedang login sebagai <strong>{currentUserEmail}</strong>.
            </p>
            <Button variant="outline" onClick={handleLogoutAndRelogin} className="w-full">
              Logout &amp; Login sebagai {preview.email}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-sm text-muted-foreground">Email ini sudah punya akun Facport — login dulu untuk menerima undangan.</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
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
              Buat Akun &amp; Terima Undangan
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
