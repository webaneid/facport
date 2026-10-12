"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { IconInput } from "@/components/auth/icon-input";
import { E164_PATTERN } from "@/lib/phone";

// § Fase 189A, ADR-0044 — isian kontak milik AKUN manusia (BUKAN Data Usaha): Nama Perusahaan, Telepon, WhatsApp. Dipakai bersama form daftar
// (`register-form.tsx`) dan modal Lengkapi Profil (`profile-completion-gate.tsx`). Server TETAP memvalidasi ulang (`apps/api/src/lib/phone.ts`).

export type ContactValues = { companyName: string; phone: string; whatsapp: string };
export type ContactErrors = Partial<Record<keyof ContactValues, string>>;

export const EMPTY_CONTACT: ContactValues = { companyName: "", phone: "", whatsapp: "" };

export const contactSchema = z.object({
  companyName: z.string().trim().min(1, "Nama perusahaan wajib diisi").max(200, "Nama perusahaan maksimal 200 karakter"),
  phone: z.string().regex(E164_PATTERN, "Nomor telepon wajib diisi dengan benar"),
  whatsapp: z.string().regex(E164_PATTERN, "Nomor WhatsApp wajib diisi dengan benar"),
});

/** `null` bila sah; selain itu pesan galat per isian. */
export function validateContact(values: ContactValues): ContactErrors | null {
  const result = contactSchema.safeParse(values);
  if (result.success) return null;
  const errors: ContactErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ContactValues;
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function ContactFields({
  value,
  onChange,
  errors = {},
  disabled,
  showLabels = false,
}: {
  value: ContactValues;
  onChange: (next: ContactValues) => void;
  errors?: ContactErrors;
  disabled?: boolean;
  /** Modal memakai label terlihat; form daftar memakai placeholder seperti isian lain di halaman itu. */
  showLabels?: boolean;
}) {
  // Centang "sama dengan nomor telepon": awalnya aktif bila WhatsApp kosong atau sudah sama dengan telepon (user tak perlu mengetik dua kali).
  const [sameAsPhone, setSameAsPhone] = useState(() => !value.whatsapp || value.whatsapp === value.phone);

  function handlePhone(phone: string) {
    onChange({ ...value, phone, whatsapp: sameAsPhone ? phone : value.whatsapp });
  }

  function handleSame(checked: boolean) {
    setSameAsPhone(checked);
    if (checked) onChange({ ...value, whatsapp: value.phone });
  }

  const label = (text: string) => (showLabels ? <label className="mb-1 block text-sm font-medium text-foreground">{text}</label> : null);

  return (
    <div className="flex flex-col gap-3">
      <div>
        {label("Nama Perusahaan")}
        <IconInput
          icon={Building2}
          placeholder="Nama Perusahaan"
          aria-label="Nama Perusahaan"
          aria-invalid={!!errors.companyName || undefined}
          autoComplete="organization"
          maxLength={200}
          disabled={disabled}
          value={value.companyName}
          onChange={(e) => onChange({ ...value, companyName: e.target.value })}
        />
        {errors.companyName && <p className="mt-1 text-xs text-red-600">{errors.companyName}</p>}
      </div>
      <div>
        {label("Nomor Telepon")}
        <PhoneInput ariaLabel="Nomor telepon" value={value.phone} onChange={handlePhone} invalid={!!errors.phone} disabled={disabled} />
        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <Checkbox checked={sameAsPhone} onCheckedChange={(c) => handleSame(c === true)} disabled={disabled} aria-label="WhatsApp sama dengan nomor telepon" />
        WhatsApp sama dengan nomor telepon
      </label>
      {!sameAsPhone && (
        <div>
          {label("Nomor WhatsApp")}
          <PhoneInput ariaLabel="Nomor WhatsApp" value={value.whatsapp} onChange={(whatsapp) => onChange({ ...value, whatsapp })} invalid={!!errors.whatsapp} disabled={disabled} />
        </div>
      )}
      {errors.whatsapp && <p className="-mt-1 text-xs text-red-600">{errors.whatsapp}</p>}
    </div>
  );
}
