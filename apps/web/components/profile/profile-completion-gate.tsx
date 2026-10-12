"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api-client";
import { ContactFields, validateContact, type ContactErrors, type ContactValues } from "@/components/profile/contact-fields";

// § Fase 189A, ADR-0044 — modal Lengkapi Profil: dipasang di layout pelanggan HANYA bila `GET /me` melapor `profileComplete=false` (Nama Perusahaan /
// Telepon / WhatsApp ada yang kosong: akun Google, user lama, akun tambahan hasil undangan). TIDAK BISA DITUTUP (tanpa tombol X, ESC, atau klik luar) sampai
// tersimpan; satu-satunya jalan lain adalah Keluar. Ini hanya lapisan tampilan — TIDAK memblokir API, jadi import yang sedang berjalan tidak terganggu.
export function ProfileCompletionGate({ initial }: { initial: ContactValues }) {
  const router = useRouter();
  const [value, setValue] = useState<ContactValues>(initial);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const clientErrors = validateContact(value);
    setErrors(clientErrors ?? {});
    if (clientErrors) return;

    setSaving(true);
    const { error } = await api.me.contact.patch(value);
    setSaving(false);
    if (error) {
      const field = (error.value as { field?: keyof ContactValues } | undefined)?.field;
      if (field) setErrors({ [field]: "Data ini tidak valid, periksa kembali." });
      else setServerError("Gagal menyimpan, coba lagi beberapa saat lagi.");
      return;
    }
    setDone(true);
    router.refresh(); // layout server membaca ulang /me → profileComplete=true → modal tidak dirender lagi
  }

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  if (done) return null;

  return (
    <Dialog open>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Lengkapi Profil Anda</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Isi nama perusahaan dan nomor telepon agar tim kami bisa menghubungi Anda bila ada kendala atau informasi penting. Data ini melekat pada akun Anda.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
          <ContactFields value={value} onChange={setValue} errors={errors} disabled={saving} showLabels />
          {serverError && (
            <p role="alert" className="text-sm text-red-600">
              {serverError}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={handleLogout} disabled={saving} className="text-sm text-muted-foreground underline hover:text-foreground disabled:opacity-50">
              Keluar
            </button>
            <Button type="submit" loading={saving}>
              Simpan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
