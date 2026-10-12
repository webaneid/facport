"use client";

import { MessageCircle } from "lucide-react";
import { TruncateText } from "@/components/ui/truncate-text";
import { displayPhone, telLink, waLink } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { typeLabel, type OwnerContactInfo } from "@/lib/insights";

// § Fase 189D — sel kontak ringkas (nama, perusahaan, telepon, tombol WhatsApp). Tautan `tel:`/`wa.me` HANYA dari nilai E.164 tervalidasi
// (`telLink`/`waLink`); nomor kosong/tak sah → tanpa tautan. Teks dari DB dirender sebagai teks React.
export function WhatsAppButton({ whatsapp, phone, name }: { whatsapp: string | null; phone: string | null; name: string }) {
  const href = waLink(whatsapp ?? phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat WhatsApp ${name}`}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground hover:bg-muted"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      WhatsApp
    </a>
  );
}

export function PhoneLink({ phone }: { phone: string | null }) {
  const tel = telLink(phone);
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return tel ? (
    <a href={tel} className="text-sm text-foreground hover:underline">
      {displayPhone(phone)}
    </a>
  ) : (
    <span className="text-sm">{phone}</span>
  );
}

export function OwnerSummary({ owner, internalReason }: { owner: OwnerContactInfo; internalReason?: "flag" | "role" | null }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <TruncateText className="font-medium">{owner.name}</TruncateText>
        {internalReason ? <Badge variant="primary">{typeLabel(internalReason)}</Badge> : null}
      </div>
      <TruncateText className="text-xs text-muted-foreground">{owner.companyName || owner.email}</TruncateText>
    </div>
  );
}

export function ContactCell({ owner }: { owner: OwnerContactInfo }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <PhoneLink phone={owner.phone} />
      <WhatsAppButton whatsapp={owner.whatsapp} phone={owner.phone} name={owner.name} />
    </div>
  );
}
