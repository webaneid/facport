"use client";

import { createContext, useContext } from "react";

// § Fase 125 poin 3 lanjutan (2026-09-15) — value-nya SUDAH dihitung
// SERVER-SIDE di `app/app/(protected)/layout.tsx` (`activeDataUsaha.isOwner`,
// dari `GET /me/data-usaha`) dan diteruskan lewat prop `AppShell` →
// `DataUsahaOwnerProvider` — BEDA dari `PermissionsProvider`
// (`use-permissions.tsx`) yang fetch SENDIRI via `useEffect`. Di sini
// TIDAK ADA fetch ulang sama sekali, cuma exposed lewat Context supaya
// Client Component MANA PUN di bawah `AppShell` (12 halaman Riwayat
// per-modul, dst) bisa baca status kepemilikan Data Usaha AKTIF tanpa
// prop-drilling atau `GET /me/data-usaha` berulang per halaman.
// Default context (dipakai kalau Provider entah kenapa tidak mount,
// mis. dalam test) `true` — konsisten konvensi "assume owner kecuali
// eksplisit false" yang sudah dipakai `ImportBatchTable`.
const DataUsahaOwnerContext = createContext<boolean>(true);

export function DataUsahaOwnerProvider({ isOwner, children }: { isOwner: boolean; children: React.ReactNode }) {
  return <DataUsahaOwnerContext.Provider value={isOwner}>{children}</DataUsahaOwnerContext.Provider>;
}

export function useIsDataUsahaOwner(): boolean {
  return useContext(DataUsahaOwnerContext);
}
