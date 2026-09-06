"use client";

import { createContext, useContext } from "react";
import { DEFAULT_COMPANY_TIMEZONE } from "@/lib/timezone";

// § BUG ditemukan 2026-09-06 (audit timezone menyeluruh, diminta user) —
// `company.timezone` (setting admin sejak Fase 00/01) sebelumnya TIDAK
// PERNAH dipakai di kode manapun untuk format tanggal — semua halaman
// hardcode "Asia/Jakarta" langsung (§ lib/utils.ts `formatDate`, versi
// lama). Provider ini SATU sumber nilai timezone perusahaan yang AKTIF
// (dibaca dari `GET /settings/public` di root layout, Server Component,
// § app/layout.tsx), dipakai lewat `useCompanyTimezone()` di komponen
// client mana pun yang perlu format tanggal — supaya kalau admin ganti
// `company.timezone`, SEMUA tampilan tanggal ikut berubah konsisten,
// bukan cuma decorative setting yang tidak berefek.
const CompanyTimezoneContext = createContext<string>(DEFAULT_COMPANY_TIMEZONE);

export function CompanyTimezoneProvider({ timezone, children }: { timezone: string; children: React.ReactNode }) {
  return <CompanyTimezoneContext.Provider value={timezone}>{children}</CompanyTimezoneContext.Provider>;
}

// § fallback default kalau dipanggil di luar Provider (seharusnya tidak
// pernah terjadi karena Provider ada di root layout — fallback ini
// jaga-jaga, bukan pola resmi).
export function useCompanyTimezone(): string {
  return useContext(CompanyTimezoneContext);
}
