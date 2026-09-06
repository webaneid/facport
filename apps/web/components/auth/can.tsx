"use client";

import { usePermissions } from "@/lib/use-permissions";

// § Fase 26, ADR-0024 — GANTI `components/ui/permission-guard.tsx`
// (Fase 19, 0 pemakai — dibangun presentational-only, "permissions"
// dioper manual sebagai prop, belum pernah di-wire ke sumber data
// nyata). Sekarang baca dari `usePermissions()` (Context, § `lib/use-permissions.tsx`)
// — TIDAK ada migrasi caller karena memang belum ada satupun.
//
// INI HANYA UI HINT (sembunyikan tombol yang toh akan ditolak backend),
// BUKAN pengganti authorization — endpoint TETAP WAJIB dijaga
// `permissionPlugin`/`userHasPermission` di `apps/api` (§ architecture-auth.md).
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const permissions = usePermissions();
  return permissions.includes(permission) ? children : fallback;
}
