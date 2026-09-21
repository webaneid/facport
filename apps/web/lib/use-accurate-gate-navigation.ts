"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// § Fase 144 — pembungkus tipis hook navigasi untuk komponen gerbang Accurate. Ada supaya tes komponen bisa me-mock MODUL INI
// (spesifier unik) alih-alih `next/navigation`: `mock.module` di bun.test bersifat global per proses dan tes lain (auth/*)
// sudah mendaftarkan `next/navigation` dengan bentuk berbeda — saling menimpa dan membuat tes bergantung urutan file.
export function useAccurateGateNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  return { pathname, search, refresh: () => router.refresh(), replace: (path: string) => router.replace(path) };
}
