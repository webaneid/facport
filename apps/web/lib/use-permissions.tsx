"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

const PermissionsContext = createContext<string[]>([]);

// § Fase 26, ADR-0024 — Context yang fetch `GET /me` SEKALI (Fase 19
// sudah balas `permissions: string[]`), BUKAN `useSession()` Better
// Auth (spec sumber `master-typescript` pakai itu, tapi project ini
// sudah punya jalur lebih sederhana — lihat ADR-0025 rasional serupa
// untuk keputusan yang sama). Mount SEKALI di `AppShell` (admin & app),
// bukan per-halaman — supaya cuma 1 kali fetch per sesi, bukan
// berulang tiap komponen yang butuh cek permission.
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const res = await api.me.get();
      if (res.data) setPermissions((res.data as unknown as { permissions: string[] }).permissions);
    }
    load();
  }, []);

  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): string[] {
  return useContext(PermissionsContext);
}

export function usePermission(key: string): boolean {
  return usePermissions().includes(key);
}
