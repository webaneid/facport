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
import { ContactFields, validateContact, type ContactErrors, type ContactValues } from "@/components/profile/contact-fields";

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

type MeData = { name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null };

const toContact = (me: MeData): ContactValues => ({ companyName: me.companyName ?? "", phone: me.phone ?? "", whatsapp: me.whatsapp ?? "" });
const sameContact = (a: ContactValues, b: ContactValues) => a.companyName === b.companyName && a.phone === b.phone && a.whatsapp === b.whatsapp;
const isBlankContact = (c: ContactValues) => !c.companyName.trim() && !c.phone && !c.whatsapp;

// § Fase 189I — Data Diri: Nama (Better Auth `updateUser`), Email (baca saja), Nama Perusahaan / Telepon / WhatsApp (`PATCH /me/contact`, validasi +
// normalisasi E.164 diulang di server). Satu tombol Simpan, tetapi dua penulisan terpisah: kegagalan nama tidak menyembunyikan hasil kontak. Kontak
// dikirim hanya bila berubah; kontak yang masih kosong dan tidak disentuh (akun admin/staf) tidak memaksa validasi — nama tetap bisa disimpan.
function DataDiriCard({ me }: { me: MeData }) {
  const [saved, setSaved] = useState<{ name: string; contact: ContactValues }>({ name: me.name, contact: toContact(me) });
  const [name, setName] = useState(me.name);
  const [contact, setContact] = useState<ContactValues>(toContact(me));
  const [nameError, setNameError] = useState<string | null>(null);
  const [contactErrors, setContactErrors] = useState<ContactErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSuccess(false);

    const nameChanged = name.trim() !== saved.name;
    const contactChanged = !sameContact(contact, saved.contact);
    const touchContact = contactChanged && !(isBlankContact(contact) && isBlankContact(saved.contact));

    const nameInvalid = !name.trim();
    const clientErrors = touchContact ? validateContact(contact) : null;
    setNameError(nameInvalid ? "Nama wajib diisi" : null);
    setContactErrors(clientErrors ?? {});
    if (nameInvalid || clientErrors) return;

    setSaving(true);
    let ok = true;
    const next = { ...saved };
    if (nameChanged) {
      const { error } = await authClient.updateUser({ name: name.trim() });
      if (error) {
        ok = false;
        setServerError(error.message ?? "Gagal memperbarui nama.");
      } else next.name = name.trim();
    }
    if (touchContact) {
      const { error } = await api.me.contact.patch(contact);
      if (error) {
        ok = false;
        const field = (error.value as { field?: keyof ContactValues } | undefined)?.field;
        if (field) setContactErrors({ [field]: "Data ini tidak valid, periksa kembali." });
        else setServerError((prev) => prev ?? "Gagal menyimpan kontak, coba lagi beberapa saat lagi.");
      } else next.contact = contact;
    }
    setSaving(false);
    setSaved(next);
    if (ok) setSuccess(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-primary-600" />
          <CardTitle>Data Diri</CardTitle>
        </div>
        <CardDescription>Dipakai tim kami untuk menghubungi kamu bila ada kendala atau informasi penting.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <FormField label="Nama" error={nameError ?? undefined}>
            <Input aria-label="Nama" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} autoComplete="name" />
          </FormField>
          <FormField label="Email" hint="Tidak bisa diubah sendiri, hubungi admin.">
            <Input aria-label="Email" value={me.email} readOnly disabled />
          </FormField>
          <ContactFields value={contact} onChange={setContact} errors={contactErrors} disabled={saving} showLabels />
          {serverError && (
            <p role="alert" className="text-sm text-red-600">
              {serverError}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-green-700">
              Data diri tersimpan.
            </p>
          )}
          <Button type="submit" loading={saving} className="self-start">
            Simpan Data Diri
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// § Fase 22, ADR-0023 — user dropdown sebelumnya cuma "Logout", belum ada
// akses akun mandiri sama sekali. Reuse endpoint Better Auth BAWAAN
// (`change-password`, `update-user` via `authClient`) — TIDAK ada
// endpoint baru ditulis di apps/api fase ini. Dipakai di 2 surface
// (admin & app) lewat page.tsx tipis masing-masing — § proxy.ts rewrite
// `/${surface}${pathname}` mensyaratkan 1 file page.tsx PER surface untuk
// URL path yang sama, tidak bisa 1 file dipakai lintas route group Next.js.
export function ProfileSettings() {
  const [me, setMe] = useState<MeData | null>(null);

  useEffect(() => {
    async function load() {
      const res = await api.me.get();
      if (res.data) setMe(res.data as unknown as MeData);
    }
    load();
  }, []);

  const passwordForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

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
      <PageHeader title="Profil" description="Kelola data diri & password login kamu." />

      <DataDiriCard me={me} />

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
