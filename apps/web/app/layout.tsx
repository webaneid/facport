import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { getPublicSettings } from "@/lib/get-public-settings";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
