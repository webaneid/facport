import { MessageCircle, Phone, Building2 } from "lucide-react";
import { displayPhone, waLink } from "@/lib/phone";

// § Fase 189A, ADR-0044 — tampilan kontak AKUN di detail user admin. WhatsApp = tautan `wa.me` dari nilai E.164 ASLI (`waLink`, tidak pernah dari hasil
// `displayPhone`), tab baru, supaya admin bisa langsung chat lewat WhatsApp Web/Desktop. Nomor tidak sah/kosong → tanpa tautan ("Belum diisi").
export function UserContactCardContent({ companyName, phone, whatsapp }: { companyName: string | null; phone: string | null; whatsapp: string | null }) {
  const wa = waLink(whatsapp);
  const empty = <span className="text-muted-foreground">Belum diisi</span>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Nama Perusahaan
        </dt>
        <dd className="mt-0.5 break-words text-foreground">{companyName ? companyName : empty}</dd>
      </div>
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5" /> Telepon
        </dt>
        <dd className="mt-0.5 text-foreground">
          {phone ? (
            <a href={`tel:${phone}`} className="hover:underline">
              {displayPhone(phone)}
            </a>
          ) : (
            empty
          )}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </dt>
        <dd className="mt-0.5 text-foreground">
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Chat WhatsApp ${displayPhone(whatsapp)}`} className="font-medium text-primary-700 hover:underline">
              {displayPhone(whatsapp)}
            </a>
          ) : (
            empty
          )}
        </dd>
      </div>
    </dl>
  );
}
