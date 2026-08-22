import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// § ADR-0004 "Timezone" — DB selalu UTC, convert cuma saat tampil.
// Timezone perusahaan Asia/Jakarta (§ Settings Page, project_facport_overview).
export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}
