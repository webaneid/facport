import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { getPublicSettings } from "@/lib/get-public-settings";
import { CompanyTimezoneProvider } from "@/components/company-timezone-provider";
import { DEFAULT_COMPANY_TIMEZONE } from "@/lib/timezone";
import "./globals.css";

// § architecture-app-dashboard.md — font profesional, self-host otomatis
// oleh Next.js (bukan request ke Google Fonts saat runtime).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// § Fase 12, ADR-0017 — favicon company dinamis (bisa diganti admin di
// `/admin/settings`), SATU root layout ini melayani ketiga surface
// (landing/admin/app dibedakan lewat subdomain, bukan layout terpisah),
// jadi cukup 1 tempat buat inject favicon ke semuanya. `generateMetadata`
// (bukan `export const metadata` statis) supaya bisa fetch settings dulu.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const favicon = settings["company.favicon"];

  return {
    title: "Facport",
    description: "Jembatan otomatis impor data Excel ke Accurate Online.",
    icons: favicon
      ? {
          icon: [
            ...(favicon["32"] ? [{ url: favicon["32"], sizes: "32x32", type: "image/png" }] : []),
            ...(favicon["16"] ? [{ url: favicon["16"], sizes: "16x16", type: "image/png" }] : []),
          ],
          apple: favicon["180"] ? [{ url: favicon["180"], sizes: "180x180" }] : undefined,
          other: favicon["512"]
            ? [{ rel: "icon", url: favicon["512"], sizes: "512x512", type: "image/png" }]
            : undefined,
        }
      : undefined,
  };
}

// § Fase 43 (audit timezone 2026-09-06) — `async` supaya bisa fetch
// `company.timezone` sekali di SINI (dipakai ketiga surface, Next.js
// dedup otomatis dengan fetch yang sama di `generateMetadata` lewat
// request memoization) dan sediakan ke semua Client Component descendant
// lewat Context — lihat `components/company-timezone-provider.tsx`.
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await getPublicSettings();
  const timezone = settings["company.timezone"] ?? DEFAULT_COMPANY_TIMEZONE;

  return (
    <html lang="id" className={inter.variable}>
      <body>
        <CompanyTimezoneProvider timezone={timezone}>{children}</CompanyTimezoneProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
