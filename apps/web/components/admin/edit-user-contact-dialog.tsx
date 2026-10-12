"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { ContactFields, validateContact, type ContactErrors, type ContactValues } from "@/components/profile/contact-fields";

// § Fase 189A, ADR-0044 — Super Admin (`users.manage`) mengoreksi kontak AKUN pelanggan (mis. salah ketik). Pemanggil membungkus dengan `<Can>`; endpoint
// `PATCH /admin/users/:id/contact` tetap menjaga izinnya dan mencatat nilai lama→baru di audit log.
export function EditUserContactDialog({ userId, initial, onSaved }: { userId: string; initial: ContactValues; onSaved: (values: ContactValues) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ContactValues>(initial);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setValue(initial);
      setErrors({});
      setServerError(null);
    }
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const clientErrors = validateContact(value);
    setErrors(clientErrors ?? {});
    if (clientErrors) return;
    setSaving(true);
    const { data, error } = await api.admin.users({ id: userId }).contact.patch(value);
    setSaving(false);
    const saved = data && "phone" in data ? data : null; // Eden mengetik respons sebagai gabungan semua cabang (termasuk {code}); persempit ke bentuk sukses
    if (error || !saved) {
      const field = (error?.value as { field?: keyof ContactValues } | undefined)?.field;
      if (field) setErrors({ [field]: "Data ini tidak valid, periksa kembali." });
      else setServerError("Gagal menyimpan, coba lagi.");
      return;
    }
    onSaved({ companyName: saved.companyName, phone: saved.phone, whatsapp: saved.whatsapp });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Ubah kontak
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Ubah kontak akun</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Koreksi data kontak milik akun ini. Perubahan tercatat di riwayat audit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">
          <ContactFields value={value} onChange={setValue} errors={errors} disabled={saving} showLabels />
          {serverError && (
            <p role="alert" className="text-sm text-red-600">
              {serverError}
            </p>
          )}
          <DialogFooter className="mt-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
